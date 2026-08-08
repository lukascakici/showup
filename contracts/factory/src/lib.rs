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

use interfaces::{EventClient, ForfeitPolicy, ReputationClient, TTL_EXTEND_TO, TTL_THRESHOLD};
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
}

#[contracttype]
pub enum DataKey {
    Admin,
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
        env.storage().instance().set(&DataKey::Count, &(count + 1));
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
