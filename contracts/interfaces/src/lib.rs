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
    );
}
