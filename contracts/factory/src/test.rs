#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::Bytes;

// The event contract is pulled in as built wasm, not as a crate dependency —
// CI must therefore build the wasm before running these tests.
#[allow(clippy::too_many_arguments)] // generated client mirrors initialize's arity
mod event_contract {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/event.wasm");
}

const DEPOSIT: i128 = 100;
const FEE_ALLOWANCE: i128 = 2;
const CAPACITY: u32 = 4;

struct Fixture {
    env: Env,
    factory: EventFactoryClient<'static>,
    token: Address,
    code_hash: BytesN<32>,
    secret: Bytes,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();

    let admin = Address::generate(&env);
    let factory = EventFactoryClient::new(&env, &env.register(EventFactory, ()));
    let wasm_hash = env.deployer().upload_contract_wasm(event_contract::WASM);
    factory.initialize(&admin, &wasm_hash);

    let secret = Bytes::from_slice(&env, b"open-sesame");
    let code_hash = env.crypto().sha256(&secret).to_bytes();

    Fixture {
        env,
        factory,
        token,
        code_hash,
        secret,
    }
}

impl Fixture {
    fn funded(&self, amount: i128) -> Address {
        let who = Address::generate(&self.env);
        StellarAssetClient::new(&self.env, &self.token).mint(&who, &amount);
        who
    }

    fn balance(&self, who: &Address) -> i128 {
        soroban_sdk::token::Client::new(&self.env, &self.token).balance(who)
    }

    fn create(&self, organizer: &Address) -> Address {
        self.factory.create_event(
            organizer,
            &self.token,
            &DEPOSIT,
            &FEE_ALLOWANCE,
            &CAPACITY,
            &self.code_hash,
            &ForfeitPolicy::ToOrganizer,
        )
    }
}

#[test]
fn create_event_deploys_an_initialized_event() {
    let f = setup();
    let organizer = f.funded(10_000);

    let event = f.create(&organizer);

    let client = event_contract::Client::new(&f.env, &event);
    let config = client.get_config();
    assert_eq!(config.organizer, organizer);
    assert_eq!(config.deposit, DEPOSIT);
    assert_eq!(config.capacity, CAPACITY);
    // The event is live: its fee pool was funded during create_event.
    assert_eq!(f.balance(&event), FEE_ALLOWANCE * i128::from(CAPACITY));
}

#[test]
fn create_event_records_the_event() {
    let f = setup();
    let organizer = f.funded(10_000);

    let event = f.create(&organizer);

    assert_eq!(f.factory.get_event_count(), 1);
    assert_eq!(f.factory.list_events(), soroban_sdk::vec![&f.env, event]);
}

#[test]
fn each_event_gets_its_own_address() {
    let f = setup();
    let a = f.funded(10_000);
    let b = f.funded(10_000);

    let first = f.create(&a);
    let second = f.create(&b);
    let third = f.create(&a);

    assert_ne!(first, second);
    assert_ne!(second, third);
    assert_ne!(first, third);
    assert_eq!(f.factory.get_event_count(), 3);
}

#[test]
fn a_factory_made_event_runs_the_whole_flow() {
    let f = setup();
    let organizer = f.funded(10_000);
    let event = f.create(&organizer);
    let client = event_contract::Client::new(&f.env, &event);

    let guest = f.funded(DEPOSIT);
    client.rsvp(&guest);
    assert_eq!(f.balance(&guest), 0);

    client.check_in(&guest, &f.secret);

    // Deposit back plus the fee reimbursement, straight from a deployed event.
    assert_eq!(f.balance(&guest), DEPOSIT + FEE_ALLOWANCE);
}

#[test]
fn create_event_requires_the_organizers_authorization() {
    let env = Env::default();
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let admin = Address::generate(&env);
    let organizer = Address::generate(&env);

    let factory = EventFactoryClient::new(&env, &env.register(EventFactory, ()));
    env.mock_all_auths();
    let wasm_hash = env.deployer().upload_contract_wasm(event_contract::WASM);
    factory.initialize(&admin, &wasm_hash);

    let code_hash = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, b"s"))
        .to_bytes();

    // Nobody has authorized anything now — create_event must not go through.
    env.set_auths(&[]);
    let attempt = factory.try_create_event(
        &organizer,
        &token,
        &DEPOSIT,
        &FEE_ALLOWANCE,
        &CAPACITY,
        &code_hash,
        &ForfeitPolicy::ToOrganizer,
    );
    assert!(attempt.is_err());
}

#[test]
fn initialize_twice_is_rejected() {
    let f = setup();
    let admin = Address::generate(&f.env);
    let wasm_hash = f.env.deployer().upload_contract_wasm(event_contract::WASM);

    assert_eq!(
        f.factory.try_initialize(&admin, &wasm_hash),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn create_event_before_initialize_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let organizer = Address::generate(&env);
    let factory = EventFactoryClient::new(&env, &env.register(EventFactory, ()));
    let code_hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);

    assert_eq!(
        factory.try_create_event(
            &organizer,
            &token,
            &DEPOSIT,
            &FEE_ALLOWANCE,
            &CAPACITY,
            &code_hash,
            &ForfeitPolicy::ToOrganizer,
        ),
        Err(Ok(Error::NotInitialized))
    );
}

#[test]
fn events_from_different_organizers_stay_independent() {
    let f = setup();
    let alice = f.funded(10_000);
    let bob = f.funded(10_000);

    let alices = f.create(&alice);
    let bobs = f.create(&bob);

    let guest = f.funded(DEPOSIT);
    event_contract::Client::new(&f.env, &alices).rsvp(&guest);

    // RSVPing to one event must not touch the other.
    assert_eq!(
        event_contract::Client::new(&f.env, &alices)
            .get_reserved()
            .len(),
        1
    );
    assert_eq!(
        event_contract::Client::new(&f.env, &bobs)
            .get_reserved()
            .len(),
        0
    );
}
