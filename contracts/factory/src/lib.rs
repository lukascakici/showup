#![no_std]

//! Showup — the event factory.
//!
//! Anyone can open an event from their own wallet: the factory deploys a fresh
//! event contract, initializes it in the same transaction, and keeps the list of
//! everything it has ever created so the frontend has one address to read from.
//!
//! It is also the root of trust for the reputation ledger. Being the only
//! address reputation accepts registrations from is what makes "only a real
//! Showup event can write a score" true, rather than a claim.
//!
//! Three admin-gated functions keep the factory from freezing the way its first
//! deployment did: `set_event_wasm_hash` re-points new events at a new event
//! revision, `set_reputation` re-points them at a new ledger, and `upgrade`
//! replaces the factory's own code. Together they mean a change to any contract
//! in the system costs an upload and an admin call — not a new factory address,
//! a binding regeneration and a v2/v3 split through every doc.
//!
//! The admin itself moves through `propose_admin` + `accept_admin`, in two
//! transactions signed by the two different keys — so the role can be handed to
//! a hardware wallet without a mistyped address being able to strand all three
//! of the above. See `propose_admin`.

use interfaces::{
    Admission, EventClient, ForfeitPolicy, ReputationClient, TTL_EXTEND_TO, TTL_THRESHOLD,
};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    String, Vec,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    /// `accept_admin` with nobody proposed, or after the proposal was withdrawn.
    NoPendingAdmin = 3,
    /// The event counter, which is also the deploy salt, has no room left.
    CounterExhausted = 4,
}

#[contracttype]
pub enum DataKey {
    Admin,
    /// Proposed, not yet in force. See `propose_admin`.
    PendingAdmin,
    EventWasmHash,
    Events,
    /// Monotonic counter; doubles as the deploy salt so every event gets its own
    /// address.
    Count,
    /// The reputation ledger, if one is wired up. Absent is a valid state: the
    /// factory predates reputation and still has to work without it.
    Reputation,
}

#[contractevent]
pub struct EventCreated {
    pub event: Address,
    pub organizer: Address,
    /// Carried on the event so a feed or an indexer can show names without
    /// reading every event contract one at a time.
    pub title: String,
    pub starts_at: u64,
    pub deposit: i128,
    pub capacity: u32,
}

/// Published on both halves of a handover, so the move of the key that governs
/// this system is watchable without reading contract state.
#[contractevent]
pub struct AdminProposed {
    pub new_admin: Address,
}

#[contractevent]
pub struct AdminChanged {
    pub previous: Address,
    pub current: Address,
}

#[contract]
pub struct EventFactory;

#[contractimpl]
impl EventFactory {
    /// Register the factory against the uploaded event wasm.
    pub fn initialize(env: Env, admin: Address, event_wasm_hash: BytesN<32>) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::EventWasmHash, &event_wasm_hash);
        env.storage()
            .instance()
            .set(&DataKey::Events, &Vec::<Address>::new(&env));
        env.storage().instance().set(&DataKey::Count, &0u32);
        Self::bump_instance(&env);
        Ok(())
    }

    /// Deploy and initialize an event owned by `organizer`.
    ///
    /// The organizer authorizes this whole call tree, which is what lets the
    /// event's own `initialize` pull the fee pool out of their wallet as part of
    /// the same transaction.
    #[allow(clippy::too_many_arguments)]
    pub fn create_event(
        env: Env,
        organizer: Address,
        title: String,
        starts_at: u64,
        token: Address,
        deposit: i128,
        fee_allowance: i128,
        capacity: u32,
        code_hash: BytesN<32>,
        policy: ForfeitPolicy,
        admission: Admission,
    ) -> Result<Address, Error> {
        let wasm_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::EventWasmHash)
            .ok_or(Error::NotInitialized)?;
        organizer.require_auth();

        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let mut salt = [0u8; 32];
        salt[..4].copy_from_slice(&count.to_be_bytes());
        let salt = BytesN::from_array(&env, &salt);

        let event = env
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm_hash, ());

        // The ledger is read once and used twice, so an event can never be
        // registered against one ledger while being configured to write to
        // another.
        let reputation = Self::reputation(&env);

        EventClient::new(&env, &event).initialize(
            &organizer,
            &title,
            &starts_at,
            &token,
            &deposit,
            &fee_allowance,
            &capacity,
            &code_hash,
            &policy,
            &reputation,
            &admission,
        );

        // Deliberately not a `try_` call. If the ledger is configured but won't
        // take the registration, the whole creation fails and the organizer's
        // fee pool stays in their wallet — better than handing them an event
        // that looks normal and silently records nobody. The event contract's
        // own calls into reputation are the opposite case, and are guarded:
        // there, a failure would be sitting on top of a guest's refund.
        if let Some(address) = &reputation {
            ReputationClient::new(&env, address).register_event(&event);
        }

        let mut events = Self::events_list(&env);
        events.push_back(event.clone());
        env.storage().instance().set(&DataKey::Events, &events);
        // Checked, and deliberately not saturating. The counter doubles as the
        // deploy salt, so every event's address is derived from it — a count
        // that stopped moving would start handing new events the address of an
        // existing one, which is a far worse failure than refusing to create
        // the 4,294,967,296th.
        let next = count.checked_add(1).ok_or(Error::CounterExhausted)?;
        env.storage().instance().set(&DataKey::Count, &next);
        Self::bump_instance(&env);

        EventCreated {
            event: event.clone(),
            organizer,
            title,
            starts_at,
            deposit,
            capacity,
        }
        .publish(&env);
        Ok(event)
    }

    /// Point new events at a new event wasm. Admin only.
    ///
    /// Read at deploy time on every `create_event`, so this takes effect on the
    /// next event and leaves every existing one exactly as it was — an event
    /// people have already locked deposits in must never change underneath them.
    pub fn set_event_wasm_hash(env: Env, event_wasm_hash: BytesN<32>) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::EventWasmHash, &event_wasm_hash);
        Self::bump_instance(&env);
        Ok(())
    }

    /// Wire the factory to a reputation ledger, or move it to another one.
    /// Admin only.
    ///
    /// This is the second half of the circular setup: reputation is deployed
    /// knowing the factory's address, then the factory is pointed back here.
    pub fn set_reputation(env: Env, reputation: Address) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Reputation, &reputation);
        Self::bump_instance(&env);
        Ok(())
    }

    /// Nominate the next admin. Admin only, and it changes nothing on its own.
    ///
    /// Handing the key over is two transactions rather than one, and the second
    /// is signed by the key being handed to. A plain setter would mean a
    /// mistyped address leaves the factory permanently ungovernable — no
    /// `set_event_wasm_hash`, no `set_reputation`, no `upgrade`, and no way
    /// back. An address nobody controls can never call `accept_admin`, so the
    /// mistake cannot complete.
    ///
    /// That matters most for the move this was written for: taking the admin off
    /// a laptop keypair and onto a hardware wallet. It also keeps both halves as
    /// ordinary single-signer transactions, which is what a hardware wallet can
    /// actually sign — requiring the new admin to authorise inside the *same*
    /// call would need a signed authorization entry from an address that is not
    /// the transaction's source.
    ///
    /// Proposing again replaces the previous nomination, so a wrong address is
    /// corrected by calling this a second time.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        Self::bump_instance(&env);
        AdminProposed { new_admin }.publish(&env);
        Ok(())
    }

    /// Take the admin role. Callable only by the address `propose_admin` named.
    ///
    /// The proposal is consumed whether or not it is ever used again, so an
    /// accepted handover leaves nothing pending behind it.
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(Error::NoPendingAdmin)?;
        pending.require_auth();

        let previous = Self::admin(&env)?;
        env.storage().instance().set(&DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        Self::bump_instance(&env);
        AdminChanged {
            previous,
            current: pending,
        }
        .publish(&env);
        Ok(())
    }

    /// Replace the factory's own code, keeping its address and its event list.
    /// Admin only.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Self::bump_instance(&env);
        Ok(())
    }

    pub fn list_events(env: Env) -> Vec<Address> {
        Self::events_list(&env)
    }

    pub fn get_event_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        Self::admin(&env)
    }

    /// Who has been nominated but has not accepted yet. `None` most of the time
    /// — a handover in progress is the only state where this answers.
    pub fn get_pending_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingAdmin)
    }

    /// Which event revision new events get. Lets a reviewer check that the
    /// deployed factory really is pointing at the wasm the docs claim.
    pub fn get_event_wasm_hash(env: Env) -> Result<BytesN<32>, Error> {
        env.storage()
            .instance()
            .get(&DataKey::EventWasmHash)
            .ok_or(Error::NotInitialized)
    }

    /// `None` until an admin wires one up.
    pub fn get_reputation(env: Env) -> Option<Address> {
        Self::reputation(&env)
    }

    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    fn reputation(env: &Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Reputation)
    }

    /// Push the factory's storage out of reach of the archiver.
    ///
    /// Everything the factory knows — the admin, the event wasm hash, the
    /// reputation address and the list of every event ever created — is one
    /// instance entry. If it archives, `list_events` stops answering and the
    /// whole app looks empty even though every event contract is still fine.
    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    fn events_list(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Events)
            .unwrap_or_else(|| Vec::new(env))
    }
}

mod test;
