#![no_std]

//! Shared types and contract clients.
//!
//! The contracts talk to each other through the `#[contractclient]` traits here
//! rather than depending on each other's crates, which would drag the callee's
//! whole spec into the caller's wasm.

use soroban_sdk::{contractclient, contracttype, Address, BytesN, Env};

/// Where the deposits of no-shows go when an event is finalized.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ForfeitPolicy {
    /// Straight to the organizer.
    ToOrganizer,
    /// Split evenly among everyone who checked in.
    SplitAmongAttendees,
}

/// The slice of the event contract the factory needs to call.
///
/// `initialize` returns `Result<(), Error>` on the contract itself; a failure
/// there traps this call, which is what we want — a half-created event must not
/// survive `create_event`.
#[contractclient(name = "EventClient")]
pub trait Event {
    #[allow(clippy::too_many_arguments)]
    fn initialize(
        env: Env,
        organizer: Address,
        token: Address,
        deposit: i128,
        fee_allowance: i128,
        capacity: u32,
        code_hash: BytesN<32>,
        policy: ForfeitPolicy,
        reputation: Option<Address>,
    );
}

/// The slice of the reputation ledger its two callers need.
///
/// The factory calls `register_event` when it deploys an event; the event
/// itself calls the two `record_*` functions. Nothing here returns a score —
/// reading one is a frontend concern and does not belong in a contract's wasm
/// spec.
///
/// Everything here can fail without consequence, and the event contract calls
/// these through the generated `try_` variants precisely so it can ignore a
/// failure. A score is never worth trapping a guest's refund for.
#[contractclient(name = "ReputationClient")]
pub trait Reputation {
    fn register_event(env: Env, event: Address);
    fn record_checkin(env: Env, event: Address, member: Address);
    fn record_no_show(env: Env, event: Address, member: Address);
}
