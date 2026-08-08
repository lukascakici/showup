#![no_std]

//! Shared types and contract clients.
//!
//! The contracts talk to each other through the `#[contractclient]` traits here
//! rather than depending on each other's crates, which would drag the callee's
//! whole spec into the caller's wasm.

use soroban_sdk::{contractclient, contracttype, Address, BytesN, Env, String};

/// The longest an event title may be, in **bytes** of UTF-8.
///
/// Bytes, not characters, because that is what storage costs and what the
/// contract can cheaply check. "Kadıköy'de perşembe maçı" is 24 characters and
/// 27 bytes; a title counter that counts characters would let a Turkish title
/// through and then fail on-chain.
pub const MAX_TITLE_BYTES: u32 = 100;

/// Testnet and Mainnet both close a ledger roughly every 5 seconds.
pub const LEDGERS_PER_DAY: u32 = 17_280;

/// How far ahead every stored entry is pushed when it is touched.
///
/// Soroban state is rented, not permanent: an entry that is not extended is
/// archived and stops being readable. Testnet hands out roughly **7 days** by
/// default, which is shorter than a single sprint — an event created today and
/// held two weeks out would archive before anyone could check in, and the
/// contract would answer nothing until somebody paid to restore it.
///
/// Measured on the live reputation ledger before this was applied everywhere:
/// entries covered by `extend_ttl` had 89.9 days left, entries without it had
/// 6.9. The gap was exactly the missing call.
pub const TTL_EXTEND_TO: u32 = LEDGERS_PER_DAY * 90;

/// Only pay to extend once an entry is inside 30 days of expiry, so a busy
/// event is not rewriting the same TTL on every single call.
pub const TTL_THRESHOLD: u32 = LEDGERS_PER_DAY * 30;

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
        title: String,
        starts_at: u64,
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
