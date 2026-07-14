#![no_std]

//! Showup — the event factory.
//!
//! Anyone can open an event from their own wallet: the factory deploys a fresh
//! event contract, initializes it in the same transaction, and keeps the list of
//! everything it has ever created so the frontend has one address to read from.

use interfaces::{EventClient, ForfeitPolicy};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env, Vec,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
}

#[contracttype]
pub enum DataKey {
    Admin,
    EventWasmHash,
    Events,
    /// Monotonic counter; doubles as the deploy salt so every event gets its own
    /// address.
    Count,
}

#[contractevent]
pub struct EventCreated {
    pub event: Address,
    pub organizer: Address,
    pub deposit: i128,
    pub capacity: u32,
}

#[contract]
pub struct EventFactory;

#[contractimpl]
impl EventFactory {
    /// Register the factory against the uploaded event wasm.
    pub fn initialize(env: Env, admin: Address, event_wasm_hash: BytesN<32>) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::EventWasmHash, &event_wasm_hash);
        env.storage()
            .instance()
            .set(&DataKey::Events, &Vec::<Address>::new(&env));
        env.storage().instance().set(&DataKey::Count, &0u32);
        Ok(())
    }

    /// Deploy and initialize an event owned by `organizer`.
    ///
    /// The organizer authorizes this whole call tree, which is what lets the
    /// event's own `initialize` pull the fee pool out of their wallet as part of
    /// the same transaction.
    #[allow(clippy::too_many_arguments)]
    pub fn create_event(
        env: Env,
        organizer: Address,
        token: Address,
        deposit: i128,
        fee_allowance: i128,
        capacity: u32,
        code_hash: BytesN<32>,
        policy: ForfeitPolicy,
    ) -> Result<Address, Error> {
        let wasm_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::EventWasmHash)
            .ok_or(Error::NotInitialized)?;
        organizer.require_auth();

        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let mut salt = [0u8; 32];
        salt[..4].copy_from_slice(&count.to_be_bytes());
        let salt = BytesN::from_array(&env, &salt);

        let event = env
            .deployer()
            .with_current_contract(salt)
            .deploy_v2(wasm_hash, ());

        EventClient::new(&env, &event).initialize(
            &organizer,
            &token,
            &deposit,
            &fee_allowance,
            &capacity,
            &code_hash,
            &policy,
        );

        let mut events = Self::events_list(&env);
        events.push_back(event.clone());
        env.storage().instance().set(&DataKey::Events, &events);
        env.storage().instance().set(&DataKey::Count, &(count + 1));

        EventCreated {
            event: event.clone(),
            organizer,
            deposit,
            capacity,
        }
        .publish(&env);
        Ok(event)
    }

    pub fn list_events(env: Env) -> Vec<Address> {
        Self::events_list(&env)
    }

    pub fn get_event_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    fn events_list(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::Events)
            .unwrap_or_else(|| Vec::new(env))
    }
}

mod test;
