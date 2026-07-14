#![no_std]

//! Showup — the per-event deposit contract.
//!
//! Flow: the organizer creates an event with a deposit amount and a capacity,
//! funding a pool that reimburses attendees' transaction fees. Guests `rsvp` by
//! locking the deposit. On the day the organizer shares a secret (as a link/QR);
//! a guest `check_in`s with it and gets their deposit back plus the fee
//! reimbursement in the same call. When the organizer `finalize`s, the deposits
//! of everyone who never showed are forfeited — either to the organizer or split
//! among the people who did show, per the policy fixed at creation.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, Vec,
};

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
}

/// Where the deposits of no-shows go when the event is finalized.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ForfeitPolicy {
    /// Straight to the organizer.
    ToOrganizer,
    /// Split evenly among everyone who checked in.
    SplitAmongAttendees,
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
    Finalized,
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
        env.storage().instance().set(&DataKey::Finalized, &false);
        env.storage()
            .instance()
            .set(&DataKey::Reserved, &Vec::<Address>::new(&env));
        env.storage()
            .instance()
            .set(&DataKey::CheckedIn, &Vec::<Address>::new(&env));
        Ok(())
    }

    /// Lock the deposit and reserve a spot.
    pub fn rsvp(env: Env, guest: Address) -> Result<(), Error> {
        let config = Self::config(&env)?;
        Self::require_open(&env)?;
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
        Self::require_open(&env)?;
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

    /// Close the event and settle the no-shows' deposits.
    pub fn finalize(env: Env) -> Result<(), Error> {
        let config = Self::config(&env)?;
        Self::require_open(&env)?;
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

        env.storage().instance().set(&DataKey::Finalized, &true);
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

    pub fn is_finalized(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Finalized)
            .unwrap_or(false)
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

    fn require_open(env: &Env) -> Result<(), Error> {
        let finalized: bool = env
            .storage()
            .instance()
            .get(&DataKey::Finalized)
            .unwrap_or(false);
        if finalized {
            return Err(Error::AlreadyFinalized);
        }
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
