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
///
/// **This struct is frozen.** It is the *stored* type at `DataKey::Score`, and
/// every entry in the live ledger was written by an older wasm — so adding a
/// field to it does not give those entries the field, it makes every client
/// generated from the new spec fail to decode them. The first engagement's
/// scores are graded evidence and have to stay readable at the same address.
///
/// It is also what the event contract reads through `interfaces::Score` to
/// enforce a `Score` gate, and *that* contract is deployed. Changing the shape
/// here would break admission on every gated event already on the factory.
///
/// Everything the record has grown since lives under its own key and is
/// assembled at read time by `get_record`. See `Extras`.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Score {
    pub shows: u32,
    pub no_shows: u32,
}

/// What a record carries beyond turning up, stored separately so it can grow.
///
/// One key rather than three, because these are always read together and a
/// Soroban storage entry is rented individually: three keys per member would be
/// three leases to renew for a record that is one thing.
#[contracttype]
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Extras {
    /// Vouches this member has signed for other people.
    pub vouches_given: u32,
    /// How many of those turned out to be for somebody who never showed up.
    ///
    /// The half of vouching that makes it cost something: a vouch is a public
    /// statement with the voucher's own record behind it.
    pub vouches_broken: u32,
    /// Events this member created, counted when each one settles.
    pub events_organised: u32,
}

/// The whole record, assembled at read time.
///
/// A return-only struct, never stored — which is exactly why it is allowed to
/// keep growing where `Score` is not. A client built against an older spec
/// simply does not call this.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Record {
    pub shows: u32,
    pub no_shows: u32,
    pub vouches_given: u32,
    pub vouches_broken: u32,
    pub events_organised: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    /// The only address allowed to register events.
    Factory,
    /// Allowlist membership for one event contract.
    Event(Address),
    Score(Address),
    /// Added after the first revision, and keyed separately for that reason —
    /// see `Score`. A member who predates it has no such entry, which is why
    /// the reader below defaults rather than unwraps.
    Extras(Address),
}

/// Published when a lease is renewed, so a record kept alive by a stranger is
/// visible as exactly that rather than looking like it never expired.
#[contractevent]
pub struct RecordRenewed {
    pub member: Address,
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

/// Mirrors `interfaces::TTL_EXTEND_TO` / `TTL_THRESHOLD`, copied rather than
/// imported — see this crate's `Cargo.toml` for why linking `interfaces` here
/// would publish a `ForfeitPolicy` type on a reputation ledger.
///
/// Soroban state is rented. Without these, entries archive in roughly a week on
/// Testnet and stop being readable at all.
const LEDGERS_PER_DAY: u32 = 17_280;
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
        Self::bump_instance(&env);
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
        Self::bump_instance(&env);
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
    ///
    /// Deliberately unchanged, and it must stay that way: this is what the
    /// deployed event contract calls to enforce a `Score` gate, without a
    /// `try_`. A different shape here would trap every gated `rsvp` on the
    /// factory rather than refusing it.
    pub fn get_score(env: Env, member: Address) -> Score {
        Self::score_of(&env, &member)
    }

    /// The whole record: turning up, vouching, and organising.
    ///
    /// Everything `get_score` returns and everything added since, in one read,
    /// because a profile page needs all of it and each extra call is latency in
    /// front of somebody deciding whether to vouch for a stranger.
    pub fn get_record(env: Env, member: Address) -> Record {
        let score = Self::score_of(&env, &member);
        let extras = Self::extras_of(&env, &member);
        Record {
            shows: score.shows,
            no_shows: score.no_shows,
            vouches_given: extras.vouches_given,
            vouches_broken: extras.vouches_broken,
            events_organised: extras.events_organised,
        }
    }

    /// Count an event against the address that created it. Registered events only.
    ///
    /// Called by the event contract when it settles, so the count means "ran an
    /// event to the end" rather than "deployed a contract once". An organizer
    /// who abandons an event never earns the line.
    pub fn record_organised(env: Env, event: Address, organizer: Address) -> Result<(), Error> {
        Self::require_event(&env, &event)?;
        event.require_auth();

        let mut extras = Self::extras_of(&env, &organizer);
        extras.events_organised = extras.events_organised.saturating_add(1);
        Self::put_extras(&env, &organizer, &extras);
        Ok(())
    }

    /// Renew a record's lease. **Anyone may call this, and anyone pays.**
    ///
    /// Soroban rents state: an entry nobody touches for long enough is archived
    /// and stops being readable. Every write here already extends the lease of
    /// what it wrote, which quietly means a record only survives while its owner
    /// keeps attending things — so a reputation would expire precisely for the
    /// person who stopped needing to prove it, and the only way back would be
    /// through us.
    ///
    /// So this takes no auth and no admin. A record is a claim its owner should
    /// not have to ask permission to keep, and anyone who cares about it — the
    /// member, a friend, an organizer who wants to admit them next month — can
    /// pay the few stroops to keep it alive. That is what makes the ledger
    /// outlive our goodwill, which is the durability the SOW scopes explicitly.
    ///
    /// Renewing a record nobody has ever written is a no-op rather than an
    /// error: there is no lease to extend, and creating an empty one to renew
    /// would let anybody fill the ledger with blank entries at our expense.
    pub fn renew(env: Env, member: Address) {
        for key in [
            DataKey::Score(member.clone()),
            DataKey::Extras(member.clone()),
        ] {
            if env.storage().persistent().has(&key) {
                Self::bump(&env, &key);
            }
        }
        Self::bump_instance(&env);
        RecordRenewed { member }.publish(&env);
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
        Self::bump_instance(&env);
        Ok(())
    }

    /// Replace this contract's own code, keeping its address and its state.
    /// Admin only.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Self::bump_instance(&env);
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
        Self::require_event(env, event)?;
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
        Self::bump_instance(env);

        ScoreChanged {
            member,
            shows: updated.shows,
            no_shows: updated.no_shows,
        }
        .publish(env);
        Ok(())
    }

    fn extras_of(env: &Env, member: &Address) -> Extras {
        env.storage()
            .persistent()
            .get(&DataKey::Extras(member.clone()))
            .unwrap_or_default()
    }

    fn put_extras(env: &Env, member: &Address, extras: &Extras) {
        let key = DataKey::Extras(member.clone());
        env.storage().persistent().set(&key, extras);
        Self::bump(env, &key);
        Self::bump_instance(env);
    }

    /// The allowlist half of the write gate, shared by every writer.
    fn require_event(env: &Env, event: &Address) -> Result<(), Error> {
        Self::require_initialized(env)?;
        if env
            .storage()
            .persistent()
            .has(&DataKey::Event(event.clone()))
        {
            Ok(())
        } else {
            Err(Error::NotAnEvent)
        }
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

    /// Push the instance entry out, on every call that writes anything.
    ///
    /// The instance entry holds the admin and the factory — this contract's
    /// identity. Scores were already being extended; the instance was not, so
    /// the ledger would have kept perfectly healthy 90-day scores inside a
    /// contract that had archived out from under them after 7 days.
    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

mod test;
