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
//! The phases are what stop someone who was forwarded the check-in link from
//! reserving and checking in on the spot without ever attending — which would
//! both pocket the fee allowance and dilute the real attendees' share of the
//! forfeited deposits.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, Vec,
};

pub use interfaces::ForfeitPolicy;

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

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Attendance {
    Reserved,
    CheckedIn,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub organizer: Address,
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
        token: Address,
        deposit: i128,
        fee_allowance: i128,
        capacity: u32,
        code_hash: BytesN<32>,
        policy: ForfeitPolicy,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
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

        let config = Config {
            organizer,
            token,
            deposit,
            fee_allowance,
            capacity,
            code_hash,
            policy,
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

        if env
            .storage()
            .persistent()
            .has(&DataKey::Attendance(guest.clone()))
        {
            return Err(Error::AlreadyReserved);
        }

        let mut reserved = Self::reserved_list(&env);
        if reserved.len() >= config.capacity {
            return Err(Error::EventFull);
        }

        let this = env.current_contract_address();
        token::Client::new(&env, &config.token).transfer(&guest, &this, &config.deposit);

        reserved.push_back(guest.clone());
        let spots_left = config.capacity - reserved.len();
        env.storage().instance().set(&DataKey::Reserved, &reserved);
        env.storage()
            .persistent()
            .set(&DataKey::Attendance(guest.clone()), &Attendance::Reserved);

        Reserved {
            guest,
            deposit: config.deposit,
            spots_left,
        }
        .publish(&env);
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
            None => return Err(Error::NotReserved),
            Some(Attendance::CheckedIn) => return Err(Error::AlreadyCheckedIn),
            Some(Attendance::Reserved) => {}
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

        CheckedIn { guest, refunded }.publish(&env);
        Ok(())
    }

    /// Start check-in, closing reservations. Organizer only.
    pub fn open_checkin(env: Env) -> Result<(), Error> {
        Self::set_phase(&env, Phase::Reserving, Phase::CheckingIn)
    }

    /// Go back to taking reservations, e.g. to let a latecomer in. Organizer only.
    ///
    /// Guests who already checked in keep their refund and stay on the list; this
    /// only reopens the door.
    pub fn reopen_rsvp(env: Env) -> Result<(), Error> {
        Self::set_phase(&env, Phase::CheckingIn, Phase::Reserving)
    }

    /// Close the event and settle the no-shows' deposits.
    pub fn finalize(env: Env) -> Result<(), Error> {
        let config = Self::config(&env)?;
        if Self::phase(&env) == Phase::Finalized {
            return Err(Error::AlreadyFinalized);
        }
        config.organizer.require_auth();

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

        env.storage()
            .instance()
            .set(&DataKey::Phase, &Phase::Finalized);
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

    pub fn get_attendance(env: Env, guest: Address) -> Option<Attendance> {
        env.storage().persistent().get(&DataKey::Attendance(guest))
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
    fn set_phase(env: &Env, from: Phase, to: Phase) -> Result<(), Error> {
        let config = Self::config(env)?;
        let current = Self::phase(env);
        if current == Phase::Finalized {
            return Err(Error::AlreadyFinalized);
        }
        if current != from {
            return Err(Error::WrongPhase);
        }
        config.organizer.require_auth();

        env.storage().instance().set(&DataKey::Phase, &to);
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
