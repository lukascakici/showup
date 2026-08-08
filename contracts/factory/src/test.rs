#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::StellarAssetClient;
use soroban_sdk::{Bytes, String};

// The other contracts are pulled in as built wasm, not as crate dependencies —
// CI must therefore build the wasm before running these tests.
#[allow(clippy::too_many_arguments)] // generated client mirrors initialize's arity
mod event_contract {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/event.wasm");
}

mod reputation_contract {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/reputation.wasm");
}

const TITLE: &str = "Thursday football at Kadikoy";
const STARTS_AT: u64 = 1_787_252_400;
const DEPOSIT: i128 = 100;
const FEE_ALLOWANCE: i128 = 2;
const CAPACITY: u32 = 4;

struct Fixture {
    env: Env,
    factory: EventFactoryClient<'static>,
    admin: Address,
    token: Address,
    code_hash: BytesN<32>,
    secret: Bytes,
    event_wasm_hash: BytesN<32>,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();

    let admin = Address::generate(&env);
    let factory = EventFactoryClient::new(&env, &env.register(EventFactory, ()));
    let event_wasm_hash = env.deployer().upload_contract_wasm(event_contract::WASM);
    factory.initialize(&admin, &event_wasm_hash);

    let secret = Bytes::from_slice(&env, b"open-sesame");
    let code_hash = env.crypto().sha256(&secret).to_bytes();

    Fixture {
        env,
        factory,
        admin,
        token,
        code_hash,
        secret,
        event_wasm_hash,
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
            &String::from_str(&self.env, TITLE),
            &STARTS_AT,
            &self.token,
            &DEPOSIT,
            &FEE_ALLOWANCE,
            &CAPACITY,
            &self.code_hash,
            &ForfeitPolicy::ToOrganizer,
        )
    }

    fn try_create(&self, organizer: &Address) -> Result<Address, ()> {
        self.factory
            .try_create_event(
                organizer,
                &String::from_str(&self.env, TITLE),
                &STARTS_AT,
                &self.token,
                &DEPOSIT,
                &FEE_ALLOWANCE,
                &CAPACITY,
                &self.code_hash,
                &ForfeitPolicy::ToOrganizer,
            )
            .map(|ok| ok.unwrap())
            .map_err(|_| ())
    }

    /// Deploy a reputation ledger that trusts this factory, and wire the factory
    /// back to it — the same two-way setup the Testnet deployment does.
    fn with_reputation(&self) -> reputation_contract::Client<'static> {
        let reputation = reputation_contract::Client::new(
            &self.env,
            &self.env.register(reputation_contract::WASM, ()),
        );
        reputation.initialize(&self.admin, &self.factory.address);
        self.factory.set_reputation(&reputation.address);
        reputation
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

    client.open_checkin();
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
        &String::from_str(&env, TITLE),
        &STARTS_AT,
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
            &String::from_str(&env, TITLE),
            &STARTS_AT,
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
fn create_event_registers_the_event_with_reputation() {
    let f = setup();
    let reputation = f.with_reputation();
    let organizer = f.funded(10_000);

    let event = f.create(&organizer);

    // The gate, from the other side: the ledger only ever hears about events
    // from the factory, so anything it has registered is by construction a
    // contract the factory deployed from an admin-chosen wasm.
    assert!(reputation.is_registered(&event));
    assert!(!reputation.is_registered(&Address::generate(&f.env)));
    assert_eq!(f.factory.get_reputation(), Some(reputation.address.clone()));
}

#[test]
fn create_event_works_without_a_reputation_ledger() {
    let f = setup();
    let organizer = f.funded(10_000);

    assert_eq!(f.factory.get_reputation(), None);
    let event = f.create(&organizer);

    // Not decoration: the v1 factory already live on Testnet has no ledger, and
    // an unwired factory must keep producing perfectly working events.
    assert_eq!(
        event_contract::Client::new(&f.env, &event)
            .get_config()
            .organizer,
        organizer
    );
}

#[test]
fn set_reputation_moves_new_events_to_the_new_ledger() {
    let f = setup();
    let first_ledger = f.with_reputation();
    let organizer = f.funded(10_000);
    let before = f.create(&organizer);

    let second_ledger = f.with_reputation();
    let after = f.create(&organizer);

    assert!(first_ledger.is_registered(&before));
    assert!(second_ledger.is_registered(&after));
    // Each event stays with the ledger it was registered against. Moving the
    // factory moves new events; it does not re-home old ones behind their back,
    // and it does not reach forward into a ledger that has not seen them.
    assert!(!first_ledger.is_registered(&after));
    assert!(!second_ledger.is_registered(&before));
}

#[test]
fn set_event_wasm_hash_points_new_events_at_the_new_wasm() {
    let f = setup();
    let organizer = f.funded(10_000);
    let first = f.create(&organizer);

    // A hash nothing was ever uploaded under. create_event reads the stored
    // hash at deploy time, so the very next creation has to fail on it.
    let bogus: BytesN<32> = BytesN::from_array(&f.env, &[9u8; 32]);
    f.factory.set_event_wasm_hash(&bogus);
    assert_eq!(f.factory.get_event_wasm_hash(), bogus);
    assert!(f.try_create(&organizer).is_err());

    // The event created before the change carries on untouched — people have
    // deposits locked in there.
    assert_eq!(
        event_contract::Client::new(&f.env, &first)
            .get_config()
            .deposit,
        DEPOSIT
    );

    // And pointing back at a real wasm brings the factory straight back, with
    // no redeploy. That recoverability is the entire reason this setter exists.
    f.factory.set_event_wasm_hash(&f.event_wasm_hash);
    let second = f.create(&organizer);
    assert_ne!(first, second);
    assert_eq!(f.factory.get_event_count(), 2);
}

#[test]
fn the_admin_setters_reject_everyone_else() {
    let f = setup();
    let stranger = Address::generate(&f.env);
    let hash: BytesN<32> = BytesN::from_array(&f.env, &[9u8; 32]);

    // Nobody has authorized anything now, the admin least of all.
    f.env.set_auths(&[]);
    assert!(f.factory.try_set_event_wasm_hash(&hash).is_err());
    assert!(f.factory.try_set_reputation(&stranger).is_err());
    assert!(f.factory.try_upgrade(&hash).is_err());

    f.env.mock_all_auths();
    assert_eq!(f.factory.get_event_wasm_hash(), f.event_wasm_hash);
    assert_eq!(f.factory.get_reputation(), None);
}

#[test]
fn upgrade_replaces_the_factorys_code() {
    let f = setup();
    let address = f.factory.address.clone();
    let organizer = f.funded(10_000);
    f.create(&organizer);

    let hash = f
        .env
        .deployer()
        .upload_contract_wasm(reputation_contract::WASM);
    f.factory.upgrade(&hash);

    // The address now answers a completely different contract's interface,
    // which is the strongest proof available that the code itself was swapped
    // rather than some pointer being rewritten. Nothing else in Showup would
    // ever upgrade a factory into a reputation ledger — it is only here because
    // it is the most unambiguous "this is not the same code" a test can assert.
    let swapped = reputation_contract::Client::new(&f.env, &address);
    assert!(!swapped.is_registered(&Address::generate(&f.env)));
    assert!(f.factory.try_get_event_count().is_err());
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
