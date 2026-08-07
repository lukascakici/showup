#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;

// Pulled in as built wasm rather than as a crate dependency, so CI has to build
// the wasm before running these tests.
mod reputation_contract {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/reputation.wasm");
}

/// A ledger that traps on every write.
///
/// This is not a hypothetical. A reputation contract can be mid-`upgrade`, wired
/// to the wrong factory, un-registered, or simply out of resources — and any of
/// those, without the `try_` calls in `record_score`, would take a guest's
/// refund down with it.
#[contract]
pub struct PanickingReputation;

#[contractimpl]
impl PanickingReputation {
    pub fn register_event(_env: Env, _event: Address) {
        panic!("reputation is down");
    }
    pub fn record_checkin(_env: Env, _event: Address, _member: Address) {
        panic!("reputation is down");
    }
    pub fn record_no_show(_env: Env, _event: Address, _member: Address) {
        panic!("reputation is down");
    }
}

/// What the event under test is wired to.
enum Ledger {
    /// No ledger at all — an event from before reputation existed, which has to
    /// keep working untouched.
    None,
    /// A real reputation contract that has registered this event.
    Real,
    /// The trapping contract above.
    Panicking,
}

const DEPOSIT: i128 = 100;
const FEE_ALLOWANCE: i128 = 2;
const CAPACITY: u32 = 4;

struct Fixture {
    env: Env,
    client: EventContractClient<'static>,
    token: Address,
    organizer: Address,
    secret: Bytes,
    reputation: Option<reputation_contract::Client<'static>>,
}

/// The default for every test in this file is a **live** ledger.
///
/// That is deliberate: it means the whole existing suite — every deposit,
/// refund, forfeit split and phase rejection — is now also an assertion that
/// recording scores changes none of it. The `Ledger::None` and
/// `Ledger::Panicking` paths get their own tests below.
fn setup(policy: ForfeitPolicy) -> Fixture {
    setup_with(policy, Ledger::Real)
}

fn setup_with(policy: ForfeitPolicy, ledger: Ledger) -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = asset.address();

    let organizer = Address::generate(&env);
    StellarAssetClient::new(&env, &token).mint(&organizer, &1_000_000);

    let contract_id = env.register(EventContract, ());
    let client = EventContractClient::new(&env, &contract_id);

    // The ledger exists and has registered the event before the event is
    // initialized against it — the same order `create_event` uses on-chain.
    let (address, reputation) = match ledger {
        Ledger::None => (None, None),
        Ledger::Real => {
            let rep = reputation_contract::Client::new(
                &env,
                &env.register(reputation_contract::WASM, ()),
            );
            rep.initialize(&Address::generate(&env), &Address::generate(&env));
            rep.register_event(&contract_id);
            (Some(rep.address.clone()), Some(rep))
        }
        Ledger::Panicking => (Some(env.register(PanickingReputation, ())), None),
    };

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
        &address,
    );

    Fixture {
        env,
        client,
        token,
        organizer,
        secret,
        reputation,
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

    /// How many events this event contract has published so far.
    ///
    /// Deliberately a count and not a decoded event: `ContractEvents` only
    /// compares at the XDR level, and hand-building the expected XDR would be a
    /// far bigger lie-surface than counting.
    fn published_count(&self) -> usize {
        use soroban_sdk::testutils::Events as _;
        self.env
            .events()
            .all()
            .filter_by_contract(&self.client.address)
            .events()
            .len()
    }

    /// `(shows, no_shows)` as the ledger has them.
    fn score(&self, who: &Address) -> (u32, u32) {
        let score = self
            .reputation
            .as_ref()
            .expect("this fixture has no real ledger")
            .get_score(who);
        (score.shows, score.no_shows)
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
            &None,
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
            &ForfeitPolicy::ToOrganizer,
            &None
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
            &ForfeitPolicy::ToOrganizer,
            &None
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

#[test]
fn a_check_in_raises_exactly_one_score_by_one() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let shower = f.guest(DEPOSIT);
    let bystander = f.guest(DEPOSIT);
    f.client.rsvp(&shower);
    f.client.rsvp(&bystander);
    f.client.open_checkin();

    assert_eq!(f.score(&shower), (0, 0));

    f.client.check_in(&shower, &f.secret);

    assert_eq!(f.score(&shower), (1, 0));
    // Reserving is not showing up. Nothing moves until someone actually
    // proves attendance, or until finalize settles the ones who didn't.
    assert_eq!(f.score(&bystander), (0, 0));
}

#[test]
fn finalize_lowers_exactly_the_guests_who_never_showed() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let shower = f.guest(DEPOSIT);
    let ghost = f.guest(DEPOSIT);
    let other_ghost = f.guest(DEPOSIT);
    let uninvolved = f.guest(0);

    f.client.rsvp(&shower);
    f.client.rsvp(&ghost);
    f.client.rsvp(&other_ghost);
    f.client.open_checkin();
    f.client.check_in(&shower, &f.secret);

    f.client.finalize();

    assert_eq!(f.score(&ghost), (0, 1));
    assert_eq!(f.score(&other_ghost), (0, 1));
    // The person who showed keeps their show and gains no no-show; someone who
    // never reserved is not touched at all.
    assert_eq!(f.score(&shower), (1, 0));
    assert_eq!(f.score(&uninvolved), (0, 0));
}

#[test]
fn reopening_does_not_turn_an_attendee_into_a_no_show() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let early = f.guest(DEPOSIT);
    f.client.rsvp(&early);
    f.client.open_checkin();
    f.client.check_in(&early, &f.secret);

    // `early` is still on the reserved list after this, so finalize walks
    // straight over them. Attendance, not list membership, is what decides.
    f.client.reopen_rsvp();
    let latecomer = f.guest(DEPOSIT);
    f.client.rsvp(&latecomer);
    f.client.finalize();

    assert_eq!(f.score(&early), (1, 0));
    assert_eq!(f.score(&latecomer), (0, 1));
}

#[test]
fn a_broken_ledger_cannot_cost_a_guest_their_deposit() {
    let f = setup_with(ForfeitPolicy::ToOrganizer, Ledger::Panicking);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);
    f.client.open_checkin();

    // Guard against this passing for the wrong reason: if the config held
    // `None`, `record_score` would return before ever touching the ledger and
    // the assertions below would prove nothing at all.
    let ledger = f.client.get_config().reputation.unwrap();
    assert!(PanickingReputationClient::new(&f.env, &ledger)
        .try_record_checkin(&f.client.address, &guest)
        .is_err());

    // Every call into that ledger traps. If `record_score` used the plain client
    // instead of `try_`, the trap would roll back the whole invocation and the
    // guest's deposit would stay locked in the contract until finalize — the
    // single failure this design exists to prevent.
    f.client.check_in(&guest, &f.secret);

    assert_eq!(f.balance(&guest), DEPOSIT + FEE_ALLOWANCE);
    assert_eq!(f.client.get_attendance(&guest), Some(Attendance::CheckedIn));
    assert_eq!(f.client.get_checked_in().len(), 1);
}

#[test]
fn a_dropped_score_write_is_published_rather_than_silently_lost() {
    let broken = setup_with(ForfeitPolicy::ToOrganizer, Ledger::Panicking);
    let live = setup(ForfeitPolicy::ToOrganizer);

    for f in [&broken, &live] {
        let guest = f.guest(DEPOSIT);
        f.client.rsvp(&guest);
        f.client.open_checkin();
        f.client.check_in(&guest, &f.secret);
    }

    // Identical flows; the broken one published exactly one extra event, which
    // is `ReputationSkipped`.
    //
    // This is what the refund test above cannot show. `try_` returns a nested
    // result, and if a caught trap arrived as `Ok(Err(..))` instead of
    // `Err(..)`, the `is_err()` branch in `record_score` would never fire — the
    // refund would still succeed and the failure would vanish without a trace.
    assert_eq!(broken.published_count(), live.published_count() + 1);
}

#[test]
fn a_broken_ledger_cannot_stop_a_finalize() {
    let f = setup_with(ForfeitPolicy::SplitAmongAttendees, Ledger::Panicking);
    let shower = f.guest(DEPOSIT);
    let ghost = f.guest(DEPOSIT);
    f.client.rsvp(&shower);
    f.client.rsvp(&ghost);
    f.client.open_checkin();
    f.client.check_in(&shower, &f.secret);

    f.client.finalize();

    // The forfeit still reaches the person who turned up, and nothing is left
    // stranded in the contract.
    assert_eq!(f.balance(&shower), DEPOSIT + FEE_ALLOWANCE + DEPOSIT);
    assert_eq!(f.balance(&f.client.address), 0);
    assert!(f.client.is_finalized());
}

#[test]
fn an_event_with_no_ledger_runs_the_whole_flow() {
    let f = setup_with(ForfeitPolicy::ToOrganizer, Ledger::None);
    let opening = f.balance(&f.organizer);
    let pool = FEE_ALLOWANCE * i128::from(CAPACITY);

    assert_eq!(f.client.get_config().reputation, None);

    let shower = f.guest(DEPOSIT);
    let ghost = f.guest(DEPOSIT);
    f.client.rsvp(&shower);
    f.client.rsvp(&ghost);
    f.client.open_checkin();
    f.client.check_in(&shower, &f.secret);
    f.client.finalize();

    // Byte for byte the pre-reputation behaviour. Events created by the v1
    // factory still on Testnet have `None` here and must keep settling.
    assert_eq!(f.balance(&shower), DEPOSIT + FEE_ALLOWANCE);
    assert_eq!(f.balance(&ghost), 0);
    assert_eq!(
        f.balance(&f.organizer),
        opening + DEPOSIT + (pool - FEE_ALLOWANCE)
    );
    assert_eq!(f.balance(&f.client.address), 0);
}

#[test]
fn the_event_writes_its_scores_as_itself() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);
    f.client.open_checkin();
    f.client.check_in(&guest, &f.secret);

    let reputation = f.reputation.as_ref().unwrap();
    // The ledger registered this contract's address, and that is the address
    // the write arrived under — so the gate on the other side is checking the
    // same thing the factory registered, not something the event chose.
    assert!(reputation.is_registered(&f.client.address));
    assert_eq!(f.score(&guest), (1, 0));
}
