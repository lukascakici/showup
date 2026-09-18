#![no_std]

//! Showup — the per-event deposit contract.
//!
//! Flow: the organizer creates an event with a deposit amount and a capacity,
//! funding a pool that reimburses attendees' transaction fees. Guests `rsvp` by
//! locking the deposit. On the day the organizer calls `open_checkin` and shares
//! the secret (as a link/QR); a guest `check_in`s with it and gets their deposit
//! back plus the fee reimbursement in the same call. When the organizer
//! `finalize`s, the deposits of everyone who never showed are forfeited — either
//! to the organizer or split among the people who did show, per the policy fixed
//! at creation.
//!
//! ```text
//! Reserving  ──open_checkin──▶  CheckingIn  ──┐
//!     ▲                              │        ├─finalize─▶  Finalized
//!     └────────reopen_rsvp───────────┘        │             (terminal)
//!     └───────────────────finalize────────────┘
//! ```
//!
//! Who may `rsvp` at all is the event's `Admission` mode, fixed at creation and
//! enforced here rather than by a screen. Under `Approval` the guest's path
//! gains a step in front of the deposit:
//!
//! ```text
//! apply ──▶ Applied ──approve──▶ Approved ──rsvp──▶ Reserved
//!              └─────decline───▶ Declined (terminal)
//! ```
//!
//! Nothing is taken until that `rsvp`, and it is the applicant's own
//! transaction — an approval that could pull a deposit would mean anyone could
//! be charged for being liked.
//!
//! The phases are what stop someone who was forwarded the check-in link from
//! reserving and checking in on the spot without ever attending — which would
//! both pocket the fee allowance and dilute the real attendees' share of the
//! forfeited deposits.

use interfaces::{ReputationClient, MAX_TITLE_BYTES, TTL_EXTEND_TO, TTL_THRESHOLD};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, String, Vec,
};

pub use interfaces::{Admission, ForfeitPolicy};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidDeposit = 3,
    InvalidCapacity = 4,
    InvalidFeeAllowance = 5,
    AlreadyReserved = 6,
    EventFull = 7,
    NotReserved = 8,
    AlreadyCheckedIn = 9,
    WrongCode = 10,
    AlreadyFinalized = 11,
    /// `rsvp` after the organizer opened check-in.
    ReservationsClosed = 12,
    /// `check_in` before the organizer opened it.
    CheckInNotOpen = 13,
    /// `open_checkin` / `reopen_rsvp` from a phase that doesn't allow it.
    WrongPhase = 14,
    /// Empty, or longer than `MAX_TITLE_BYTES`.
    InvalidTitle = 15,
    /// Zero. An event with no start time cannot be sorted or described.
    InvalidStartTime = 16,
    /// `rsvp` on a `Score`-gated event from a record below the threshold.
    ScoreTooLow = 17,
    /// `rsvp` on an `Approval` event from someone the organizer never approved.
    NotApplied = 18,
    /// A second `apply` from the same guest.
    AlreadyApplied = 19,
    /// A host-only call from an address that is not a host.
    NotAHost = 20,
    /// A call that only makes sense under a different admission mode — applying
    /// to an open event, or vouching for a guest at one.
    WrongAdmissionMode = 21,
    /// A gate that needs a reputation ledger on an event created without one.
    NoReputation = 22,
    /// `remove_host` aimed at the creator, who is permanent.
    CannotRemoveCreator = 23,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Phase {
    /// Guests can reserve; nobody can check in yet.
    Reserving,
    /// The organizer has started check-in, so reservations are closed.
    CheckingIn,
    /// Settled. Terminal — there is deliberately no way back.
    Finalized,
}

/// Where somebody stands with one event.
///
/// The first three exist only under `Admission::Approval` and none of them has
/// any money behind it — an application is a question, and asking it costs
/// nothing. `Reserved` is the first state that means a deposit is locked, which
/// is why it is also the first state the reserved list and the capacity count
/// know about.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Attendance {
    /// Asked to come, not yet answered.
    Applied,
    /// Answered yes. May now reserve, and that is when the deposit moves.
    Approved,
    /// Answered no. Terminal, so a declined applicant cannot re-apply their way
    /// back into an organizer's inbox.
    Declined,
    Reserved,
    CheckedIn,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// Whoever created the event. Permanent, and the only address forfeited
    /// deposits are ever paid to — see `hosts` for why it is kept separate.
    pub organizer: Address,
    /// Everyone who may run the event: open check-in, reopen reservations,
    /// answer applications, finalize, and change this list.
    ///
    /// The organizer is always `hosts[0]` and cannot be removed, so the two
    /// fields overlap by exactly one address on purpose. `organizer` answers
    /// "whose event is this, and where does forfeited money go" — a question
    /// that must have one unambiguous answer no matter who else is helping —
    /// and `hosts` answers "who may act", which is a list.
    pub hosts: Vec<Address>,
    /// What the event is called. Up to `MAX_TITLE_BYTES` of UTF-8.
    ///
    /// On-chain rather than in the off-chain index, and that is the whole reason
    /// the index needs no login: `/api/events/sync` can only store what it can
    /// re-read from a contract, so a title it could not verify would be a title
    /// anybody could set.
    pub title: String,
    /// Unix seconds, UTC. **Informational.**
    ///
    /// The phase machine is the single authority on what is allowed when, and a
    /// second time-based authority would contradict it — `reopen_rsvp` exists
    /// precisely so a latecomer can still reserve after the event has begun.
    /// This earns its place by making events sortable and by letting the UI say
    /// "starts in 3 hours".
    pub starts_at: u64,
    pub token: Address,
    /// Locked by each guest to reserve a spot.
    pub deposit: i128,
    /// Paid back to each guest on check-in, on top of the deposit, to cover the
    /// fees they spent on `rsvp` + `check_in`. Funded by the organizer upfront.
    pub fee_allowance: i128,
    pub capacity: u32,
    /// sha256 of the check-in secret. The secret itself never touches the chain
    /// until a guest reveals it by checking in.
    pub code_hash: BytesN<32>,
    pub policy: ForfeitPolicy,
    /// Where show-up scores are recorded, if the factory had a ledger wired up
    /// when this event was created. Fixed for the event's whole life: an event
    /// people have locked deposits in must not have its scoring moved
    /// underneath them, and `None` has to keep working because events created
    /// before reputation existed still run.
    pub reputation: Option<Address>,
    /// Who may reserve a spot. Fixed at creation, like the deposit and the
    /// capacity: the terms somebody agreed to when they locked their money must
    /// not be editable by the person holding it.
    pub admission: Admission,
}

#[contracttype]
pub enum DataKey {
    Config,
    Phase,
    Reserved,
    CheckedIn,
    Attendance(Address),
}

#[contractevent]
pub struct Reserved {
    pub guest: Address,
    pub deposit: i128,
    pub spots_left: u32,
}

#[contractevent]
pub struct CheckedIn {
    pub guest: Address,
    /// deposit + fee_allowance, returned in this same call.
    pub refunded: i128,
}

#[contractevent]
pub struct Finalized {
    pub showed: u32,
    pub no_shows: u32,
    /// Total deposits forfeited by no-shows.
    pub forfeited: i128,
}

#[contractevent]
pub struct PhaseChanged {
    pub phase: Phase,
}

#[contractevent]
pub struct HostAdded {
    pub host: Address,
}

#[contractevent]
pub struct HostRemoved {
    pub host: Address,
}

#[contractevent]
pub struct ApplicationReceived {
    pub applicant: Address,
}

/// One event for both answers, because the interesting thing to watch is that
/// an application was answered at all — an organizer who approves everybody and
/// one who is actually choosing look identical until you read the flag.
#[contractevent]
pub struct ApplicationAnswered {
    pub applicant: Address,
    pub approved: bool,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScoreKind {
    CheckIn,
    NoShow,
}

/// Published when a write to the reputation ledger failed and was swallowed.
///
/// Swallowing it is deliberate — see `record_score` — but swallowing it
/// *silently* would mean a ledger could quietly stop recording and nobody would
/// find out until someone compared two sets of numbers. This makes every
/// dropped write visible on-chain.
#[contractevent]
pub struct ReputationSkipped {
    pub member: Address,
    pub kind: ScoreKind,
}

#[contract]
pub struct EventContract;

#[contractimpl]
impl EventContract {
    /// Create the event and fund the fee-reimbursement pool.
    ///
    /// The organizer transfers `fee_allowance * capacity` in, so every guest who
    /// shows up can be made whole for the fees they spend. Whatever is left over
    /// (the no-shows never cost anything) goes back to the organizer on
    /// `finalize`.
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
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
        reputation: Option<Address>,
        admission: Admission,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        if title.is_empty() || title.len() > MAX_TITLE_BYTES {
            return Err(Error::InvalidTitle);
        }
        if starts_at == 0 {
            return Err(Error::InvalidStartTime);
        }
        if deposit <= 0 {
            return Err(Error::InvalidDeposit);
        }
        if fee_allowance < 0 {
            return Err(Error::InvalidFeeAllowance);
        }
        if capacity == 0 {
            return Err(Error::InvalidCapacity);
        }
        organizer.require_auth();

        let pool = fee_allowance * i128::from(capacity);
        if pool > 0 {
            let this = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&organizer, &this, &pool);
        }

        let mut hosts = Vec::new(&env);
        hosts.push_back(organizer.clone());

        let config = Config {
            organizer,
            hosts,
            title,
            starts_at,
            token,
            deposit,
            fee_allowance,
            capacity,
            code_hash,
            policy,
            reputation,
            admission,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage()
            .instance()
            .set(&DataKey::Phase, &Phase::Reserving);
        env.storage()
            .instance()
            .set(&DataKey::Reserved, &Vec::<Address>::new(&env));
        env.storage()
            .instance()
            .set(&DataKey::CheckedIn, &Vec::<Address>::new(&env));
        Self::bump_instance(&env);
        Ok(())
    }

    /// Lock the deposit and reserve a spot. Only while the event is `Reserving`.
    pub fn rsvp(env: Env, guest: Address) -> Result<(), Error> {
        let config = Self::config(&env)?;
        match Self::phase(&env) {
            Phase::Reserving => {}
            Phase::CheckingIn => return Err(Error::ReservationsClosed),
            Phase::Finalized => return Err(Error::AlreadyFinalized),
        }
        guest.require_auth();

        // Having a record is no longer the same as having a spot: under
        // `Approval` a guest holds one from the moment they apply, and the
        // whole point of that mode is that they reserve afterwards.
        let standing = env
            .storage()
            .persistent()
            .get::<_, Attendance>(&DataKey::Attendance(guest.clone()));
        if matches!(
            standing,
            Some(Attendance::Reserved) | Some(Attendance::CheckedIn)
        ) {
            return Err(Error::AlreadyReserved);
        }

        let mut reserved = Self::reserved_list(&env);
        if reserved.len() >= config.capacity {
            return Err(Error::EventFull);
        }

        // Last of the checks, and deliberately so: it is the only one that can
        // leave this contract, and a guest who is already reserved or arriving
        // at a full event has been turned away without anyone paying for a
        // cross-contract call.
        Self::require_admitted(&env, &config, &guest, standing)?;

        let this = env.current_contract_address();
        token::Client::new(&env, &config.token).transfer(&guest, &this, &config.deposit);

        reserved.push_back(guest.clone());
        let spots_left = config.capacity - reserved.len();
        env.storage().instance().set(&DataKey::Reserved, &reserved);
        env.storage()
            .persistent()
            .set(&DataKey::Attendance(guest.clone()), &Attendance::Reserved);
        Self::bump_attendance(&env, &guest);
        Self::bump_instance(&env);

        Reserved {
            guest,
            deposit: config.deposit,
            spots_left,
        }
        .publish(&env);
        Ok(())
    }

    /// Ask to come. `Admission::Approval` only, and it moves no money.
    ///
    /// The SOW's promise is that nothing is taken before the organizer says
    /// yes, so this is two transactions rather than one: `apply` here, then
    /// `rsvp` after approval, and the deposit moves in that second one. It has
    /// to be the applicant's own transaction. An approval that could pull
    /// somebody's deposit would mean anyone could be charged for being liked.
    pub fn apply(env: Env, guest: Address) -> Result<(), Error> {
        let config = Self::config(&env)?;
        match Self::phase(&env) {
            Phase::Reserving => {}
            Phase::CheckingIn => return Err(Error::ReservationsClosed),
            Phase::Finalized => return Err(Error::AlreadyFinalized),
        }
        if config.admission != Admission::Approval {
            return Err(Error::WrongAdmissionMode);
        }
        guest.require_auth();

        let key = DataKey::Attendance(guest.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyApplied);
        }

        env.storage().persistent().set(&key, &Attendance::Applied);
        Self::bump_attendance(&env, &guest);
        Self::bump_instance(&env);

        ApplicationReceived { applicant: guest }.publish(&env);
        Ok(())
    }

    /// Let an applicant reserve. Any host.
    pub fn approve(env: Env, host: Address, applicant: Address) -> Result<(), Error> {
        Self::answer(&env, host, applicant, true)
    }

    /// Turn an applicant down. Any host.
    pub fn decline(env: Env, host: Address, applicant: Address) -> Result<(), Error> {
        Self::answer(&env, host, applicant, false)
    }

    /// Add someone who can run this event alongside the creator. Any host.
    ///
    /// Idempotent: adding an existing host changes nothing and succeeds, so a
    /// retried transaction never turns into an error somebody has to read.
    pub fn add_host(env: Env, host: Address, new_host: Address) -> Result<(), Error> {
        let mut config = Self::require_host(&env, &host)?;
        if config.hosts.contains(&new_host) {
            return Ok(());
        }

        config.hosts.push_back(new_host.clone());
        env.storage().instance().set(&DataKey::Config, &config);
        Self::bump_instance(&env);

        HostAdded { host: new_host }.publish(&env);
        Ok(())
    }

    /// Take someone's hosting rights away. Any host, except the creator's.
    ///
    /// Any host may remove any other, which means co-hosts can remove each
    /// other — deliberately. The creator is permanent, so the worst case is a
    /// mess only they can be asked to clean up, and the alternative (only the
    /// creator may remove) leaves an event stuck the moment they are
    /// unreachable, which is the exact situation co-hosting exists for.
    pub fn remove_host(env: Env, host: Address, target: Address) -> Result<(), Error> {
        let mut config = Self::require_host(&env, &host)?;
        if target == config.organizer {
            return Err(Error::CannotRemoveCreator);
        }

        let index = config
            .hosts
            .first_index_of(&target)
            .ok_or(Error::NotAHost)?;
        config.hosts.remove(index);
        env.storage().instance().set(&DataKey::Config, &config);
        Self::bump_instance(&env);

        HostRemoved { host: target }.publish(&env);
        Ok(())
    }

    /// Prove attendance with the organizer's secret and take the deposit back.
    ///
    /// This is the only place a guest gets paid on the happy path — the deposit
    /// and the fee reimbursement land in the same call, so there is nothing to
    /// come back and claim later.
    pub fn check_in(env: Env, guest: Address, secret: Bytes) -> Result<(), Error> {
        let config = Self::config(&env)?;
        match Self::phase(&env) {
            Phase::CheckingIn => {}
            Phase::Reserving => return Err(Error::CheckInNotOpen),
            Phase::Finalized => return Err(Error::AlreadyFinalized),
        }
        guest.require_auth();

        match env
            .storage()
            .persistent()
            .get::<_, Attendance>(&DataKey::Attendance(guest.clone()))
        {
            Some(Attendance::CheckedIn) => return Err(Error::AlreadyCheckedIn),
            Some(Attendance::Reserved) => {}
            // Approved but never reserved is the same as never asking, as far
            // as the door is concerned: no deposit was ever locked, so there is
            // nothing here to hand back.
            None
            | Some(Attendance::Applied)
            | Some(Attendance::Approved)
            | Some(Attendance::Declined) => return Err(Error::NotReserved),
        }

        if env.crypto().sha256(&secret).to_bytes() != config.code_hash {
            return Err(Error::WrongCode);
        }

        let refunded = config.deposit + config.fee_allowance;
        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &guest,
            &refunded,
        );

        let mut checked_in = Self::checked_in_list(&env);
        checked_in.push_back(guest.clone());
        env.storage()
            .instance()
            .set(&DataKey::CheckedIn, &checked_in);
        env.storage()
            .persistent()
            .set(&DataKey::Attendance(guest.clone()), &Attendance::CheckedIn);
        Self::bump_attendance(&env, &guest);
        Self::bump_instance(&env);

        // Last, and unable to matter. The guest has already been paid by the
        // time this runs.
        Self::record_score(&env, &config, &guest, ScoreKind::CheckIn);

        CheckedIn { guest, refunded }.publish(&env);
        Ok(())
    }

    /// Start check-in, closing reservations. Any host.
    pub fn open_checkin(env: Env, host: Address) -> Result<(), Error> {
        Self::set_phase(&env, host, Phase::Reserving, Phase::CheckingIn)
    }

    /// Go back to taking reservations, e.g. to let a latecomer in. Any host.
    ///
    /// Guests who already checked in keep their refund and stay on the list; this
    /// only reopens the door.
    pub fn reopen_rsvp(env: Env, host: Address) -> Result<(), Error> {
        Self::set_phase(&env, host, Phase::CheckingIn, Phase::Reserving)
    }

    /// Close the event and settle the no-shows' deposits. Any host.
    pub fn finalize(env: Env, host: Address) -> Result<(), Error> {
        if Self::phase(&env) == Phase::Finalized {
            return Err(Error::AlreadyFinalized);
        }
        let config = Self::require_host(&env, &host)?;
        host.require_auth();

        let reserved = Self::reserved_list(&env);
        let checked_in = Self::checked_in_list(&env);
        let showed = checked_in.len();
        let no_shows = reserved.len() - showed;

        let forfeited = config.deposit * i128::from(no_shows);
        // The fee pool was sized for a full house; only the guests who checked in
        // ever drew from it, so the rest is still the organizer's money.
        let unspent_pool = config.fee_allowance * i128::from(config.capacity - showed);

        let client = token::Client::new(&env, &config.token);
        let contract = env.current_contract_address();

        // Every payout below goes to `config.organizer`, never to whichever
        // host happened to call this. A co-host can run the event; they cannot
        // redirect its money, and adding one is therefore not a decision about
        // funds.

        match config.policy {
            ForfeitPolicy::ToOrganizer => {
                let payout = forfeited + unspent_pool;
                if payout > 0 {
                    client.transfer(&contract, &config.organizer, &payout);
                }
            }
            ForfeitPolicy::SplitAmongAttendees => {
                // Integer division leaves dust; it rides back with the unspent
                // pool rather than being stranded in the contract forever.
                let share = if showed > 0 {
                    forfeited / i128::from(showed)
                } else {
                    0
                };
                if share > 0 {
                    for guest in checked_in.iter() {
                        client.transfer(&contract, &guest, &share);
                    }
                }
                let remainder = forfeited - share * i128::from(showed);
                let payout = remainder + unspent_pool;
                if payout > 0 {
                    client.transfer(&contract, &config.organizer, &payout);
                }
            }
        }

        // Only now, with every transfer done, does anyone's score move. The
        // count above is enough to settle the money; lowering scores needs the
        // identities, so this reads each reserved guest's attendance back.
        //
        // That makes finalize scale with capacity rather than with the number of
        // no-shows. At the sizes this is built for it is comfortable; a
        // several-hundred-person event would want the settle batched.
        for guest in reserved.iter() {
            let attendance = env
                .storage()
                .persistent()
                .get::<_, Attendance>(&DataKey::Attendance(guest.clone()));
            if attendance == Some(Attendance::Reserved) {
                Self::record_score(&env, &config, &guest, ScoreKind::NoShow);
            }
        }

        // A finalized event is the evidence a settled event actually settled, so
        // it gets the same 90 days as a live one rather than being left to rot.
        env.storage()
            .instance()
            .set(&DataKey::Phase, &Phase::Finalized);
        Self::bump_instance(&env);
        Finalized {
            showed,
            no_shows,
            forfeited,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::config(&env)
    }

    pub fn get_phase(env: Env) -> Phase {
        Self::phase(&env)
    }

    pub fn is_finalized(env: Env) -> bool {
        Self::phase(&env) == Phase::Finalized
    }

    pub fn get_reserved(env: Env) -> Vec<Address> {
        Self::reserved_list(&env)
    }

    pub fn get_checked_in(env: Env) -> Vec<Address> {
        Self::checked_in_list(&env)
    }

    /// Whether `who` may run this event. Everything host-gated is behind the
    /// same check, so a screen can hide the controls it would refuse.
    pub fn is_host(env: Env, who: Address) -> Result<bool, Error> {
        Ok(Self::config(&env)?.hosts.contains(&who))
    }

    pub fn get_attendance(env: Env, guest: Address) -> Option<Attendance> {
        env.storage().persistent().get(&DataKey::Attendance(guest))
    }

    /// Push this event's storage out of reach of the archiver.
    ///
    /// Soroban state is rented. Left alone, an event archives in about a week on
    /// Testnet and every read against it — the deposit, the guest list, who
    /// checked in — starts failing, which looks exactly like the event having
    /// been deleted. It hasn't been; it just stopped paying rent.
    ///
    /// Called from `initialize` too, so an event created today and held three
    /// weeks out is safe before a single guest has touched it. Waiting for the
    /// first `rsvp` to extend would be a race against an empty room.
    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
    }

    /// A guest's attendance lives in persistent storage, keyed per address, so
    /// it needs extending separately from the instance.
    fn bump_attendance(env: &Env, guest: &Address) {
        env.storage().persistent().extend_ttl(
            &DataKey::Attendance(guest.clone()),
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );
    }

    /// Load the config and refuse unless `host` is on it.
    ///
    /// Soroban has no caller address, so every host-gated entry point names the
    /// host it is acting as and this checks the claim. Membership is checked
    /// *before* `require_auth`, which is what makes "not a host" a readable
    /// error instead of an authorization failure a wallet cannot explain.
    fn require_host(env: &Env, host: &Address) -> Result<Config, Error> {
        let config = Self::config(env)?;
        if config.hosts.contains(host) {
            Ok(config)
        } else {
            Err(Error::NotAHost)
        }
    }

    /// Answer one application, yes or no.
    ///
    /// Only an application in `Applied` can be answered, which makes a decision
    /// final in both directions. That is the conservative reading: an approval
    /// the organizer could take back is one a guest cannot plan around, and a
    /// decline they could take back is an inbox a declined applicant can keep
    /// reopening.
    fn answer(env: &Env, host: Address, applicant: Address, approved: bool) -> Result<(), Error> {
        let config = Self::config(env)?;
        if Self::phase(env) == Phase::Finalized {
            return Err(Error::AlreadyFinalized);
        }
        if config.admission != Admission::Approval {
            return Err(Error::WrongAdmissionMode);
        }
        Self::require_host(env, &host)?;
        host.require_auth();

        let key = DataKey::Attendance(applicant.clone());
        match env.storage().persistent().get::<_, Attendance>(&key) {
            Some(Attendance::Applied) => {}
            _ => return Err(Error::NotApplied),
        }

        let decision = if approved {
            Attendance::Approved
        } else {
            Attendance::Declined
        };
        env.storage().persistent().set(&key, &decision);
        Self::bump_attendance(env, &applicant);
        Self::bump_instance(env);

        ApplicationAnswered {
            applicant,
            approved,
        }
        .publish(env);
        Ok(())
    }

    /// Decide whether `guest` may reserve at all.
    ///
    /// This is the whole point of putting admission on-chain: a gate a screen
    /// applies is a suggestion, because `rsvp` can be called straight against
    /// the contract by anyone who knows its address.
    fn require_admitted(
        env: &Env,
        config: &Config,
        guest: &Address,
        standing: Option<Attendance>,
    ) -> Result<(), Error> {
        match config.admission {
            Admission::Open => Ok(()),
            Admission::Score(min) => {
                let reputation = config.reputation.as_ref().ok_or(Error::NoReputation)?;
                // Not a `try_` call, unlike every write into the ledger. A write
                // that fails is swallowed because no score is worth trapping a
                // guest's refund for; a read that fails has no safe answer —
                // assuming zero locks everyone out, assuming enough turns a
                // gated event open. So it traps, and the guest is told to try
                // again rather than quietly let in.
                let score = ReputationClient::new(env, reputation).get_score(guest);
                if score.shows < min {
                    return Err(Error::ScoreTooLow);
                }
                Ok(())
            }
            // The organizer's yes is the whole gate, and it has to already have
            // been given: `Applied` and `Declined` are both "not approved", and
            // so is having never asked.
            Admission::Approval => match standing {
                Some(Attendance::Approved) => Ok(()),
                _ => Err(Error::NotApplied),
            },
            // Enforcement does not exist yet. A mode that cannot be enforced
            // admits nobody rather than everybody: an event created with a gate
            // this revision does not understand is closed, not open.
            Admission::Vouch(_) => Err(Error::WrongAdmissionMode),
        }
    }

    /// Record a show or a no-show, and never let it matter.
    ///
    /// This is the one rule the whole reputation design bends around: **a
    /// reputation failure must never stop a guest getting their deposit back.**
    /// `check_in` is the only place on the happy path where a guest is paid, so
    /// if a call into the ledger trapped, the trap would take the refund with it
    /// and the guest's money would sit locked until finalize. Nothing about a
    /// score is worth that.
    ///
    /// So every call goes through the generated `try_` variant and the result is
    /// dropped. The ledger can be broken, upgraded to something incompatible,
    /// un-registered, or gone; the money still moves. A dropped write publishes
    /// `ReputationSkipped` rather than vanishing.
    fn record_score(env: &Env, config: &Config, member: &Address, kind: ScoreKind) {
        let reputation = match &config.reputation {
            Some(address) => address,
            None => return,
        };
        let client = ReputationClient::new(env, reputation);
        let this = env.current_contract_address();

        let outcome = match kind {
            ScoreKind::CheckIn => client.try_record_checkin(&this, member),
            ScoreKind::NoShow => client.try_record_no_show(&this, member),
        };

        if outcome.is_err() {
            ReputationSkipped {
                member: member.clone(),
                kind,
            }
            .publish(env);
        }
    }

    fn config(env: &Env) -> Result<Config, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn phase(env: &Env) -> Phase {
        env.storage()
            .instance()
            .get(&DataKey::Phase)
            .unwrap_or(Phase::Reserving)
    }

    /// Move `from` -> `to` on the organizer's authority.
    ///
    /// Finalized is terminal, so it is rejected before anything else — an event
    /// that has paid out must never accept guests again.
    fn set_phase(env: &Env, host: Address, from: Phase, to: Phase) -> Result<(), Error> {
        let current = Self::phase(env);
        if current == Phase::Finalized {
            return Err(Error::AlreadyFinalized);
        }
        if current != from {
            return Err(Error::WrongPhase);
        }
        Self::require_host(env, &host)?;
        host.require_auth();

        env.storage().instance().set(&DataKey::Phase, &to);
        Self::bump_instance(env);
        PhaseChanged { phase: to }.publish(env);
        Ok(())
    }

    fn reserved_list(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Reserved)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn checked_in_list(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::CheckedIn)
            .unwrap_or_else(|| Vec::new(env))
    }
}

mod test;
