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

/* -------------------------------------------------------------------------- */
/* The record beyond turning up                                               */
/* -------------------------------------------------------------------------- */

#[test]
fn an_unknown_member_has_an_empty_record_rather_than_no_record() {
    let f = setup();
    let stranger = Address::generate(&f.env);

    // Same contract as `get_score`: a newcomer is a zero, not an error, so no
    // caller has to special-case the first time it sees somebody.
    assert_eq!(
        f.reputation.get_record(&stranger),
        Record {
            shows: 0,
            no_shows: 0,
            vouches_given: 0,
            vouches_broken: 0,
            events_organised: 0,
        }
    );
}

#[test]
fn a_record_written_before_the_extras_existed_still_reads() {
    let f = setup();
    let event = f.registered_event();
    let member = Address::generate(&f.env);

    // This is the whole reason `Score` was left alone. A member with shows and
    // no extras entry is exactly the state of every wallet in the live ledger:
    // written by the previous wasm, and it has to keep reading after an upgrade
    // rather than decoding into nothing.
    f.reputation.record_checkin(&event, &member);
    f.reputation.record_no_show(&event, &member);

    assert_eq!(
        f.reputation.get_record(&member),
        Record {
            shows: 1,
            no_shows: 1,
            vouches_given: 0,
            vouches_broken: 0,
            events_organised: 0,
        }
    );
    // And the old read is untouched, which is what the deployed event contract
    // calls to enforce a score gate — without a `try_`.
    assert_eq!(
        f.reputation.get_score(&member),
        Score {
            shows: 1,
            no_shows: 1
        }
    );
}

#[test]
fn organising_is_counted_when_an_event_settles() {
    let f = setup();
    let first = f.registered_event();
    let second = f.registered_event();
    let organizer = Address::generate(&f.env);

    f.reputation.record_organised(&first, &organizer);
    f.reputation.record_organised(&second, &organizer);

    assert_eq!(f.reputation.get_record(&organizer).events_organised, 2);
    // Organising is not attending. Somebody who runs ten events and turns up to
    // none has a record that says exactly that.
    assert_eq!(f.reputation.get_score(&organizer), zero());
}

#[test]
fn organising_is_refused_from_an_address_that_is_not_an_event() {
    let f = setup();
    let stranger = Address::generate(&f.env);
    let organizer = Address::generate(&f.env);

    // The same gate as a score write, and for the same reason: a count anybody
    // could raise is a count nobody can read anything into.
    assert_eq!(
        f.reputation.try_record_organised(&stranger, &organizer),
        Err(Ok(Error::NotAnEvent))
    );
    assert_eq!(f.reputation.get_record(&organizer).events_organised, 0);
}

#[test]
fn anyone_can_renew_a_record_they_do_not_own() {
    let f = setup();
    let event = f.registered_event();
    let member = Address::generate(&f.env);
    f.reputation.record_checkin(&event, &member);

    // No auth, no admin, no ownership. This is the point: a lease that only the
    // owner could extend would expire for exactly the person who stopped needing
    // to prove anything, and the only way back would be through us.
    f.reputation.renew(&member);

    assert_eq!(f.reputation.get_score(&member).shows, 1);
}

#[test]
fn renewing_a_record_that_was_never_written_changes_nothing() {
    let f = setup();
    let stranger = Address::generate(&f.env);

    // No entry means no lease to extend. Creating one to renew would let anybody
    // fill the ledger with blank records at our expense, on a call that takes no
    // authorization by design.
    f.reputation.renew(&stranger);

    assert_eq!(f.reputation.get_record(&stranger).shows, 0);
    assert!(!f.env.as_contract(&f.reputation.address, || {
        f.env
            .storage()
            .persistent()
            .has(&DataKey::Score(stranger.clone()))
    }));
}
