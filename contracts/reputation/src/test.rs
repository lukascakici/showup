#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;

struct Fixture {
    env: Env,
    reputation: ReputationContractClient<'static>,
    admin: Address,
    factory: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let reputation = ReputationContractClient::new(&env, &env.register(ReputationContract, ()));
    reputation.initialize(&admin, &factory);

    Fixture {
        env,
        reputation,
        admin,
        factory,
    }
}

impl Fixture {
    /// A stand-in for a factory-deployed event contract.
    ///
    /// `mock_all_auths` makes any address able to authorize, so a plain address
    /// is enough to exercise the gate here. Day 3 replaces it with the real
    /// event contract calling in for itself.
    fn registered_event(&self) -> Address {
        let event = Address::generate(&self.env);
        self.reputation.register_event(&event);
        event
    }
}

fn zero() -> Score {
    Score {
        shows: 0,
        no_shows: 0,
    }
}

#[test]
fn initialize_records_the_admin_and_the_factory() {
    let f = setup();

    assert_eq!(f.reputation.get_admin(), f.admin);
    assert_eq!(f.reputation.get_factory(), f.factory);
}

#[test]
fn initialize_twice_is_rejected() {
    let f = setup();
    let other = Address::generate(&f.env);

    assert_eq!(
        f.reputation.try_initialize(&other, &other),
        Err(Ok(Error::AlreadyInitialized))
    );
    // The second call must not have taken any of its arguments.
    assert_eq!(f.reputation.get_admin(), f.admin);
}

#[test]
fn register_event_requires_the_factorys_authorization() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let reputation = ReputationContractClient::new(&env, &env.register(ReputationContract, ()));
    reputation.initialize(&admin, &factory);

    // Nobody has authorized anything now, so the factory has not either.
    env.set_auths(&[]);
    let event = Address::generate(&env);
    assert!(reputation.try_register_event(&event).is_err());
    assert!(!reputation.is_registered(&event));
}

#[test]
fn register_event_opens_the_gate() {
    let f = setup();
    let event = Address::generate(&f.env);

    assert!(!f.reputation.is_registered(&event));
    f.reputation.register_event(&event);
    assert!(f.reputation.is_registered(&event));
}

#[test]
fn register_event_is_idempotent() {
    let f = setup();
    let event = f.registered_event();
    let member = Address::generate(&f.env);

    f.reputation.register_event(&event);
    f.reputation.register_event(&event);

    // Re-registering must not disturb anything that was already recorded.
    f.reputation.record_checkin(&event, &member);
    f.reputation.register_event(&event);
    assert_eq!(
        f.reputation.get_score(&member),
        Score {
            shows: 1,
            no_shows: 0
        }
    );
}

#[test]
fn a_write_from_an_unregistered_address_is_rejected() {
    let f = setup();
    let impostor = Address::generate(&f.env);
    let member = Address::generate(&f.env);

    // This is the gate doing its job: every auth in this env is mocked, so the
    // only thing standing between the caller and a score write is the allowlist.
    assert_eq!(
        f.reputation.try_record_checkin(&impostor, &member),
        Err(Ok(Error::NotAnEvent))
    );
    assert_eq!(
        f.reputation.try_record_no_show(&impostor, &member),
        Err(Ok(Error::NotAnEvent))
    );
    assert_eq!(f.reputation.get_score(&member), zero());
}

#[test]
fn a_check_in_raises_the_score() {
    let f = setup();
    let event = f.registered_event();
    let member = Address::generate(&f.env);

    f.reputation.record_checkin(&event, &member);

    assert_eq!(
        f.reputation.get_score(&member),
        Score {
            shows: 1,
            no_shows: 0
        }
    );
}

#[test]
fn a_no_show_lowers_the_score() {
    let f = setup();
    let event = f.registered_event();
    let member = Address::generate(&f.env);

    f.reputation.record_checkin(&event, &member);
    f.reputation.record_no_show(&event, &member);

    // Both counters stand on their own: showing up once and flaking once is not
    // the same story as never having been to anything.
    assert_eq!(
        f.reputation.get_score(&member),
        Score {
            shows: 1,
            no_shows: 1
        }
    );
}

#[test]
fn an_unknown_member_reads_as_zero() {
    let f = setup();
    let stranger = Address::generate(&f.env);

    assert_eq!(f.reputation.get_score(&stranger), zero());
}

#[test]
fn scores_accumulate_across_events_and_stay_per_member() {
    let f = setup();
    let first = f.registered_event();
    let second = f.registered_event();
    let alice = Address::generate(&f.env);
    let bob = Address::generate(&f.env);

    f.reputation.record_checkin(&first, &alice);
    f.reputation.record_checkin(&second, &alice);
    f.reputation.record_no_show(&second, &bob);

    // One ledger, many events — that is the entire reason this contract is
    // separate from the event contract.
    assert_eq!(
        f.reputation.get_score(&alice),
        Score {
            shows: 2,
            no_shows: 0
        }
    );
    assert_eq!(
        f.reputation.get_score(&bob),
        Score {
            shows: 0,
            no_shows: 1
        }
    );
}

#[test]
fn writes_before_initialize_are_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let reputation = ReputationContractClient::new(&env, &env.register(ReputationContract, ()));
    let event = Address::generate(&env);
    let member = Address::generate(&env);

    // NotInitialized rather than NotAnEvent: "misconfigured" and "not allowed"
    // are different problems and cost different fixes.
    assert_eq!(
        reputation.try_record_checkin(&event, &member),
        Err(Ok(Error::NotInitialized))
    );
    assert_eq!(
        reputation.try_register_event(&event),
        Err(Ok(Error::NotInitialized))
    );
    assert_eq!(reputation.try_get_admin(), Err(Ok(Error::NotInitialized)));
}

#[test]
fn set_factory_moves_the_gate() {
    let f = setup();
    let next_factory = Address::generate(&f.env);
    f.reputation.set_factory(&next_factory);

    assert_eq!(f.reputation.get_factory(), next_factory);

    // The point of the setter: a redeployed factory can keep writing to the
    // scores that are already here.
    let event = Address::generate(&f.env);
    f.reputation.register_event(&event);
    assert!(f.reputation.is_registered(&event));
}

#[test]
fn set_factory_is_admin_only() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let reputation = ReputationContractClient::new(&env, &env.register(ReputationContract, ()));
    reputation.initialize(&admin, &factory);

    env.set_auths(&[]);
    let hijacker = Address::generate(&env);
    assert!(reputation.try_set_factory(&hijacker).is_err());
    assert_eq!(reputation.get_factory(), factory);
}

#[test]
fn upgrade_is_admin_only() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);
    let reputation = ReputationContractClient::new(&env, &env.register(ReputationContract, ()));
    reputation.initialize(&admin, &factory);

    env.set_auths(&[]);
    let hash: BytesN<32> = BytesN::from_array(&env, &[7u8; 32]);
    assert!(reputation.try_upgrade(&hash).is_err());
}
