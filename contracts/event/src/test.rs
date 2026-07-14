#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;

const DEPOSIT: i128 = 100;
const FEE_ALLOWANCE: i128 = 2;
const CAPACITY: u32 = 4;

struct Fixture {
    env: Env,
    client: EventContractClient<'static>,
    token: Address,
    organizer: Address,
    secret: Bytes,
}

fn setup(policy: ForfeitPolicy) -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = asset.address();

    let organizer = Address::generate(&env);
    StellarAssetClient::new(&env, &token).mint(&organizer, &1_000_000);

    let contract_id = env.register(EventContract, ());
    let client = EventContractClient::new(&env, &contract_id);

    let secret = Bytes::from_slice(&env, b"open-sesame");
    let code_hash = env.crypto().sha256(&secret).to_bytes();

    client.initialize(
        &organizer,
        &token,
        &DEPOSIT,
        &FEE_ALLOWANCE,
        &CAPACITY,
        &code_hash,
        &policy,
    );

    Fixture {
        env,
        client,
        token,
        organizer,
        secret,
    }
}

impl Fixture {
    fn guest(&self, funding: i128) -> Address {
        let guest = Address::generate(&self.env);
        StellarAssetClient::new(&self.env, &self.token).mint(&guest, &funding);
        guest
    }

    fn balance(&self, who: &Address) -> i128 {
        token::Client::new(&self.env, &self.token).balance(who)
    }
}

#[test]
fn initialize_pulls_the_fee_pool_from_the_organizer() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let pool = FEE_ALLOWANCE * i128::from(CAPACITY);

    assert_eq!(f.balance(&f.organizer), 1_000_000 - pool);
    assert_eq!(f.balance(&f.client.address), pool);
    assert_eq!(f.client.get_config().deposit, DEPOSIT);
    assert!(!f.client.is_finalized());
}

#[test]
fn rsvp_locks_the_deposit() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);

    f.client.rsvp(&guest);

    assert_eq!(f.balance(&guest), 0);
    assert_eq!(f.client.get_reserved().len(), 1);
    assert_eq!(f.client.get_attendance(&guest), Some(Attendance::Reserved));
}

#[test]
fn rsvp_twice_is_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT * 2);

    f.client.rsvp(&guest);

    assert_eq!(f.client.try_rsvp(&guest), Err(Ok(Error::AlreadyReserved)));
}

#[test]
fn rsvp_past_capacity_is_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    for _ in 0..CAPACITY {
        let guest = f.guest(DEPOSIT);
        f.client.rsvp(&guest);
    }

    let latecomer = f.guest(DEPOSIT);
    assert_eq!(f.client.try_rsvp(&latecomer), Err(Ok(Error::EventFull)));
}

#[test]
fn check_in_returns_the_deposit_and_the_fee_allowance() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);
    f.client.open_checkin();

    f.client.check_in(&guest, &f.secret);

    // Walked in with DEPOSIT, walked out with DEPOSIT + the fee reimbursement.
    assert_eq!(f.balance(&guest), DEPOSIT + FEE_ALLOWANCE);
    assert_eq!(f.client.get_attendance(&guest), Some(Attendance::CheckedIn));
    assert_eq!(f.client.get_checked_in().len(), 1);
}

#[test]
fn check_in_with_the_wrong_secret_is_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);

    f.client.open_checkin();

    let wrong = Bytes::from_slice(&f.env, b"guess");
    assert_eq!(
        f.client.try_check_in(&guest, &wrong),
        Err(Ok(Error::WrongCode))
    );
    assert_eq!(f.balance(&guest), 0);
}

#[test]
fn check_in_without_an_rsvp_is_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let stranger = f.guest(0);
    f.client.open_checkin();

    assert_eq!(
        f.client.try_check_in(&stranger, &f.secret),
        Err(Ok(Error::NotReserved))
    );
}

#[test]
fn check_in_twice_is_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);
    f.client.open_checkin();
    f.client.check_in(&guest, &f.secret);

    assert_eq!(
        f.client.try_check_in(&guest, &f.secret),
        Err(Ok(Error::AlreadyCheckedIn))
    );
    // The second attempt must not pay out a second time.
    assert_eq!(f.balance(&guest), DEPOSIT + FEE_ALLOWANCE);
}

#[test]
fn finalize_sends_forfeits_and_the_unspent_pool_to_the_organizer() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let pool = FEE_ALLOWANCE * i128::from(CAPACITY);
    let opening = f.balance(&f.organizer);

    let shower = f.guest(DEPOSIT);
    let no_show = f.guest(DEPOSIT);
    f.client.rsvp(&shower);
    f.client.rsvp(&no_show);
    f.client.open_checkin();
    f.client.check_in(&shower, &f.secret);

    f.client.finalize();

    // One deposit forfeited, and the pool minus the single reimbursement.
    let expected = opening + DEPOSIT + (pool - FEE_ALLOWANCE);
    assert_eq!(f.balance(&f.organizer), expected);
    assert_eq!(f.balance(&no_show), 0);
    assert!(f.client.is_finalized());
    // Nothing is left stranded in the contract.
    assert_eq!(f.balance(&f.client.address), 0);
}

#[test]
fn finalize_splits_forfeits_among_the_people_who_showed() {
    let f = setup(ForfeitPolicy::SplitAmongAttendees);
    let a = f.guest(DEPOSIT);
    let b = f.guest(DEPOSIT);
    let ghost = f.guest(DEPOSIT);

    f.client.rsvp(&a);
    f.client.rsvp(&b);
    f.client.rsvp(&ghost);
    f.client.open_checkin();
    f.client.check_in(&a, &f.secret);
    f.client.check_in(&b, &f.secret);

    f.client.finalize();

    // The ghost's deposit splits evenly between the two who showed.
    let share = DEPOSIT / 2;
    assert_eq!(f.balance(&a), DEPOSIT + FEE_ALLOWANCE + share);
    assert_eq!(f.balance(&b), DEPOSIT + FEE_ALLOWANCE + share);
    assert_eq!(f.balance(&ghost), 0);
    assert_eq!(f.balance(&f.client.address), 0);
}

#[test]
fn finalize_with_nobody_showing_returns_everything_to_the_organizer() {
    let f = setup(ForfeitPolicy::SplitAmongAttendees);
    let opening = f.balance(&f.organizer);
    let pool = FEE_ALLOWANCE * i128::from(CAPACITY);

    let ghost = f.guest(DEPOSIT);
    f.client.rsvp(&ghost);

    f.client.finalize();

    // No attendees to split among: the forfeited deposit must not be stranded.
    assert_eq!(f.balance(&f.organizer), opening + DEPOSIT + pool);
    assert_eq!(f.balance(&f.client.address), 0);
}

#[test]
fn actions_after_finalize_are_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);
    f.client.finalize();

    assert_eq!(
        f.client.try_check_in(&guest, &f.secret),
        Err(Ok(Error::AlreadyFinalized))
    );
    assert_eq!(f.client.try_finalize(), Err(Ok(Error::AlreadyFinalized)));

    // Finalized is terminal: no phase call may resurrect a settled event.
    let latecomer = f.guest(DEPOSIT);
    assert_eq!(
        f.client.try_rsvp(&latecomer),
        Err(Ok(Error::AlreadyFinalized))
    );
    assert_eq!(
        f.client.try_open_checkin(),
        Err(Ok(Error::AlreadyFinalized))
    );
    assert_eq!(f.client.try_reopen_rsvp(), Err(Ok(Error::AlreadyFinalized)));
}

#[test]
fn initialize_twice_is_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let code_hash = f.env.crypto().sha256(&f.secret).to_bytes();

    assert_eq!(
        f.client.try_initialize(
            &f.organizer,
            &f.token,
            &DEPOSIT,
            &FEE_ALLOWANCE,
            &CAPACITY,
            &code_hash,
            &ForfeitPolicy::ToOrganizer,
        ),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn initialize_rejects_nonsense_parameters() {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let organizer = Address::generate(&env);
    let code_hash = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, b"x"))
        .to_bytes();

    let client = EventContractClient::new(&env, &env.register(EventContract, ()));
    assert_eq!(
        client.try_initialize(
            &organizer,
            &token,
            &0,
            &FEE_ALLOWANCE,
            &CAPACITY,
            &code_hash,
            &ForfeitPolicy::ToOrganizer
        ),
        Err(Ok(Error::InvalidDeposit))
    );
    assert_eq!(
        client.try_initialize(
            &organizer,
            &token,
            &DEPOSIT,
            &FEE_ALLOWANCE,
            &0,
            &code_hash,
            &ForfeitPolicy::ToOrganizer
        ),
        Err(Ok(Error::InvalidCapacity))
    );
}

#[test]
fn check_in_before_the_organizer_opens_it_is_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);

    // The secret is right, but check-in hasn't started.
    assert_eq!(
        f.client.try_check_in(&guest, &f.secret),
        Err(Ok(Error::CheckInNotOpen))
    );
    assert_eq!(f.balance(&guest), 0);
}

#[test]
fn reserving_after_check_in_opens_is_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    f.client.open_checkin();

    // This is the hole the phases exist to close: someone forwarded the link
    // can no longer reserve on the spot and immediately check in, pocketing the
    // fee allowance and diluting the real attendees' share of the forfeits.
    let freeloader = f.guest(DEPOSIT);
    assert_eq!(
        f.client.try_rsvp(&freeloader),
        Err(Ok(Error::ReservationsClosed))
    );
    assert_eq!(f.balance(&freeloader), DEPOSIT);
    assert_eq!(f.client.get_checked_in().len(), 0);
}

#[test]
fn the_organizer_can_reopen_reservations_for_a_latecomer() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let early = f.guest(DEPOSIT);
    f.client.rsvp(&early);
    f.client.open_checkin();
    f.client.check_in(&early, &f.secret);

    f.client.reopen_rsvp();
    assert_eq!(f.client.get_phase(), Phase::Reserving);

    let latecomer = f.guest(DEPOSIT);
    f.client.rsvp(&latecomer);

    // Reopening must not undo anyone who already checked in.
    assert_eq!(f.balance(&early), DEPOSIT + FEE_ALLOWANCE);
    assert_eq!(f.client.get_checked_in().len(), 1);

    f.client.open_checkin();
    f.client.check_in(&latecomer, &f.secret);
    assert_eq!(f.balance(&latecomer), DEPOSIT + FEE_ALLOWANCE);
}

#[test]
fn phase_moves_are_rejected_from_the_wrong_phase() {
    let f = setup(ForfeitPolicy::ToOrganizer);

    // Already Reserving.
    assert_eq!(f.client.try_reopen_rsvp(), Err(Ok(Error::WrongPhase)));
    f.client.open_checkin();
    // Already CheckingIn.
    assert_eq!(f.client.try_open_checkin(), Err(Ok(Error::WrongPhase)));
}

#[test]
fn phase_changes_need_the_organizer() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let stranger = Address::generate(&f.env);

    // mock_all_auths() is on, so pin auth to someone who isn't the organizer.
    f.env.set_auths(&[]);
    f.env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &stranger,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &f.client.address,
            fn_name: "open_checkin",
            args: soroban_sdk::vec![&f.env],
            sub_invokes: &[],
        },
    }]);
    assert!(f.client.try_open_checkin().is_err());
    assert_eq!(f.client.get_phase(), Phase::Reserving);
}

#[test]
fn a_fresh_event_starts_in_reserving() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    assert_eq!(f.client.get_phase(), Phase::Reserving);
    assert!(!f.client.is_finalized());
}
