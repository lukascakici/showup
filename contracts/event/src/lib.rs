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

use interfaces::{
    ReputationClient, MAX_TITLE_BYTES, RECLAIM_GRACE_SECONDS, TTL_EXTEND_TO, TTL_THRESHOLD,
    VOUCH_QUALIFY_SHOWS,
};
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
    /// A vouch from a record that cannot carry one: too few shows, or a vouch
    /// of their own already broken.
    CannotVouch = 24,
    /// A second vouch for the same guest from the same member.
    AlreadyVouched = 25,
    /// A vouch for yourself, which would make the whole gate a formality.
    CannotVouchForYourself = 26,
    /// Not enough members have vouched for this guest yet.
    NotEnoughVouches = 27,
    /// `reclaim` before `starts_at + RECLAIM_GRACE_SECONDS`. The organizer
    /// still has time to settle.
    ReclaimTooEarly = 28,
    /// A second `reclaim` from a guest who already took their deposit back.
    AlreadyReclaimed = 29,
    /// `deposit + fee_allowance`, multiplied out across the whole capacity,
    /// does not fit in an `i128`.
    ///
    /// Refused at creation rather than discovered at settlement: these three
    /// numbers are the organizer's to choose, and the only moment they can be
    /// rejected without anybody's money already depending on them is before the
    /// event exists.
    AmountsTooLarge = 30,
    /// Arithmetic in the money path went out of range, which it cannot do while
    /// this contract's own invariants hold.
    ///
    /// Unreachable by construction: the ceiling at `initialize` bounds every
    /// amount, the capacity guard bounds every list, and the attendance states
    /// are mutually exclusive. It exists so that if one of those ever stops
    /// being true, settlement **refuses with a name** instead of trapping with
    /// an opaque host panic — a refusal can be diagnosed and recovered from, a
    /// wrong payout cannot.
    InvariantViolated = 31,
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
    /// Took their own deposit back, because the organizer never settled.
    ///
    /// **Deliberately neither `CheckedIn` nor left as `Reserved`.** A reclaim is
    /// not attendance and it is not absence: the guest recovered their money
    /// from an event that never happened properly, and the one number this
    /// product sells must not record that as either. Being its own state is
    /// what keeps `finalize`'s no-show loop from touching them — see there.
    Reclaimed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// Whoever created the event. Permanent, and the only address forfeited
    /// deposits are ever paid to — see `Terms::hosts` for who may *act*.
    pub organizer: Address,
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
}

/// Everything about an event that arrived after the first revision.
///
/// This exists because `Config` cannot grow. It is a **stored** struct, and
/// every event already deployed holds one written by an older wasm — so adding
/// a field to it does not give those events the field, it gives every client
/// generated from the new spec a value it cannot decode. `get_config` on a live
/// event failed with `vec not set` the moment `admission` was added to it.
///
/// `Terms` is assembled at read time from separately keyed entries instead, so
/// it can keep growing: a client that asks an old event for its terms gets a
/// missing-function error it can recognise and answer for itself, which is a
/// far better failure than a config that will not decode at all.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Terms {
    /// Who may reserve a spot. Fixed at creation, like the deposit and the
    /// capacity: the terms somebody agreed to when they locked their money must
    /// not be editable by the person holding it.
    pub admission: Admission,
    /// Everyone who may run the event: open check-in, reopen reservations,
    /// answer applications, finalize, and change this list.
    ///
    /// The creator is always `hosts[0]` and cannot be removed, so this overlaps
    /// `Config::organizer` by exactly one address on purpose. `organizer`
    /// answers "whose event is this, and where does forfeited money go" — which
    /// must have one unambiguous answer no matter who else is helping — and
    /// `hosts` answers "who may act", which is a list.
    pub hosts: Vec<Address>,
}

#[contracttype]
pub enum DataKey {
    Config,
    Phase,
    Reserved,
    CheckedIn,
    Attendance(Address),
    /// Added after the first revision, and keyed separately for that reason —
    /// see `Terms`. An event that predates them has neither key, which is why
    /// both readers below have a default rather than an `unwrap`.
    Admission,
    Hosts,
    /// Everyone who has taken their deposit back without the organizer.
    ///
    /// A list rather than a counter for the same reason `Vouchers` is one: the
    /// evidence has to be able to name who, and `finalize` reads its length to
    /// know how much money has already left.
    Reclaimed,
    /// Everyone who has vouched for this guest, at this event.
    ///
    /// A list rather than a counter because `finalize` has to charge them by
    /// name when the guest does not turn up — a number could say how many were
    /// wrong but not which.
    Vouchers(Address),
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

/// Published when a guest exits a deposit the organizer never settled.
///
/// Worth watching on its own: every one of these is an event somebody took
/// money for and walked away from.
#[contractevent]
pub struct DepositReclaimed {
    pub guest: Address,
    /// The deposit, and only the deposit — see `reclaim`.
    pub amount: i128,
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

/// Published when somebody puts their record behind a guest.
#[contractevent]
pub struct Vouched {
    pub voucher: Address,
    pub guest: Address,
    /// How many this guest now has, so a watcher can see the gate open.
    pub vouches: u32,
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

        // One bound at the door, so every sum inside this contract is in range
        // by construction rather than by argument.
        //
        // `(deposit + fee_allowance) * capacity` is the most this contract can
        // ever hold: every deposit a full house could lock, plus the whole fee
        // pool. If that fits, so does every intermediate the settlement
        // computes — the forfeited total, the unspent pool, their sum, a single
        // guest's refund, and the share each attendee is paid. Checking the
        // maximum once is what makes the nine multiplications and additions
        // downstream safe, and it is checked where the numbers are still the
        // organizer's to change rather than after somebody has locked money
        // against them.
        deposit
            .checked_add(fee_allowance)
            .and_then(|per_guest| per_guest.checked_mul(i128::from(capacity)))
            .ok_or(Error::AmountsTooLarge)?;

        organizer.require_auth();

        // In range because the ceiling above already holds, and still written
        // as a checked call: the whole money path in this contract is, so that
        // none of it depends on a reader remembering which lines were argued
        // safe and which were merely not yet wrong.
        let pool = fee_allowance
            .checked_mul(i128::from(capacity))
            .ok_or(Error::AmountsTooLarge)?;
        if pool > 0 {
            let this = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&organizer, &this, &pool);
        }

        let mut hosts = Vec::new(&env);
        hosts.push_back(organizer.clone());
        env.storage().instance().set(&DataKey::Hosts, &hosts);
        env.storage()
            .instance()
            .set(&DataKey::Admission, &admission);

        let config = Config {
            organizer,
            title,
            starts_at,
            token,
            deposit,
            fee_allowance,
            capacity,
            code_hash,
            policy,
            reputation,
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
        // In range because the capacity guard above refuses before the push, so
        // the list is at most `capacity` long by the time this runs.
        let spots_left = config
            .capacity
            .checked_sub(reserved.len())
            .ok_or(Error::InvariantViolated)?;
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
        // Discarded: this only has to establish that the event exists at all,
        // and nothing about an application depends on its terms.
        Self::config(&env)?;
        match Self::phase(&env) {
            Phase::Reserving => {}
            Phase::CheckingIn => return Err(Error::ReservationsClosed),
            Phase::Finalized => return Err(Error::AlreadyFinalized),
        }
        if Self::admission(&env) != Admission::Approval {
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

    /// Put your own record behind somebody else. `Admission::Vouch` only.
    ///
    /// This is the mechanism that makes a vouch more than a whitelist entry: it
    /// is a signed, public statement by a member with a record, and it costs
    /// them if the person they backed does not turn up — see `finalize`.
    ///
    /// Three refusals, each closing a different hole:
    ///
    /// - **A voucher must qualify.** `VOUCH_QUALIFY_SHOWS` shows, *and* no
    ///   broken vouch of their own. Without the second half, somebody could
    ///   wave in strangers forever at the cost of a record that never moves.
    /// - **Nobody vouches twice for the same guest.** Otherwise one member
    ///   meets a threshold of five on their own and the count means nothing.
    /// - **Nobody vouches for themselves.** The same hole, one step shorter.
    ///
    /// It moves no money and takes no spot. The guest still has to `rsvp`, and
    /// that is where the deposit goes — a vouch is permission to reserve, not a
    /// reservation.
    pub fn vouch(env: Env, voucher: Address, guest: Address) -> Result<(), Error> {
        let config = Self::config(&env)?;
        match Self::phase(&env) {
            Phase::Reserving => {}
            Phase::CheckingIn => return Err(Error::ReservationsClosed),
            Phase::Finalized => return Err(Error::AlreadyFinalized),
        }
        if !matches!(Self::admission(&env), Admission::Vouch(_)) {
            return Err(Error::WrongAdmissionMode);
        }
        if voucher == guest {
            return Err(Error::CannotVouchForYourself);
        }
        voucher.require_auth();

        let reputation = config.reputation.as_ref().ok_or(Error::NoReputation)?;
        let client = ReputationClient::new(&env, reputation);
        // Not a `try_` call, exactly like the score gate: a read that cannot be
        // answered has no safe default. Assuming a good record would let anyone
        // vouch while the ledger is unreachable.
        let record = client.get_record(&voucher);
        if record.shows < VOUCH_QUALIFY_SHOWS || record.vouches_broken > 0 {
            return Err(Error::CannotVouch);
        }

        let key = DataKey::Vouchers(guest.clone());
        let mut vouchers: Vec<Address> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        if vouchers.contains(&voucher) {
            return Err(Error::AlreadyVouched);
        }
        vouchers.push_back(voucher.clone());
        let vouches = vouchers.len();
        env.storage().persistent().set(&key, &vouchers);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        Self::bump_instance(&env);

        // Through `try_` — the ledger's bookkeeping must never be able to trap a
        // vouch that the event has already accepted.
        let _ = client.try_record_vouch_given(&env.current_contract_address(), &voucher);

        Vouched {
            voucher,
            guest,
            vouches,
        }
        .publish(&env);
        Ok(())
    }

    /// How many members have vouched for `guest` at this event.
    pub fn get_vouches(env: Env, guest: Address) -> u32 {
        Self::vouchers(&env, &guest).len()
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
        let config = Self::require_host(&env, &host)?;
        host.require_auth();

        let mut hosts = Self::hosts(&env, &config);
        if hosts.contains(&new_host) {
            return Ok(());
        }

        hosts.push_back(new_host.clone());
        env.storage().instance().set(&DataKey::Hosts, &hosts);
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
        let config = Self::require_host(&env, &host)?;
        if target == config.organizer {
            return Err(Error::CannotRemoveCreator);
        }
        host.require_auth();

        let mut hosts = Self::hosts(&env, &config);
        let index = hosts.first_index_of(&target).ok_or(Error::NotAHost)?;
        hosts.remove(index);
        env.storage().instance().set(&DataKey::Hosts, &hosts);
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
            // Already took the deposit back, so there is nothing left in here
            // to hand over and no spot left to honour.
            Some(Attendance::Reclaimed) => return Err(Error::AlreadyReclaimed),
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

        // In range because `initialize` refused any event whose
        // `deposit + fee_allowance` could not be added at all.
        let refunded = config
            .deposit
            .checked_add(config.fee_allowance)
            .ok_or(Error::InvariantViolated)?;
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
    /// Take your own deposit back when the organizer never settled.
    ///
    /// `open_checkin` and `finalize` both need a host signature, so without this
    /// there is **no path out of a reserved deposit that a guest can take on
    /// their own**: an organizer who walks away leaves every deposit in this
    /// contract locked forever, recoverable by nobody — not the guest, not the
    /// admin, not us. That is not a bug, which is why no audit would report it;
    /// it is the design working exactly as written. On Mainnet it is the one way
    /// Showup could take somebody's money and fail to give it back.
    ///
    /// Three properties make this safe to expose:
    ///
    /// - **It touches only the caller's own deposit.** There is no amount
    ///   argument and no recipient argument, so it can never become a way to
    ///   empty an event.
    /// - **It cannot be used early.** Not until `starts_at` plus
    ///   `RECLAIM_GRACE_SECONDS`, by which point the organizer has had two days
    ///   past their own start time to settle.
    /// - **It is not a way to dodge a no-show.** A reclaim leaves the guest's
    ///   attendance record untouched, so the grace window is what stops it being
    ///   an escape hatch: an organizer who settles on time closes it before it
    ///   opens.
    ///
    /// The deposit comes back and the fee allowance does not. That pool is the
    /// organizer's money, funded upfront to reimburse people who actually came;
    /// paying it to somebody who did not attend would make an organizer fund
    /// absences.
    ///
    /// Allowed in `Reserving` and in `CheckingIn`. An organizer can disappear
    /// before opening check-in or after, and both strand the same money.
    pub fn reclaim(env: Env, guest: Address) -> Result<(), Error> {
        let config = Self::config(&env)?;
        if Self::phase(&env) == Phase::Finalized {
            return Err(Error::AlreadyFinalized);
        }

        // Saturating, so an event created with a `starts_at` near u64::MAX
        // cannot overflow its way into an immediately-reclaimable window.
        if env.ledger().timestamp() < config.starts_at.saturating_add(RECLAIM_GRACE_SECONDS) {
            return Err(Error::ReclaimTooEarly);
        }

        match env
            .storage()
            .persistent()
            .get::<_, Attendance>(&DataKey::Attendance(guest.clone()))
        {
            Some(Attendance::Reserved) => {}
            Some(Attendance::Reclaimed) => return Err(Error::AlreadyReclaimed),
            // Checked in already got the deposit back, with the fee allowance
            // on top. Everything else never locked one.
            Some(Attendance::CheckedIn)
            | None
            | Some(Attendance::Applied)
            | Some(Attendance::Approved)
            | Some(Attendance::Declined) => return Err(Error::NotReserved),
        }

        guest.require_auth();

        let mut reclaimed = Self::reclaimed_list(&env);
        // Read before the push: an empty list means this is the first person to
        // give up on the organizer, and that is what gets recorded against them.
        let first = reclaimed.is_empty();
        reclaimed.push_back(guest.clone());
        env.storage()
            .instance()
            .set(&DataKey::Reclaimed, &reclaimed);
        env.storage()
            .persistent()
            .set(&DataKey::Attendance(guest.clone()), &Attendance::Reclaimed);
        Self::bump_attendance(&env, &guest);
        Self::bump_instance(&env);

        token::Client::new(&env, &config.token).transfer(
            &env.current_contract_address(),
            &guest,
            &config.deposit,
        );

        // An event that took deposits and was abandoned is recorded against
        // whoever created it. There is no `finalize` here to carry the write —
        // that is the whole point — so the first reclaim carries it instead, and
        // a guest taking their own money out without the organizer is the
        // honest definition of the thing being recorded.
        //
        // Through `try_` like every other ledger write: a reputation contract
        // that is down must never take a guest's deposit with it.
        if first {
            if let Some(reputation) = &config.reputation {
                let _ = ReputationClient::new(&env, reputation)
                    .try_record_abandoned(&env.current_contract_address(), &config.organizer);
            }
        }

        DepositReclaimed {
            guest,
            amount: config.deposit,
        }
        .publish(&env);
        Ok(())
    }

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
        // Anyone who reclaimed took their deposit with them, so they are neither
        // a no-show to be forfeited nor an attendee to be paid. Without this
        // term the contract tries to redistribute money that has already left
        // and the transfer traps, which would make an event that was abandoned
        // *and* partly reclaimed impossible to settle at all — stranding
        // everybody who did not reclaim.
        //
        // Checked, like every other number in this function. The ceiling fixed
        // at `initialize` makes all of this provably in range, so none of these
        // can fail — but "provably" rests on invariants enforced in other
        // functions, and that is exactly the reasoning that rots when somebody
        // changes one of them. If an invariant ever breaks, settlement refuses
        // with a name instead of trapping with a host panic, and refusing is
        // recoverable where a wrong payout is not.
        let no_shows = reserved
            .len()
            .checked_sub(showed)
            .and_then(|n| n.checked_sub(Self::reclaimed_list(&env).len()))
            .ok_or(Error::InvariantViolated)?;

        let forfeited = config
            .deposit
            .checked_mul(i128::from(no_shows))
            .ok_or(Error::InvariantViolated)?;
        // The fee pool was sized for a full house; only the guests who checked in
        // ever drew from it, so the rest is still the organizer's money. A
        // reclaim never touches the pool, which is why this line counts only
        // `showed` — and that it does is the check that the line above is right.
        let unspent_pool = config
            .capacity
            .checked_sub(showed)
            .and_then(|unused| config.fee_allowance.checked_mul(i128::from(unused)))
            .ok_or(Error::InvariantViolated)?;

        let client = token::Client::new(&env, &config.token);
        let contract = env.current_contract_address();

        // Every payout below goes to `config.organizer`, never to whichever
        // host happened to call this. A co-host can run the event; they cannot
        // redirect its money, and adding one is therefore not a decision about
        // funds.

        match config.policy {
            ForfeitPolicy::ToOrganizer => {
                let payout = forfeited
                    .checked_add(unspent_pool)
                    .ok_or(Error::InvariantViolated)?;
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
                let paid_out = share
                    .checked_mul(i128::from(showed))
                    .ok_or(Error::InvariantViolated)?;
                let remainder = forfeited
                    .checked_sub(paid_out)
                    .ok_or(Error::InvariantViolated)?;
                let payout = remainder
                    .checked_add(unspent_pool)
                    .ok_or(Error::InvariantViolated)?;
                if payout > 0 {
                    client.transfer(&contract, &config.organizer, &payout);
                }
            }
        }

        // The organizer's own line, written here rather than at creation: an
        // event that was deployed and abandoned is not an event anybody ran.
        // Through `try_` like every other ledger write — see `record_score`.
        if let Some(reputation) = &config.reputation {
            let _ = ReputationClient::new(&env, reputation)
                .try_record_organised(&env.current_contract_address(), &config.organizer);
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
                // And everyone who put their name behind them. This is the
                // whole cost of a vouch: the voucher turned up to everything
                // they turned up to, so their attendance is untouched — what
                // moves is a separate number, and `vouch` refuses anybody whose
                // is above zero. One bad call closes the door on vouching, and
                // nothing else.
                Self::charge_vouchers(&env, &config, &guest);
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

    /// Everyone who took their own deposit back. Empty on a healthy event.
    pub fn get_reclaimed(env: Env) -> Vec<Address> {
        Self::reclaimed_list(&env)
    }

    pub fn get_checked_in(env: Env) -> Vec<Address> {
        Self::checked_in_list(&env)
    }

    /// The admission mode and the host list, in one read.
    ///
    /// One call rather than two getters because a page needs both and every
    /// extra RPC read is latency in front of somebody deciding whether to lock
    /// a deposit. Absent on events deployed before this revision — a caller
    /// that gets "function not found" back is looking at an open event with one
    /// host, and can say so without asking anything else.
    pub fn get_terms(env: Env) -> Result<Terms, Error> {
        let config = Self::config(&env)?;
        Ok(Terms {
            admission: Self::admission(&env),
            hosts: Self::hosts(&env, &config),
        })
    }

    /// Whether `who` may run this event. Everything host-gated is behind the
    /// same check, so a screen can hide the controls it would refuse.
    pub fn is_host(env: Env, who: Address) -> Result<bool, Error> {
        let config = Self::config(&env)?;
        Ok(Self::hosts(&env, &config).contains(&who))
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

    /// Refuse unless `host` may run this event.
    ///
    /// Soroban has no caller address, so every host-gated entry point names the
    /// host it is acting as and this checks the claim. Membership is checked
    /// *before* `require_auth`, which is what makes "not a host" a readable
    /// error instead of an authorization failure a wallet cannot explain.
    fn require_host(env: &Env, host: &Address) -> Result<Config, Error> {
        let config = Self::config(env)?;
        if Self::hosts(env, &config).contains(host) {
            Ok(config)
        } else {
            Err(Error::NotAHost)
        }
    }

    /// Charge a no-show's vouchers, if anybody backed them.
    ///
    /// Through `try_` for the same reason every other ledger write here is: this
    /// runs inside `finalize`, which is where deposits are paid out, and no
    /// number about anybody's reputation is worth trapping a settlement for.
    fn charge_vouchers(env: &Env, config: &Config, guest: &Address) {
        let Some(reputation) = &config.reputation else {
            return;
        };
        let client = ReputationClient::new(env, reputation);
        let this = env.current_contract_address();
        for voucher in Self::vouchers(env, guest).iter() {
            let _ = client.try_record_vouch_broken(&this, &voucher);
        }
    }

    /// Everyone who has vouched for `guest` at this event.
    fn vouchers(env: &Env, guest: &Address) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Vouchers(guest.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    /// Who may run the event. Defaults to the creator alone.
    fn hosts(env: &Env, config: &Config) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Hosts)
            .unwrap_or_else(|| {
                let mut only = Vec::new(env);
                only.push_back(config.organizer.clone());
                only
            })
    }

    /// Who may reserve. Defaults to open, which is what every event that has no
    /// stored mode was created as.
    fn admission(env: &Env) -> Admission {
        env.storage()
            .instance()
            .get(&DataKey::Admission)
            .unwrap_or(Admission::Open)
    }

    /// Answer one application, yes or no.
    ///
    /// Only an application in `Applied` can be answered, which makes a decision
    /// final in both directions. That is the conservative reading: an approval
    /// the organizer could take back is one a guest cannot plan around, and a
    /// decline they could take back is an inbox a declined applicant can keep
    /// reopening.
    fn answer(env: &Env, host: Address, applicant: Address, approved: bool) -> Result<(), Error> {
        Self::config(env)?;
        if Self::phase(env) == Phase::Finalized {
            return Err(Error::AlreadyFinalized);
        }
        if Self::admission(env) != Admission::Approval {
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
        match Self::admission(env) {
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
            // The count is of *members who signed*, not of anything the guest
            // did. A threshold of zero would be an open event with extra steps,
            // so it is treated as one rather than refused: `>=` against zero is
            // always true.
            Admission::Vouch(needed) => {
                if Self::vouchers(env, guest).len() < needed {
                    return Err(Error::NotEnoughVouches);
                }
                Ok(())
            }
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

    /// Empty for every event that was settled the way it should have been, and
    /// for every event created before `reclaim` existed — hence the default
    /// rather than an unwrap.
    fn reclaimed_list(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Reclaimed)
            .unwrap_or_else(|| Vec::new(env))
    }
}

mod test;
