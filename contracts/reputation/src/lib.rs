#![no_std]

//! Showup — the show-up reputation ledger.
//!
//! One contract holds every member's attendance record across every Showup
//! event. Events write to it, nobody else can: the factory registers each event
//! it deploys, and a score write is only accepted from a registered event that
//! also authorizes the call itself.
//!
//! ```text
//! factory ──register_event(e)──▶ allowlist
//!                                    │
//! event e ──record_checkin(e, alice)─┴─▶ Score { shows +1 }
//!         ──record_no_show(e, bob) ────▶ Score { no_shows +1 }
//! ```
//!
//! A score is two counters rather than one number. `shows` and `no_shows` say
//! what actually happened; turning that into a percentage, a badge or a
//! threshold is a presentation decision, and freezing one formula on-chain would
//! make every future change a contract upgrade.
//!
//! Reading an address nobody has ever seen returns `{0, 0}` instead of an error,
//! so a caller never has to special-case a newcomer.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    /// A score write from an address the factory never registered.
    NotAnEvent = 3,
}

/// A member's attendance record, counted rather than scored.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Score {
    pub shows: u32,
    pub no_shows: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    /// The only address allowed to register events.
    Factory,
    /// Allowlist membership for one event contract.
    Event(Address),
    Score(Address),
}

#[contractevent]
pub struct EventRegistered {
    pub event: Address,
}

/// Published on every write, so a reviewer can watch a score rise on a check-in
/// and fall on a finalized no-show without reading contract state at all.
#[contractevent]
pub struct ScoreChanged {
    pub member: Address,
    pub shows: u32,
    pub no_shows: u32,
}

/// Testnet and Mainnet both close a ledger roughly every 5 seconds.
const LEDGERS_PER_DAY: u32 = 17_280;
/// State inside an event contract only has to outlive that one event. A
/// reputation entry is the opposite: it is the thing that carries across events,
/// so it gets bumped back to a long life on every write.
const TTL_EXTEND_TO: u32 = LEDGERS_PER_DAY * 90;
const TTL_THRESHOLD: u32 = LEDGERS_PER_DAY * 30;

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    /// Bind the ledger to its admin and to the factory that may register events.
    ///
    /// The factory address is a parameter rather than something discovered
    /// later because of the deployment order: the factory is deployed first,
    /// this contract second with the factory's address in hand, and only then is
    /// the factory pointed back at this one. Both directions stay changeable —
    /// see `set_factory`.
    pub fn initialize(env: Env, admin: Address, factory: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Factory, &factory);
        Ok(())
    }

    /// Let an event contract write scores. Factory only, idempotent.
    ///
    /// This is the whole gate. The factory calls it in the same transaction that
    /// deploys the event, so the allowlist can only ever contain contracts the
    /// factory itself built from a wasm hash the admin chose.
    pub fn register_event(env: Env, event: Address) -> Result<(), Error> {
        let factory = Self::factory(&env)?;
        factory.require_auth();

        let key = DataKey::Event(event.clone());
        if !env.storage().persistent().has(&key) {
            env.storage().persistent().set(&key, &true);
            EventRegistered {
                event: event.clone(),
            }
            .publish(&env);
        }
        Self::bump(&env, &key);
        Ok(())
    }

    /// Record that `member` showed up to `event`.
    pub fn record_checkin(env: Env, event: Address, member: Address) -> Result<(), Error> {
        Self::record(&env, &event, member, 1, 0)
    }

    /// Record that `member` reserved a spot at `event` and never checked in.
    pub fn record_no_show(env: Env, event: Address, member: Address) -> Result<(), Error> {
        Self::record(&env, &event, member, 0, 1)
    }

    /// A member's record. Unknown addresses read as `{0, 0}`.
    pub fn get_score(env: Env, member: Address) -> Score {
        Self::score_of(&env, &member)
    }

    /// Whether the gate is open for `event` — the one read that lets a reviewer
    /// verify the allowlist from outside.
    pub fn is_registered(env: Env, event: Address) -> bool {
        env.storage().persistent().has(&DataKey::Event(event))
    }

    /// Point the ledger at a different factory. Admin only.
    ///
    /// The factory has to be redeployed whenever the event wasm changes in a way
    /// its own `upgrade` cannot absorb; without this setter, that would strand
    /// every score already recorded here.
    pub fn set_factory(env: Env, factory: Address) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Factory, &factory);
        Ok(())
    }

    /// Replace this contract's own code, keeping its address and its state.
    /// Admin only.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        Self::admin(&env)
    }

    pub fn get_factory(env: Env) -> Result<Address, Error> {
        Self::factory(&env)
    }

    /// The single write path, behind the single gate.
    ///
    /// Both conditions are load-bearing. The allowlist proves the caller is an
    /// event the factory built; `require_auth` proves the call is genuinely
    /// coming from that contract rather than from somebody passing its address
    /// as an argument.
    ///
    /// There is deliberately no per-`(event, member)` double-write guard. The
    /// event contract already calls each of these exactly once — `check_in`
    /// flips attendance to `CheckedIn` and rejects a second attempt, and
    /// `finalize` is terminal — so the guarantee is enforced where the state
    /// already lives, instead of paying for another storage entry per member per
    /// event.
    fn record(
        env: &Env,
        event: &Address,
        member: Address,
        shows: u32,
        no_shows: u32,
    ) -> Result<(), Error> {
        Self::require_initialized(env)?;
        if !env
            .storage()
            .persistent()
            .has(&DataKey::Event(event.clone()))
        {
            return Err(Error::NotAnEvent);
        }
        event.require_auth();

        let current = Self::score_of(env, &member);
        // Saturating rather than wrapping: the release profile has overflow
        // checks on, so a plain `+` would trap — and a trapped score write must
        // never be able to take a guest's refund down with it.
        let updated = Score {
            shows: current.shows.saturating_add(shows),
            no_shows: current.no_shows.saturating_add(no_shows),
        };

        let key = DataKey::Score(member.clone());
        env.storage().persistent().set(&key, &updated);
        Self::bump(env, &key);

        ScoreChanged {
            member,
            shows: updated.shows,
            no_shows: updated.no_shows,
        }
        .publish(env);
        Ok(())
    }

    fn score_of(env: &Env, member: &Address) -> Score {
        env.storage()
            .persistent()
            .get(&DataKey::Score(member.clone()))
            .unwrap_or(Score {
                shows: 0,
                no_shows: 0,
            })
    }

    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    fn factory(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Factory)
            .ok_or(Error::NotInitialized)
    }

    /// Distinguishes "never set up" from "not an event" — without it an
    /// uninitialized contract would answer `NotAnEvent` to everything, which is
    /// true but useless when something is misconfigured.
    fn require_initialized(env: &Env) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            Ok(())
        } else {
            Err(Error::NotInitialized)
        }
    }

    fn bump(env: &Env, key: &DataKey) {
        env.storage()
            .persistent()
            .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

mod test;
