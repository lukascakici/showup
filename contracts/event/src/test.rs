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
    pub fn record_organised(_env: Env, _event: Address, _organizer: Address) {
        panic!("reputation is down");
    }
    pub fn record_vouch_given(_env: Env, _event: Address, _voucher: Address) {
        panic!("reputation is down");
    }
    pub fn record_vouch_broken(_env: Env, _event: Address, _voucher: Address) {
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

const TITLE: &str = "Thursday football at Kadikoy";
/// 2026-08-20 19:00 UTC. Informational only, but every event needs one.
const STARTS_AT: u64 = 1_787_252_400;
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
    setup_gated(policy, ledger, Admission::Open)
}

/// The same fixture with the admission mode opened up as a third dimension.
fn setup_gated(policy: ForfeitPolicy, ledger: Ledger, admission: Admission) -> Fixture {
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
        &String::from_str(&env, TITLE),
        &STARTS_AT,
        &token,
        &DEPOSIT,
        &FEE_ALLOWANCE,
        &CAPACITY,
        &code_hash,
        &policy,
        &address,
        &admission,
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

    /// Give `who` a record, by writing the check-ins straight to the ledger.
    ///
    /// Shorter than running them through whole events, and it exercises the
    /// same path: the ledger has this event registered, so these are the
    /// identical writes `check_in` makes.
    fn give_shows(&self, who: &Address, shows: u32) {
        let ledger = self
            .reputation
            .as_ref()
            .expect("this fixture has no real ledger");
        for _ in 0..shows {
            ledger.record_checkin(&self.client.address, who);
        }
    }

    /// Charge somebody a broken vouch directly, the way a *previous* event
    /// would have. One fixture is one `Env` with one ledger, so a second event
    /// cannot be stood up to break the vouch at — and the rule under test is
    /// precisely that the charge follows the member across events.
    fn break_a_vouch(&self, who: &Address) {
        self.reputation
            .as_ref()
            .expect("this fixture has no real ledger")
            .record_vouch_broken(&self.client.address, who);
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

/// The gated fixture: a live ledger and a two-show threshold.
fn gated(min_shows: u32) -> Fixture {
    setup_gated(
        ForfeitPolicy::ToOrganizer,
        Ledger::Real,
        Admission::Score(min_shows),
    )
}

#[test]
fn score_below_threshold_is_refused() {
    let f = gated(2);
    let guest = f.guest(DEPOSIT);
    f.give_shows(&guest, 1);

    assert_eq!(f.client.try_rsvp(&guest), Err(Ok(Error::ScoreTooLow)));
    // Refused before the transfer, not after it and refunded.
    assert_eq!(f.balance(&guest), DEPOSIT);
    assert_eq!(f.client.get_reserved().len(), 0);
}

#[test]
fn score_exactly_at_threshold_is_admitted() {
    let f = gated(2);
    let guest = f.guest(DEPOSIT);
    f.give_shows(&guest, 2);

    f.client.rsvp(&guest);

    // The boundary is `<`, not `<=`. Getting this backwards would turn every
    // published threshold into a lie by exactly one event.
    assert_eq!(f.client.get_attendance(&guest), Some(Attendance::Reserved));
}

#[test]
fn score_above_threshold_is_admitted() {
    let f = gated(2);
    let guest = f.guest(DEPOSIT);
    f.give_shows(&guest, 5);

    f.client.rsvp(&guest);

    assert_eq!(f.client.get_attendance(&guest), Some(Attendance::Reserved));
}

#[test]
fn score_zero_wallet_refused_from_a_gated_event() {
    let f = gated(1);
    // A wallet the ledger has never seen. It reads as `{0, 0}` rather than
    // erroring, so this is the path a brand-new guest actually takes.
    let newcomer = f.guest(DEPOSIT);

    assert_eq!(f.score(&newcomer), (0, 0));
    assert_eq!(f.client.try_rsvp(&newcomer), Err(Ok(Error::ScoreTooLow)));
}

#[test]
fn no_shows_do_not_count_against_the_gate() {
    let f = gated(1);
    let guest = f.guest(DEPOSIT);
    f.give_shows(&guest, 1);
    f.reputation
        .as_ref()
        .unwrap()
        .record_no_show(&f.client.address, &guest);

    // The gate reads `shows`, full stop. Netting no-shows off it would be a
    // second, invisible formula on top of the one the organizer chose.
    assert_eq!(f.score(&guest), (1, 1));
    f.client.rsvp(&guest);
    assert_eq!(f.client.get_attendance(&guest), Some(Attendance::Reserved));
}

#[test]
fn open_event_admits_anyone_as_before() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let newcomer = f.guest(DEPOSIT);

    assert_eq!(f.score(&newcomer), (0, 0));
    f.client.rsvp(&newcomer);

    // Every event on the live factory is an open one. The branch above must not
    // have changed a thing for them.
    assert_eq!(
        f.client.get_attendance(&newcomer),
        Some(Attendance::Reserved)
    );
}

#[test]
fn score_gate_without_a_reputation_address_refuses_cleanly() {
    let f = setup_gated(
        ForfeitPolicy::ToOrganizer,
        Ledger::None,
        Admission::Score(1),
    );
    let guest = f.guest(DEPOSIT);

    // A gate with nothing to read cannot answer. It says so, instead of
    // panicking or falling open.
    assert_eq!(f.client.try_rsvp(&guest), Err(Ok(Error::NoReputation)));
}

/* -------------------------------------------------------------------------- */
/* Vouching                                                                   */
/* -------------------------------------------------------------------------- */

/// An event admitted by `n` vouches, with a live ledger.
fn by_vouch(needed: u32) -> Fixture {
    setup_gated(
        ForfeitPolicy::ToOrganizer,
        Ledger::Real,
        Admission::Vouch(needed),
    )
}

#[test]
fn a_vouch_opens_the_door_for_somebody_with_no_record() {
    let f = by_vouch(1);
    let member = f.guest(DEPOSIT);
    f.give_shows(&member, 1);
    let newcomer = f.guest(DEPOSIT);

    // Before: a wallet the ledger has never seen, refused.
    assert_eq!(f.score(&newcomer), (0, 0));
    assert_eq!(
        f.client.try_rsvp(&newcomer),
        Err(Ok(Error::NotEnoughVouches))
    );

    f.client.vouch(&member, &newcomer);
    f.client.rsvp(&newcomer);

    // This is the whole point of the mode: somebody with nothing of their own
    // gets in on another member's record.
    assert_eq!(
        f.client.get_attendance(&newcomer),
        Some(Attendance::Reserved)
    );
    assert_eq!(f.client.get_vouches(&newcomer), 1);
}

#[test]
fn one_short_of_the_threshold_is_still_refused() {
    let f = by_vouch(2);
    let first = f.guest(DEPOSIT);
    f.give_shows(&first, 1);
    let newcomer = f.guest(DEPOSIT);

    f.client.vouch(&first, &newcomer);

    // The boundary is `<`, like the score gate. One vouch short is a refusal,
    // not a rounding.
    assert_eq!(
        f.client.try_rsvp(&newcomer),
        Err(Ok(Error::NotEnoughVouches))
    );

    let second = f.guest(DEPOSIT);
    f.give_shows(&second, 1);
    f.client.vouch(&second, &newcomer);
    f.client.rsvp(&newcomer);
    assert_eq!(f.client.get_vouches(&newcomer), 2);
}

#[test]
fn a_member_cannot_meet_a_threshold_alone() {
    let f = by_vouch(2);
    let member = f.guest(DEPOSIT);
    f.give_shows(&member, 1);
    let newcomer = f.guest(DEPOSIT);

    f.client.vouch(&member, &newcomer);
    // Without this, "two members vouched" means "one member clicked twice" and
    // the threshold is decoration.
    assert_eq!(
        f.client.try_vouch(&member, &newcomer),
        Err(Ok(Error::AlreadyVouched))
    );
    assert_eq!(f.client.get_vouches(&newcomer), 1);
}

#[test]
fn nobody_vouches_for_themselves() {
    let f = by_vouch(1);
    let member = f.guest(DEPOSIT);
    f.give_shows(&member, 1);

    // The same hole as vouching twice, one step shorter.
    assert_eq!(
        f.client.try_vouch(&member, &member),
        Err(Ok(Error::CannotVouchForYourself))
    );
}

#[test]
fn a_stranger_cannot_vouch() {
    let f = by_vouch(1);
    let stranger = f.guest(DEPOSIT);
    let newcomer = f.guest(DEPOSIT);

    // A vouch from a record with nothing in it would make the gate a formality:
    // anybody could make a second wallet and wave themselves through.
    assert_eq!(f.score(&stranger), (0, 0));
    assert_eq!(
        f.client.try_vouch(&stranger, &newcomer),
        Err(Ok(Error::CannotVouch))
    );
}

#[test]
fn a_broken_vouch_costs_the_voucher_their_standing() {
    let f = by_vouch(1);
    let rep = f.reputation.as_ref().expect("a live ledger");
    let member = f.guest(DEPOSIT);
    f.give_shows(&member, 1);
    let newcomer = f.guest(DEPOSIT);

    f.client.vouch(&member, &newcomer);
    assert_eq!(rep.get_record(&member).vouches_given, 1);

    f.client.rsvp(&newcomer);
    // And then they don't turn up.
    f.client.finalize(&f.organizer);

    let record = rep.get_record(&member);
    assert_eq!(record.vouches_broken, 1);
    // The voucher's own attendance is untouched: they went to everything they
    // went to, and rewriting that would make `shows` mean two things at once.
    assert_eq!(record.shows, 1);
    assert_eq!(record.no_shows, 0);
}

#[test]
fn several_vouchers_for_one_absentee_are_all_charged() {
    let f = by_vouch(2);
    let rep = f.reputation.as_ref().expect("a live ledger");
    let first = f.guest(DEPOSIT);
    let second = f.guest(DEPOSIT);
    f.give_shows(&first, 1);
    f.give_shows(&second, 1);
    let newcomer = f.guest(DEPOSIT);

    f.client.vouch(&first, &newcomer);
    f.client.vouch(&second, &newcomer);
    f.client.rsvp(&newcomer);
    f.client.finalize(&f.organizer);

    // The charge walks the whole voucher list. Charging only the first would
    // make every vouch after it free, and a threshold of two cheaper per head
    // than a threshold of one.
    assert_eq!(rep.get_record(&first).vouches_broken, 1);
    assert_eq!(rep.get_record(&second).vouches_broken, 1);
}

#[test]
fn a_voucher_who_was_also_a_no_show_gets_both_counters() {
    let f = by_vouch(1);
    let rep = f.reputation.as_ref().expect("a live ledger");
    let member = f.guest(DEPOSIT);
    let backer = f.guest(DEPOSIT);
    f.give_shows(&member, 1);
    f.give_shows(&backer, 1);
    let newcomer = f.guest(DEPOSIT);

    // The member backs the newcomer, and is themselves backed in — under this
    // mode a record alone is not admission, however good it is.
    f.client.vouch(&member, &newcomer);
    f.client.vouch(&backer, &member);
    f.client.rsvp(&member);
    f.client.rsvp(&newcomer);
    f.client.finalize(&f.organizer);

    // Two failures, two numbers. Missing your own event and backing somebody
    // who missed theirs are different things, and a record that folded them
    // together could not answer either question afterwards.
    let record = rep.get_record(&member);
    assert_eq!(record.shows, 1);
    assert_eq!(record.no_shows, 1);
    assert_eq!(record.vouches_given, 1);
    assert_eq!(record.vouches_broken, 1);
}

#[test]
fn broken_vouch_and_settlement_happen_in_one_invocation() {
    let f = by_vouch(1);
    let rep = f.reputation.as_ref().expect("a live ledger");
    let member = f.guest(DEPOSIT);
    f.give_shows(&member, 1);
    let newcomer = f.guest(DEPOSIT);

    f.client.vouch(&member, &newcomer);
    f.client.rsvp(&newcomer);

    let organizer_before = f.balance(&f.organizer);
    assert_eq!(rep.get_record(&member).vouches_broken, 0);

    f.client.finalize(&f.organizer);

    // One call moves both. There is no ordering of transactions in which the
    // deposit has been forfeited and the voucher's record still says nothing
    // went wrong, because there is only ever one transaction.
    //
    // The organizer gets the forfeited deposit and the fee pool nobody drew
    // from, since nobody checked in.
    let unspent_pool = FEE_ALLOWANCE * i128::from(CAPACITY);
    assert_eq!(
        f.balance(&f.organizer),
        organizer_before + DEPOSIT + unspent_pool
    );
    assert_eq!(f.balance(&f.client.address), 0);
    assert_eq!(rep.get_record(&member).vouches_broken, 1);
}

#[test]
fn one_broken_vouch_closes_the_door_on_vouching_at_any_show_count() {
    let f = by_vouch(1);
    let member = f.guest(DEPOSIT);
    f.give_shows(&member, 50);
    let newcomer = f.guest(DEPOSIT);

    // Fifty shows is far past any threshold, and the rule is not a threshold —
    // which is what stops somebody buying the right to keep waving strangers in
    // by attending a lot of their own events.
    f.break_a_vouch(&member);

    assert_eq!(f.score(&member), (50, 0));
    assert_eq!(
        f.client.try_vouch(&member, &newcomer),
        Err(Ok(Error::CannotVouch))
    );
}

#[test]
fn showing_up_leaves_the_voucher_clean() {
    let f = by_vouch(1);
    let rep = f.reputation.as_ref().expect("a live ledger");
    let member = f.guest(DEPOSIT);
    f.give_shows(&member, 1);
    let newcomer = f.guest(DEPOSIT);

    f.client.vouch(&member, &newcomer);
    f.client.rsvp(&newcomer);
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&newcomer, &f.secret);
    f.client.finalize(&f.organizer);

    // The vouch was good. Nothing is charged, and the member may vouch again.
    assert_eq!(rep.get_record(&member).vouches_broken, 0);
    assert_eq!(rep.get_record(&member).vouches_given, 1);
}

#[test]
fn a_vouch_moves_no_money_and_takes_no_spot() {
    let f = by_vouch(1);
    let member = f.guest(DEPOSIT);
    f.give_shows(&member, 1);
    let newcomer = f.guest(DEPOSIT);

    f.client.vouch(&member, &newcomer);

    // Permission to reserve, not a reservation. Both wallets still hold every
    // stroop they started with and the event still has all its capacity.
    assert_eq!(f.balance(&member), DEPOSIT);
    assert_eq!(f.balance(&newcomer), DEPOSIT);
    assert_eq!(f.client.get_reserved().len(), 0);
    assert_eq!(f.client.get_attendance(&newcomer), None);
}

#[test]
fn vouching_at_an_event_that_does_not_ask_for_it_is_wrong_mode() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let member = f.guest(DEPOSIT);
    let newcomer = f.guest(DEPOSIT);

    assert_eq!(
        f.client.try_vouch(&member, &newcomer),
        Err(Ok(Error::WrongAdmissionMode))
    );
}

#[test]
fn vouching_closes_when_check_in_opens() {
    let f = by_vouch(1);
    let member = f.guest(DEPOSIT);
    f.give_shows(&member, 1);
    let newcomer = f.guest(DEPOSIT);
    f.client.open_checkin(&f.organizer);

    assert_eq!(
        f.client.try_vouch(&member, &newcomer),
        Err(Ok(Error::ReservationsClosed))
    );
}

#[test]
fn a_vouch_gate_without_a_ledger_refuses_cleanly() {
    let f = setup_gated(
        ForfeitPolicy::ToOrganizer,
        Ledger::None,
        Admission::Vouch(1),
    );
    let member = f.guest(DEPOSIT);
    let newcomer = f.guest(DEPOSIT);

    // There is nothing to check a voucher against. It says so rather than
    // letting anybody through or trapping.
    assert_eq!(
        f.client.try_vouch(&member, &newcomer),
        Err(Ok(Error::NoReputation))
    );
}

/// An approval-gated event with a live ledger.
fn by_approval() -> Fixture {
    setup_gated(
        ForfeitPolicy::ToOrganizer,
        Ledger::Real,
        Admission::Approval,
    )
}

#[test]
fn application_moves_no_money() {
    let f = by_approval();
    let applicant = f.guest(DEPOSIT);
    let pool = f.balance(&f.client.address);

    f.client.apply(&applicant);

    // The SOW's promise, as an assertion: nothing is taken before the organizer
    // says yes. Not taken and refunded — never taken.
    assert_eq!(f.balance(&applicant), DEPOSIT);
    assert_eq!(f.balance(&f.client.address), pool);
    assert_eq!(
        f.client.get_attendance(&applicant),
        Some(Attendance::Applied)
    );
    assert_eq!(f.client.get_reserved().len(), 0);
}

#[test]
fn approved_applicant_can_reserve() {
    let f = by_approval();
    let applicant = f.guest(DEPOSIT);

    f.client.apply(&applicant);
    f.client.approve(&f.organizer, &applicant);
    f.client.rsvp(&applicant);

    // Two transactions, and the deposit moved in the second one — the
    // applicant's own.
    assert_eq!(f.balance(&applicant), 0);
    assert_eq!(
        f.client.get_attendance(&applicant),
        Some(Attendance::Reserved)
    );
    assert_eq!(f.client.get_reserved().len(), 1);
}

#[test]
fn declined_applicant_cannot_reserve() {
    let f = by_approval();
    let applicant = f.guest(DEPOSIT);

    f.client.apply(&applicant);
    f.client.decline(&f.organizer, &applicant);

    assert_eq!(
        f.client.get_attendance(&applicant),
        Some(Attendance::Declined)
    );
    assert_eq!(f.client.try_rsvp(&applicant), Err(Ok(Error::NotApplied)));
    assert_eq!(f.balance(&applicant), DEPOSIT);
}

#[test]
fn a_declined_applicant_cannot_ask_again() {
    let f = by_approval();
    let applicant = f.guest(DEPOSIT);

    f.client.apply(&applicant);
    f.client.decline(&f.organizer, &applicant);

    // Declining is terminal in both directions: the organizer's inbox is not
    // something a rejected applicant can reopen at will.
    assert_eq!(
        f.client.try_apply(&applicant),
        Err(Ok(Error::AlreadyApplied))
    );
}

#[test]
fn approving_someone_who_never_applied_is_refused() {
    let f = by_approval();
    let stranger = f.guest(DEPOSIT);

    assert_eq!(
        f.client.try_approve(&f.organizer, &stranger),
        Err(Ok(Error::NotApplied))
    );
    assert_eq!(
        f.client.try_decline(&f.organizer, &stranger),
        Err(Ok(Error::NotApplied))
    );
    assert_eq!(f.client.get_attendance(&stranger), None);
}

#[test]
fn applying_twice_is_refused() {
    let f = by_approval();
    let applicant = f.guest(DEPOSIT);

    f.client.apply(&applicant);

    assert_eq!(
        f.client.try_apply(&applicant),
        Err(Ok(Error::AlreadyApplied))
    );
}

#[test]
fn applying_to_an_open_event_is_wrong_mode() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);

    // There is nobody to approve you at an open event, so an application there
    // would be a record that nothing could ever clear.
    assert_eq!(
        f.client.try_apply(&guest),
        Err(Ok(Error::WrongAdmissionMode))
    );
    assert_eq!(
        f.client.try_approve(&f.organizer, &guest),
        Err(Ok(Error::WrongAdmissionMode))
    );
}

#[test]
fn reserving_while_still_applied_is_refused() {
    let f = by_approval();
    let applicant = f.guest(DEPOSIT);

    f.client.apply(&applicant);

    // Unanswered is not yes. This is the one that would quietly turn the whole
    // mode into an open event if the check read "has a record" instead of "has
    // an approved record".
    assert_eq!(f.client.try_rsvp(&applicant), Err(Ok(Error::NotApplied)));
    assert_eq!(f.balance(&applicant), DEPOSIT);
}

#[test]
fn applications_do_not_consume_capacity() {
    let f = by_approval();

    // Twice the capacity in applications, none of them answered.
    for _ in 0..CAPACITY * 2 {
        let applicant = f.guest(DEPOSIT);
        f.client.apply(&applicant);
    }

    // A pile of applications must not be able to lock an event that has nobody
    // in it — that is a denial of service the organizer cannot clear.
    let approved = f.guest(DEPOSIT);
    f.client.apply(&approved);
    f.client.approve(&f.organizer, &approved);
    f.client.rsvp(&approved);

    assert_eq!(f.client.get_reserved().len(), 1);
}

#[test]
fn an_approved_applicant_who_never_reserved_cannot_check_in() {
    let f = by_approval();
    let applicant = f.guest(DEPOSIT);
    f.client.apply(&applicant);
    f.client.approve(&f.organizer, &applicant);
    f.client.open_checkin(&f.organizer);

    // Approval is permission to lock a deposit, not a spot. Skipping the
    // reservation would mean walking out with the fee allowance for an event
    // nothing was ever staked on.
    assert_eq!(
        f.client.try_check_in(&applicant, &f.secret),
        Err(Ok(Error::NotReserved))
    );
}

#[test]
fn applications_close_when_check_in_opens() {
    let f = by_approval();
    let applicant = f.guest(DEPOSIT);
    f.client.open_checkin(&f.organizer);

    assert_eq!(
        f.client.try_apply(&applicant),
        Err(Ok(Error::ReservationsClosed))
    );
}

#[test]
fn check_in_returns_the_deposit_and_the_fee_allowance() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);
    f.client.open_checkin(&f.organizer);

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

    f.client.open_checkin(&f.organizer);

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
    f.client.open_checkin(&f.organizer);

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
    f.client.open_checkin(&f.organizer);
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
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&shower, &f.secret);

    f.client.finalize(&f.organizer);

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
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&a, &f.secret);
    f.client.check_in(&b, &f.secret);

    f.client.finalize(&f.organizer);

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

    f.client.finalize(&f.organizer);

    // No attendees to split among: the forfeited deposit must not be stranded.
    assert_eq!(f.balance(&f.organizer), opening + DEPOSIT + pool);
    assert_eq!(f.balance(&f.client.address), 0);
}

#[test]
fn actions_after_finalize_are_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);
    f.client.finalize(&f.organizer);

    assert_eq!(
        f.client.try_check_in(&guest, &f.secret),
        Err(Ok(Error::AlreadyFinalized))
    );
    assert_eq!(
        f.client.try_finalize(&f.organizer),
        Err(Ok(Error::AlreadyFinalized))
    );

    // Finalized is terminal: no phase call may resurrect a settled event.
    let latecomer = f.guest(DEPOSIT);
    assert_eq!(
        f.client.try_rsvp(&latecomer),
        Err(Ok(Error::AlreadyFinalized))
    );
    assert_eq!(
        f.client.try_open_checkin(&f.organizer),
        Err(Ok(Error::AlreadyFinalized))
    );
    assert_eq!(
        f.client.try_reopen_rsvp(&f.organizer),
        Err(Ok(Error::AlreadyFinalized))
    );
}

#[test]
fn initialize_twice_is_rejected() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let code_hash = f.env.crypto().sha256(&f.secret).to_bytes();

    assert_eq!(
        f.client.try_initialize(
            &f.organizer,
            &String::from_str(&f.env, TITLE),
            &STARTS_AT,
            &f.token,
            &DEPOSIT,
            &FEE_ALLOWANCE,
            &CAPACITY,
            &code_hash,
            &ForfeitPolicy::ToOrganizer,
            &None,
            &Admission::Open,
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
            &String::from_str(&env, TITLE),
            &STARTS_AT,
            &token,
            &0,
            &FEE_ALLOWANCE,
            &CAPACITY,
            &code_hash,
            &ForfeitPolicy::ToOrganizer,
            &None,
            &Admission::Open,
        ),
        Err(Ok(Error::InvalidDeposit))
    );
    assert_eq!(
        client.try_initialize(
            &organizer,
            &String::from_str(&env, TITLE),
            &STARTS_AT,
            &token,
            &DEPOSIT,
            &FEE_ALLOWANCE,
            &0,
            &code_hash,
            &ForfeitPolicy::ToOrganizer,
            &None,
            &Admission::Open,
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
    f.client.open_checkin(&f.organizer);

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
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&early, &f.secret);

    f.client.reopen_rsvp(&f.organizer);
    assert_eq!(f.client.get_phase(), Phase::Reserving);

    let latecomer = f.guest(DEPOSIT);
    f.client.rsvp(&latecomer);

    // Reopening must not undo anyone who already checked in.
    assert_eq!(f.balance(&early), DEPOSIT + FEE_ALLOWANCE);
    assert_eq!(f.client.get_checked_in().len(), 1);

    f.client.open_checkin(&f.organizer);
    f.client.check_in(&latecomer, &f.secret);
    assert_eq!(f.balance(&latecomer), DEPOSIT + FEE_ALLOWANCE);
}

#[test]
fn phase_moves_are_rejected_from_the_wrong_phase() {
    let f = setup(ForfeitPolicy::ToOrganizer);

    // Already Reserving.
    assert_eq!(
        f.client.try_reopen_rsvp(&f.organizer),
        Err(Ok(Error::WrongPhase))
    );
    f.client.open_checkin(&f.organizer);
    // Already CheckingIn.
    assert_eq!(
        f.client.try_open_checkin(&f.organizer),
        Err(Ok(Error::WrongPhase))
    );
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
    assert!(f.client.try_open_checkin(&f.organizer).is_err());
    assert_eq!(f.client.get_phase(), Phase::Reserving);
}

#[test]
fn a_fresh_event_starts_in_reserving() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    assert_eq!(f.client.get_phase(), Phase::Reserving);
    assert!(!f.client.is_finalized());
}

#[test]
fn an_event_carries_its_name_and_time() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let config = f.client.get_config();

    assert_eq!(config.title, String::from_str(&f.env, TITLE));
    assert_eq!(config.starts_at, STARTS_AT);
}

#[test]
fn a_nameless_or_timeless_event_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let organizer = Address::generate(&env);
    // The accepted case really initializes, which pulls the fee pool out of the
    // organizer's wallet — so they need one.
    StellarAssetClient::new(&env, &token).mint(&organizer, &1_000_000);
    let code_hash = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, b"x"))
        .to_bytes();
    let client = EventContractClient::new(&env, &env.register(EventContract, ()));

    let attempt = |title: &str, starts_at: u64| {
        client.try_initialize(
            &organizer,
            &String::from_str(&env, title),
            &starts_at,
            &token,
            &DEPOSIT,
            &FEE_ALLOWANCE,
            &CAPACITY,
            &code_hash,
            &ForfeitPolicy::ToOrganizer,
            &None,
            &Admission::Open,
        )
    };

    assert_eq!(attempt("", STARTS_AT), Err(Ok(Error::InvalidTitle)));
    assert_eq!(attempt(TITLE, 0), Err(Ok(Error::InvalidStartTime)));

    // The cap is 100 *bytes*, not characters, and Turkish is where that stops
    // being pedantry: this title is well under 100 characters but its multi-byte
    // letters take it close to the limit.
    let turkish = "çğıöşüÇĞIÖŞÜçğıöşüÇĞIÖŞÜçğıöşüÇĞIÖŞÜçğıöşüÇĞIÖŞÜç";
    assert!(turkish.chars().count() < turkish.len(), "not multi-byte");
    assert!(turkish.len() <= 100);
    assert!(attempt(turkish, STARTS_AT).is_ok());

    // Still under 100 characters, now over 100 bytes. A counter that measured
    // characters would accept this and the contract would reject it — which is
    // exactly the mismatch the frontend has to avoid showing people.
    let too_long = "çğıöşüÇĞIÖŞÜçğıöşüÇĞIÖŞÜçğıöşüÇĞIÖŞÜçğıöşüÇĞIÖŞÜçğıöşü";
    assert!(
        too_long.chars().count() < 100,
        "should pass a character count"
    );
    assert!(too_long.len() > 100, "but fail a byte count");
    let fresh = EventContractClient::new(&env, &env.register(EventContract, ()));
    assert_eq!(
        fresh.try_initialize(
            &organizer,
            &String::from_str(&env, too_long),
            &STARTS_AT,
            &token,
            &DEPOSIT,
            &FEE_ALLOWANCE,
            &CAPACITY,
            &code_hash,
            &ForfeitPolicy::ToOrganizer,
            &None,
            &Admission::Open,
        ),
        Err(Ok(Error::InvalidTitle))
    );
}

#[test]
fn an_untouched_event_outlives_the_default_archival_window() {
    let f = setup(ForfeitPolicy::ToOrganizer);

    // The bug this pins: Soroban state is rented, and Testnet's default lease is
    // about a week. An event created today for a date three weeks out would
    // archive before anyone could check in, and every read against it would
    // start failing — which looks exactly like the event having been deleted.
    //
    // `initialize` therefore extends the lease immediately, without waiting for
    // a first guest. Nobody has touched this event since it was created.
    use soroban_sdk::testutils::storage::Instance as _;
    let ledgers_left = f
        .env
        .as_contract(&f.client.address, || f.env.storage().instance().get_ttl());

    assert!(
        ledgers_left >= interfaces::LEDGERS_PER_DAY * 89,
        "an untouched event has only {ledgers_left} ledgers left, \
         which is about {} days — it needs ~90",
        ledgers_left / interfaces::LEDGERS_PER_DAY
    );
}

#[test]
fn a_guests_attendance_gets_its_own_lease() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);

    // Attendance is persistent storage keyed per address, so it is a separate
    // entry from the instance and expires on its own schedule. A guest whose
    // attendance archived would read as never having reserved — and `finalize`
    // would then not even count them as a no-show.
    use soroban_sdk::testutils::storage::Persistent as _;
    let ledgers_left = f.env.as_contract(&f.client.address, || {
        f.env
            .storage()
            .persistent()
            .get_ttl(&DataKey::Attendance(guest.clone()))
    });

    assert!(
        ledgers_left >= interfaces::LEDGERS_PER_DAY * 89,
        "attendance has only {ledgers_left} ledgers left"
    );
}

#[test]
fn a_check_in_raises_exactly_one_score_by_one() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let shower = f.guest(DEPOSIT);
    let bystander = f.guest(DEPOSIT);
    f.client.rsvp(&shower);
    f.client.rsvp(&bystander);
    f.client.open_checkin(&f.organizer);

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
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&shower, &f.secret);

    f.client.finalize(&f.organizer);

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
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&early, &f.secret);

    // `early` is still on the reserved list after this, so finalize walks
    // straight over them. Attendance, not list membership, is what decides.
    f.client.reopen_rsvp(&f.organizer);
    let latecomer = f.guest(DEPOSIT);
    f.client.rsvp(&latecomer);
    f.client.finalize(&f.organizer);

    assert_eq!(f.score(&early), (1, 0));
    assert_eq!(f.score(&latecomer), (0, 1));
}

#[test]
fn a_broken_ledger_cannot_cost_a_guest_their_deposit() {
    let f = setup_with(ForfeitPolicy::ToOrganizer, Ledger::Panicking);
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);
    f.client.open_checkin(&f.organizer);

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
        f.client.open_checkin(&f.organizer);
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
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&shower, &f.secret);

    f.client.finalize(&f.organizer);

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
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&shower, &f.secret);
    f.client.finalize(&f.organizer);

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
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&guest, &f.secret);

    let reputation = f.reputation.as_ref().unwrap();
    // The ledger registered this contract's address, and that is the address
    // the write arrived under — so the gate on the other side is checking the
    // same thing the factory registered, not something the event chose.
    assert!(reputation.is_registered(&f.client.address));
    assert_eq!(f.score(&guest), (1, 0));
}

#[test]
fn a_co_host_can_run_the_event() {
    let f = by_approval();
    let cohost = f.guest(0);
    f.client.add_host(&f.organizer, &cohost);

    let applicant = f.guest(DEPOSIT);
    f.client.apply(&applicant);

    // Every one of the five gates, exercised by somebody who did not create the
    // event. Missing one call site is how a co-host ends up half a host.
    f.client.approve(&cohost, &applicant);
    f.client.rsvp(&applicant);
    f.client.open_checkin(&cohost);
    f.client.reopen_rsvp(&cohost);
    f.client.open_checkin(&cohost);
    f.client.check_in(&applicant, &f.secret);
    f.client.finalize(&cohost);

    assert!(f.client.is_finalized());
    assert!(f.client.is_host(&cohost));
}

#[test]
fn a_co_host_can_turn_an_applicant_down() {
    let f = by_approval();
    let cohost = f.guest(0);
    f.client.add_host(&f.organizer, &cohost);
    let applicant = f.guest(DEPOSIT);
    f.client.apply(&applicant);

    f.client.decline(&cohost, &applicant);

    assert_eq!(
        f.client.get_attendance(&applicant),
        Some(Attendance::Declined)
    );
}

#[test]
fn non_host_is_refused() {
    let f = by_approval();
    let stranger = f.guest(DEPOSIT);
    let applicant = f.guest(DEPOSIT);
    f.client.apply(&applicant);

    assert!(!f.client.is_host(&stranger));
    assert_eq!(
        f.client.try_open_checkin(&stranger),
        Err(Ok(Error::NotAHost))
    );
    assert_eq!(f.client.try_finalize(&stranger), Err(Ok(Error::NotAHost)));
    assert_eq!(
        f.client.try_approve(&stranger, &applicant),
        Err(Ok(Error::NotAHost))
    );
    assert_eq!(
        f.client.try_decline(&stranger, &applicant),
        Err(Ok(Error::NotAHost))
    );
    assert_eq!(
        f.client.try_add_host(&stranger, &stranger),
        Err(Ok(Error::NotAHost))
    );
}

#[test]
fn creator_cannot_be_removed() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let cohost = f.guest(0);
    f.client.add_host(&f.organizer, &cohost);

    // Not by a co-host, and not by themselves either. An event whose creator
    // can be removed is an event whose forfeits can be orphaned.
    assert_eq!(
        f.client.try_remove_host(&cohost, &f.organizer),
        Err(Ok(Error::CannotRemoveCreator))
    );
    assert_eq!(
        f.client.try_remove_host(&f.organizer, &f.organizer),
        Err(Ok(Error::CannotRemoveCreator))
    );
    assert!(f.client.is_host(&f.organizer));
}

#[test]
fn removed_host_loses_powers_immediately() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let cohost = f.guest(0);
    f.client.add_host(&f.organizer, &cohost);
    assert!(f.client.is_host(&cohost));

    f.client.remove_host(&f.organizer, &cohost);

    assert!(!f.client.is_host(&cohost));
    assert_eq!(f.client.try_open_checkin(&cohost), Err(Ok(Error::NotAHost)));
}

#[test]
fn adding_a_host_twice_changes_nothing() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let cohost = f.guest(0);

    f.client.add_host(&f.organizer, &cohost);
    f.client.add_host(&f.organizer, &cohost);

    // Idempotent on purpose: a retried transaction must not become an error
    // somebody has to interpret.
    assert_eq!(f.client.get_terms().hosts.len(), 2);
}

#[test]
fn removing_someone_who_was_never_a_host_is_refused() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let stranger = f.guest(0);

    assert_eq!(
        f.client.try_remove_host(&f.organizer, &stranger),
        Err(Ok(Error::NotAHost))
    );
}

#[test]
fn a_co_host_can_add_another_co_host() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let cohost = f.guest(0);
    f.client.add_host(&f.organizer, &cohost);
    let third = f.guest(0);

    f.client.add_host(&cohost, &third);

    assert!(f.client.is_host(&third));
}

#[test]
fn forfeits_still_land_with_the_creator() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let cohost = f.guest(0);
    f.client.add_host(&f.organizer, &cohost);

    let absentee = f.guest(DEPOSIT);
    f.client.rsvp(&absentee);
    let opening = f.balance(&f.organizer);

    // Settled by the co-host, paid to the creator. Hosting an event is not a
    // claim on its money.
    f.client.open_checkin(&cohost);
    f.client.finalize(&cohost);

    assert_eq!(f.balance(&cohost), 0);
    assert_eq!(
        f.balance(&f.organizer),
        opening + DEPOSIT + FEE_ALLOWANCE * i128::from(CAPACITY)
    );
}

#[test]
fn the_creator_is_the_first_host() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let terms = f.client.get_terms();

    assert_eq!(terms.hosts.len(), 1);
    assert_eq!(terms.hosts.get(0), Some(f.organizer.clone()));
    assert!(f.client.is_host(&f.organizer));
}

/* -------------------------------------------------------------------------- */
/* Every admission mode against every phase                                   */
/* -------------------------------------------------------------------------- */

// Three days of feature work each added a mode or a transition and tested its
// own happy path against its own gate. What none of them tested is the other
// gates: `apply` was written for Approval and refused on Open, and nobody asked
// what it does on a Score event. These are the boxes in that grid that nothing
// had ever called, written before the revision goes onto a chain where it holds
// other people's deposits.

#[test]
fn applying_to_a_score_gated_event_is_wrong_mode() {
    let f = gated(2);
    let guest = f.guest(DEPOSIT);
    f.give_shows(&guest, 5);

    // A qualifying wallet, so the refusal is about the mode and not the score.
    // There is nothing to approve here: the gate is the ledger's answer, and a
    // host saying yes on top of it would be a second gate nobody documented.
    assert_eq!(
        f.client.try_apply(&guest),
        Err(Ok(Error::WrongAdmissionMode))
    );
    assert_eq!(
        f.client.try_approve(&f.organizer, &guest),
        Err(Ok(Error::WrongAdmissionMode))
    );
    assert_eq!(
        f.client.try_decline(&f.organizer, &guest),
        Err(Ok(Error::WrongAdmissionMode))
    );
    assert_eq!(f.client.get_attendance(&guest), None);
}

#[test]
fn applying_to_a_vouch_gated_event_is_wrong_mode() {
    let f = setup_gated(
        ForfeitPolicy::ToOrganizer,
        Ledger::Real,
        Admission::Vouch(1),
    );
    let guest = f.guest(DEPOSIT);

    // A mode this revision cannot enforce is closed on every entrance, not just
    // on `rsvp`. Without this, `apply` would be a way to write a record into an
    // event whose gate does not exist yet.
    assert_eq!(
        f.client.try_apply(&guest),
        Err(Ok(Error::WrongAdmissionMode))
    );
    assert_eq!(
        f.client.try_approve(&f.organizer, &guest),
        Err(Ok(Error::WrongAdmissionMode))
    );
    assert_eq!(
        f.client.try_decline(&f.organizer, &guest),
        Err(Ok(Error::WrongAdmissionMode))
    );
    assert_eq!(f.client.get_attendance(&guest), None);
}

#[test]
fn reserving_without_ever_applying_is_refused() {
    let f = by_approval();
    let stranger = f.guest(DEPOSIT);

    // Never asked, so there is nothing that could have been answered. The gate
    // wants a yes on record, and the absence of a record is not one.
    assert_eq!(f.client.try_rsvp(&stranger), Err(Ok(Error::NotApplied)));
    assert_eq!(f.balance(&stranger), DEPOSIT);
}

#[test]
fn a_reserved_guest_cannot_be_declined_out_of_their_deposit() {
    let f = by_approval();
    let guest = f.guest(DEPOSIT);
    f.client.apply(&guest);
    f.client.approve(&f.organizer, &guest);
    f.client.rsvp(&guest);

    // The one combination in this grid that is about money. Once the deposit is
    // locked the guest's standing is `Reserved`, and `answer` only ever moves a
    // record that is still `Applied` — so a host cannot reach back and turn a
    // paid-up guest into a declined one, which would stand their deposit up
    // against a gate they can no longer pass.
    assert_eq!(
        f.client.try_decline(&f.organizer, &guest),
        Err(Ok(Error::NotApplied))
    );
    assert_eq!(
        f.client.try_approve(&f.organizer, &guest),
        Err(Ok(Error::NotApplied))
    );
    assert_eq!(f.client.get_attendance(&guest), Some(Attendance::Reserved));

    // And the deposit still comes back at the door.
    f.client.open_checkin(&f.organizer);
    f.client.check_in(&guest, &f.secret);
    assert_eq!(f.balance(&guest), DEPOSIT + FEE_ALLOWANCE);
}

#[test]
fn an_approval_granted_during_check_in_opens_nothing() {
    let f = by_approval();
    let guest = f.guest(DEPOSIT);
    f.client.apply(&guest);
    f.client.open_checkin(&f.organizer);

    // Answering a pending application is still allowed here, because a host
    // clearing their queue after the doors open is not a mistake. What it must
    // not do is become a late reservation: the phase closed the till, and an
    // approval is not a key to it.
    f.client.approve(&f.organizer, &guest);
    assert_eq!(f.client.get_attendance(&guest), Some(Attendance::Approved));
    assert_eq!(
        f.client.try_rsvp(&guest),
        Err(Ok(Error::ReservationsClosed))
    );
    assert_eq!(f.balance(&guest), DEPOSIT);
}

#[test]
fn applications_cannot_be_opened_or_answered_after_finalize() {
    let f = by_approval();
    let applicant = f.guest(DEPOSIT);
    f.client.apply(&applicant);
    f.client.finalize(&f.organizer);

    // `actions_after_finalize_are_rejected` covers the money and the phase
    // calls. These three are the approval path, and they were the ones left
    // outside it: a settled event must not still be taking or answering asks.
    let latecomer = f.guest(DEPOSIT);
    assert_eq!(
        f.client.try_apply(&latecomer),
        Err(Ok(Error::AlreadyFinalized))
    );
    assert_eq!(
        f.client.try_approve(&f.organizer, &applicant),
        Err(Ok(Error::AlreadyFinalized))
    );
    assert_eq!(
        f.client.try_decline(&f.organizer, &applicant),
        Err(Ok(Error::AlreadyFinalized))
    );
    assert_eq!(
        f.client.get_attendance(&applicant),
        Some(Attendance::Applied)
    );
}

#[test]
fn hosts_can_still_be_named_after_an_event_has_settled() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    f.client.finalize(&f.organizer);
    let latecomer = Address::generate(&f.env);

    // Deliberately allowed rather than overlooked. Every power a host has is
    // already refused by the phase, so the roster is the one thing left that
    // can be tidied on a finished event, and refusing it would buy nothing.
    f.client.add_host(&f.organizer, &latecomer);
    assert!(f.client.is_host(&latecomer));
    assert_eq!(
        f.client.try_open_checkin(&latecomer),
        Err(Ok(Error::AlreadyFinalized))
    );
}

#[test]
fn finalizing_counts_the_event_against_its_creator() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let rep = f.reputation.as_ref().expect("a live ledger");
    assert_eq!(rep.get_record(&f.organizer).events_organised, 0);

    f.client.finalize(&f.organizer);

    // Written at settlement rather than at creation: deploying a contract and
    // walking away is not running an event, and a count that included it would
    // be the easiest number on the whole ledger to inflate.
    assert_eq!(rep.get_record(&f.organizer).events_organised, 1);
    // And it is the creator's line, not the caller's — `finalize` takes a host.
    assert_eq!(f.score(&f.organizer), (0, 0));
}

#[test]
fn a_co_host_finalizing_still_credits_the_creator() {
    let f = setup(ForfeitPolicy::ToOrganizer);
    let rep = f.reputation.as_ref().expect("a live ledger");
    let cohost = Address::generate(&f.env);
    f.client.add_host(&f.organizer, &cohost);

    f.client.finalize(&cohost);

    // Same rule as the money: a co-host can run the event, and running it does
    // not make it theirs.
    assert_eq!(rep.get_record(&f.organizer).events_organised, 1);
    assert_eq!(rep.get_record(&cohost).events_organised, 0);
}

#[test]
fn a_broken_ledger_cannot_stop_an_event_from_settling() {
    let f = setup_gated(
        ForfeitPolicy::ToOrganizer,
        Ledger::Panicking,
        Admission::Open,
    );
    let guest = f.guest(DEPOSIT);
    f.client.rsvp(&guest);
    let opening = f.balance(&f.organizer);

    // The ledger traps on every write, including the organised count added
    // today. Settlement is where the money moves, and no number about anybody's
    // reputation is worth holding a deposit hostage for.
    f.client.finalize(&f.organizer);

    assert_eq!(
        f.balance(&f.organizer),
        opening + DEPOSIT + FEE_ALLOWANCE * i128::from(CAPACITY)
    );
}
