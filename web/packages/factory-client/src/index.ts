import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  /**
   * `accept_admin` with nobody proposed, or after the proposal was withdrawn.
   */
  3: {message:"NoPendingAdmin"},
  /**
   * The event counter, which is also the deploy salt, has no room left.
   */
  4: {message:"CounterExhausted"}
}

export type DataKey = {tag: "Admin", values: void} | {tag: "PendingAdmin", values: void} | {tag: "EventWasmHash", values: void} | {tag: "Events", values: void} | {tag: "Count", values: void} | {tag: "Reputation", values: void};





/**
 * A member's attendance record, as the event contract reads it.
 * 
 * Mirrors the reputation contract's own `Score` field for field. It is copied
 * rather than shared because that contract deliberately does not link this
 * crate — doing so would publish a `ForfeitPolicy` type on a reputation
 * ledger's spec — and a `#[contracttype]` struct encodes as a map keyed by
 * field name, so two identical declarations decode each other exactly.
 */
export interface Score {
  no_shows: u32;
  shows: u32;
}


/**
 * What an event needs to know about a would-be voucher.
 * 
 * Mirrors the reputation ledger's `Record` field for field, and copied rather
 * than shared for the same reason as `Score` — see below. Only the fields a
 * gate reads are here: `events_organised` is a profile-page number and putting
 * it on this trait would publish it into the event contract's spec for nothing.
 */
export interface Record {
  /**
 * Events they created, took deposits for, and never settled.
 * 
 * **Must stay field-for-field with the reputation contract's own `Record`.**
 * The two are separate declarations on purpose (see below), and a
 * `#[contracttype]` struct is decoded by unpacking a host map into a slice
 * of exactly the declared length — so a field added on one side and not the
 * other does not degrade, it fails the read outright with "differing host
 * map and output slice lengths". That is what happened when this field was
 * added to the ledger and not to here: every `vouch` on the event contract
 * stopped working, because the gate reads a record before it opens.
 */
events_abandoned: u32;
  events_organised: u32;
  no_shows: u32;
  shows: u32;
  vouches_broken: u32;
  vouches_given: u32;
}

/**
 * Who is allowed to reserve a spot.
 * 
 * Fixed at creation and enforced inside the event contract rather than by a
 * screen, because a gate a frontend applies is a suggestion: anyone can call
 * `rsvp` directly against the contract.
 */
export type Admission = {tag: "Open", values: void} | {tag: "Score", values: readonly [u32]} | {tag: "Approval", values: void} | {tag: "Vouch", values: readonly [u32]};

/**
 * Where the deposits of no-shows go when an event is finalized.
 */
export type ForfeitPolicy = {tag: "ToOrganizer", values: void} | {tag: "SplitAmongAttendees", values: void};

export interface Client {
  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace the factory's own code, keeping its address and its event list.
   * Admin only.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register the factory against the uploaded event wasm.
   */
  initialize: ({admin, event_wasm_hash}: {admin: string, event_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a list_events transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_events: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Take the admin role. Callable only by the address `propose_admin` named.
   * 
   * The proposal is consumed whether or not it is ever used again, so an
   * accepted handover leaves nothing pending behind it.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deploy and initialize an event owned by `organizer`.
   * 
   * The organizer authorizes this whole call tree, which is what lets the
   * event's own `initialize` pull the fee pool out of their wallet as part of
   * the same transaction.
   */
  create_event: ({organizer, title, starts_at, token, deposit, fee_allowance, capacity, code_hash, policy, admission}: {organizer: string, title: string, starts_at: u64, token: string, deposit: i128, fee_allowance: i128, capacity: u32, code_hash: Buffer, policy: ForfeitPolicy, admission: Admission}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a propose_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Nominate the next admin. Admin only, and it changes nothing on its own.
   * 
   * Handing the key over is two transactions rather than one, and the second
   * is signed by the key being handed to. A plain setter would mean a
   * mistyped address leaves the factory permanently ungovernable — no
   * `set_event_wasm_hash`, no `set_reputation`, no `upgrade`, and no way
   * back. An address nobody controls can never call `accept_admin`, so the
   * mistake cannot complete.
   * 
   * That matters most for the move this was written for: taking the admin off
   * a laptop keypair and onto a hardware wallet. It also keeps both halves as
   * ordinary single-signer transactions, which is what a hardware wallet can
   * actually sign — requiring the new admin to authorise inside the *same*
   * call would need a signed authorization entry from an address that is not
   * the transaction's source.
   * 
   * Proposing again replaces the previous nomination, so a wrong address is
   * corrected by calling this a second time.
   */
  propose_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_reputation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `None` until an admin wires one up.
   */
  get_reputation: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a set_reputation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Wire the factory to a reputation ledger, or move it to another one.
   * Admin only.
   * 
   * This is the second half of the circular setup: reputation is deployed
   * knowing the factory's address, then the factory is pointed back here.
   */
  set_reputation: ({reputation}: {reputation: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_event_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_event_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Who has been nominated but has not accepted yet. `None` most of the time
   * — a handover in progress is the only state where this answers.
   */
  get_pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a get_event_wasm_hash transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Which event revision new events get. Lets a reviewer check that the
   * deployed factory really is pointing at the wasm the docs claim.
   */
  get_event_wasm_hash: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a set_event_wasm_hash transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Point new events at a new event wasm. Admin only.
   * 
   * Read at deploy time on every `create_event`, so this takes effect on the
   * next event and leaves every existing one exactly as it was — an event
   * people have already locked deposits in must never change underneath them.
   */
  set_event_wasm_hash: ({event_wasm_hash}: {event_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAElgYWNjZXB0X2FkbWluYCB3aXRoIG5vYm9keSBwcm9wb3NlZCwgb3IgYWZ0ZXIgdGhlIHByb3Bvc2FsIHdhcyB3aXRoZHJhd24uAAAAAAAADk5vUGVuZGluZ0FkbWluAAAAAAADAAAAQ1RoZSBldmVudCBjb3VudGVyLCB3aGljaCBpcyBhbHNvIHRoZSBkZXBsb3kgc2FsdCwgaGFzIG5vIHJvb20gbGVmdC4AAAAAEENvdW50ZXJFeGhhdXN0ZWQAAAAE",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAADBQcm9wb3NlZCwgbm90IHlldCBpbiBmb3JjZS4gU2VlIGBwcm9wb3NlX2FkbWluYC4AAAAMUGVuZGluZ0FkbWluAAAAAAAAAAAAAAANRXZlbnRXYXNtSGFzaAAAAAAAAAAAAAAAAAAABkV2ZW50cwAAAAAAAAAAAFJNb25vdG9uaWMgY291bnRlcjsgZG91YmxlcyBhcyB0aGUgZGVwbG95IHNhbHQgc28gZXZlcnkgZXZlbnQgZ2V0cyBpdHMgb3duCmFkZHJlc3MuAAAAAAAFQ291bnQAAAAAAAAAAAAAhVRoZSByZXB1dGF0aW9uIGxlZGdlciwgaWYgb25lIGlzIHdpcmVkIHVwLiBBYnNlbnQgaXMgYSB2YWxpZCBzdGF0ZTogdGhlCmZhY3RvcnkgcHJlZGF0ZXMgcmVwdXRhdGlvbiBhbmQgc3RpbGwgaGFzIHRvIHdvcmsgd2l0aG91dCBpdC4AAAAAAAAKUmVwdXRhdGlvbgAA",
        "AAAAAAAAAFNSZXBsYWNlIHRoZSBmYWN0b3J5J3Mgb3duIGNvZGUsIGtlZXBpbmcgaXRzIGFkZHJlc3MgYW5kIGl0cyBldmVudCBsaXN0LgpBZG1pbiBvbmx5LgAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAABQAAAAAAAAAAAAAADEFkbWluQ2hhbmdlZAAAAAEAAAANYWRtaW5fY2hhbmdlZAAAAAAAAAIAAAAAAAAACHByZXZpb3VzAAAAEwAAAAAAAAAAAAAAB2N1cnJlbnQAAAAAEwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADEV2ZW50Q3JlYXRlZAAAAAEAAAANZXZlbnRfY3JlYXRlZAAAAAAAAAYAAAAAAAAABWV2ZW50AAAAAAAAEwAAAAAAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAAb0NhcnJpZWQgb24gdGhlIGV2ZW50IHNvIGEgZmVlZCBvciBhbiBpbmRleGVyIGNhbiBzaG93IG5hbWVzIHdpdGhvdXQKcmVhZGluZyBldmVyeSBldmVudCBjb250cmFjdCBvbmUgYXQgYSB0aW1lLgAAAAAFdGl0bGUAAAAAAAAQAAAAAAAAAAAAAAAJc3RhcnRzX2F0AAAAAAAABgAAAAAAAAAAAAAAB2RlcG9zaXQAAAAACwAAAAAAAAAAAAAACGNhcGFjaXR5AAAABAAAAAAAAAAC",
        "AAAABQAAAIRQdWJsaXNoZWQgb24gYm90aCBoYWx2ZXMgb2YgYSBoYW5kb3Zlciwgc28gdGhlIG1vdmUgb2YgdGhlIGtleSB0aGF0IGdvdmVybnMKdGhpcyBzeXN0ZW0gaXMgd2F0Y2hhYmxlIHdpdGhvdXQgcmVhZGluZyBjb250cmFjdCBzdGF0ZS4AAAAAAAAADUFkbWluUHJvcG9zZWQAAAAAAAABAAAADmFkbWluX3Byb3Bvc2VkAAAAAAABAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAADVSZWdpc3RlciB0aGUgZmFjdG9yeSBhZ2FpbnN0IHRoZSB1cGxvYWRlZCBldmVudCB3YXNtLgAAAAAAAAppbml0aWFsaXplAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAD2V2ZW50X3dhc21faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALbGlzdF9ldmVudHMAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAMJUYWtlIHRoZSBhZG1pbiByb2xlLiBDYWxsYWJsZSBvbmx5IGJ5IHRoZSBhZGRyZXNzIGBwcm9wb3NlX2FkbWluYCBuYW1lZC4KClRoZSBwcm9wb3NhbCBpcyBjb25zdW1lZCB3aGV0aGVyIG9yIG5vdCBpdCBpcyBldmVyIHVzZWQgYWdhaW4sIHNvIGFuCmFjY2VwdGVkIGhhbmRvdmVyIGxlYXZlcyBub3RoaW5nIHBlbmRpbmcgYmVoaW5kIGl0LgAAAAAADGFjY2VwdF9hZG1pbgAAAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAANtEZXBsb3kgYW5kIGluaXRpYWxpemUgYW4gZXZlbnQgb3duZWQgYnkgYG9yZ2FuaXplcmAuCgpUaGUgb3JnYW5pemVyIGF1dGhvcml6ZXMgdGhpcyB3aG9sZSBjYWxsIHRyZWUsIHdoaWNoIGlzIHdoYXQgbGV0cyB0aGUKZXZlbnQncyBvd24gYGluaXRpYWxpemVgIHB1bGwgdGhlIGZlZSBwb29sIG91dCBvZiB0aGVpciB3YWxsZXQgYXMgcGFydCBvZgp0aGUgc2FtZSB0cmFuc2FjdGlvbi4AAAAADGNyZWF0ZV9ldmVudAAAAAoAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAJc3RhcnRzX2F0AAAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAdkZXBvc2l0AAAAAAsAAAAAAAAADWZlZV9hbGxvd2FuY2UAAAAAAAALAAAAAAAAAAhjYXBhY2l0eQAAAAQAAAAAAAAACWNvZGVfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAZwb2xpY3kAAAAAB9AAAAANRm9yZmVpdFBvbGljeQAAAAAAAAAAAAAJYWRtaXNzaW9uAAAAAAAH0AAAAAlBZG1pc3Npb24AAAAAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAA7hOb21pbmF0ZSB0aGUgbmV4dCBhZG1pbi4gQWRtaW4gb25seSwgYW5kIGl0IGNoYW5nZXMgbm90aGluZyBvbiBpdHMgb3duLgoKSGFuZGluZyB0aGUga2V5IG92ZXIgaXMgdHdvIHRyYW5zYWN0aW9ucyByYXRoZXIgdGhhbiBvbmUsIGFuZCB0aGUgc2Vjb25kCmlzIHNpZ25lZCBieSB0aGUga2V5IGJlaW5nIGhhbmRlZCB0by4gQSBwbGFpbiBzZXR0ZXIgd291bGQgbWVhbiBhCm1pc3R5cGVkIGFkZHJlc3MgbGVhdmVzIHRoZSBmYWN0b3J5IHBlcm1hbmVudGx5IHVuZ292ZXJuYWJsZSDigJQgbm8KYHNldF9ldmVudF93YXNtX2hhc2hgLCBubyBgc2V0X3JlcHV0YXRpb25gLCBubyBgdXBncmFkZWAsIGFuZCBubyB3YXkKYmFjay4gQW4gYWRkcmVzcyBub2JvZHkgY29udHJvbHMgY2FuIG5ldmVyIGNhbGwgYGFjY2VwdF9hZG1pbmAsIHNvIHRoZQptaXN0YWtlIGNhbm5vdCBjb21wbGV0ZS4KClRoYXQgbWF0dGVycyBtb3N0IGZvciB0aGUgbW92ZSB0aGlzIHdhcyB3cml0dGVuIGZvcjogdGFraW5nIHRoZSBhZG1pbiBvZmYKYSBsYXB0b3Aga2V5cGFpciBhbmQgb250byBhIGhhcmR3YXJlIHdhbGxldC4gSXQgYWxzbyBrZWVwcyBib3RoIGhhbHZlcyBhcwpvcmRpbmFyeSBzaW5nbGUtc2lnbmVyIHRyYW5zYWN0aW9ucywgd2hpY2ggaXMgd2hhdCBhIGhhcmR3YXJlIHdhbGxldCBjYW4KYWN0dWFsbHkgc2lnbiDigJQgcmVxdWlyaW5nIHRoZSBuZXcgYWRtaW4gdG8gYXV0aG9yaXNlIGluc2lkZSB0aGUgKnNhbWUqCmNhbGwgd291bGQgbmVlZCBhIHNpZ25lZCBhdXRob3JpemF0aW9uIGVudHJ5IGZyb20gYW4gYWRkcmVzcyB0aGF0IGlzIG5vdAp0aGUgdHJhbnNhY3Rpb24ncyBzb3VyY2UuCgpQcm9wb3NpbmcgYWdhaW4gcmVwbGFjZXMgdGhlIHByZXZpb3VzIG5vbWluYXRpb24sIHNvIGEgd3JvbmcgYWRkcmVzcyBpcwpjb3JyZWN0ZWQgYnkgY2FsbGluZyB0aGlzIGEgc2Vjb25kIHRpbWUuAAAADXByb3Bvc2VfYWRtaW4AAAAAAAABAAAAAAAAAAluZXdfYWRtaW4AAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAACNgTm9uZWAgdW50aWwgYW4gYWRtaW4gd2lyZXMgb25lIHVwLgAAAAAOZ2V0X3JlcHV0YXRpb24AAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAANxXaXJlIHRoZSBmYWN0b3J5IHRvIGEgcmVwdXRhdGlvbiBsZWRnZXIsIG9yIG1vdmUgaXQgdG8gYW5vdGhlciBvbmUuCkFkbWluIG9ubHkuCgpUaGlzIGlzIHRoZSBzZWNvbmQgaGFsZiBvZiB0aGUgY2lyY3VsYXIgc2V0dXA6IHJlcHV0YXRpb24gaXMgZGVwbG95ZWQKa25vd2luZyB0aGUgZmFjdG9yeSdzIGFkZHJlc3MsIHRoZW4gdGhlIGZhY3RvcnkgaXMgcG9pbnRlZCBiYWNrIGhlcmUuAAAADnNldF9yZXB1dGF0aW9uAAAAAAABAAAAAAAAAApyZXB1dGF0aW9uAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAPZ2V0X2V2ZW50X2NvdW50AAAAAAAAAAABAAAABA==",
        "AAAAAAAAAIlXaG8gaGFzIGJlZW4gbm9taW5hdGVkIGJ1dCBoYXMgbm90IGFjY2VwdGVkIHlldC4gYE5vbmVgIG1vc3Qgb2YgdGhlIHRpbWUK4oCUIGEgaGFuZG92ZXIgaW4gcHJvZ3Jlc3MgaXMgdGhlIG9ubHkgc3RhdGUgd2hlcmUgdGhpcyBhbnN3ZXJzLgAAAAAAABFnZXRfcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAAINXaGljaCBldmVudCByZXZpc2lvbiBuZXcgZXZlbnRzIGdldC4gTGV0cyBhIHJldmlld2VyIGNoZWNrIHRoYXQgdGhlCmRlcGxveWVkIGZhY3RvcnkgcmVhbGx5IGlzIHBvaW50aW5nIGF0IHRoZSB3YXNtIHRoZSBkb2NzIGNsYWltLgAAAAATZ2V0X2V2ZW50X3dhc21faGFzaAAAAAAAAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAAQ1Qb2ludCBuZXcgZXZlbnRzIGF0IGEgbmV3IGV2ZW50IHdhc20uIEFkbWluIG9ubHkuCgpSZWFkIGF0IGRlcGxveSB0aW1lIG9uIGV2ZXJ5IGBjcmVhdGVfZXZlbnRgLCBzbyB0aGlzIHRha2VzIGVmZmVjdCBvbiB0aGUKbmV4dCBldmVudCBhbmQgbGVhdmVzIGV2ZXJ5IGV4aXN0aW5nIG9uZSBleGFjdGx5IGFzIGl0IHdhcyDigJQgYW4gZXZlbnQKcGVvcGxlIGhhdmUgYWxyZWFkeSBsb2NrZWQgZGVwb3NpdHMgaW4gbXVzdCBuZXZlciBjaGFuZ2UgdW5kZXJuZWF0aCB0aGVtLgAAAAAAABNzZXRfZXZlbnRfd2FzbV9oYXNoAAAAAAEAAAAAAAAAD2V2ZW50X3dhc21faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAQAAAatBIG1lbWJlcidzIGF0dGVuZGFuY2UgcmVjb3JkLCBhcyB0aGUgZXZlbnQgY29udHJhY3QgcmVhZHMgaXQuCgpNaXJyb3JzIHRoZSByZXB1dGF0aW9uIGNvbnRyYWN0J3Mgb3duIGBTY29yZWAgZmllbGQgZm9yIGZpZWxkLiBJdCBpcyBjb3BpZWQKcmF0aGVyIHRoYW4gc2hhcmVkIGJlY2F1c2UgdGhhdCBjb250cmFjdCBkZWxpYmVyYXRlbHkgZG9lcyBub3QgbGluayB0aGlzCmNyYXRlIOKAlCBkb2luZyBzbyB3b3VsZCBwdWJsaXNoIGEgYEZvcmZlaXRQb2xpY3lgIHR5cGUgb24gYSByZXB1dGF0aW9uCmxlZGdlcidzIHNwZWMg4oCUIGFuZCBhIGAjW2NvbnRyYWN0dHlwZV1gIHN0cnVjdCBlbmNvZGVzIGFzIGEgbWFwIGtleWVkIGJ5CmZpZWxkIG5hbWUsIHNvIHR3byBpZGVudGljYWwgZGVjbGFyYXRpb25zIGRlY29kZSBlYWNoIG90aGVyIGV4YWN0bHkuAAAAAAAAAAAFU2NvcmUAAAAAAAACAAAAAAAAAAhub19zaG93cwAAAAQAAAAAAAAABXNob3dzAAAAAAAABA==",
        "AAAAAQAAAWlXaGF0IGFuIGV2ZW50IG5lZWRzIHRvIGtub3cgYWJvdXQgYSB3b3VsZC1iZSB2b3VjaGVyLgoKTWlycm9ycyB0aGUgcmVwdXRhdGlvbiBsZWRnZXIncyBgUmVjb3JkYCBmaWVsZCBmb3IgZmllbGQsIGFuZCBjb3BpZWQgcmF0aGVyCnRoYW4gc2hhcmVkIGZvciB0aGUgc2FtZSByZWFzb24gYXMgYFNjb3JlYCDigJQgc2VlIGJlbG93LiBPbmx5IHRoZSBmaWVsZHMgYQpnYXRlIHJlYWRzIGFyZSBoZXJlOiBgZXZlbnRzX29yZ2FuaXNlZGAgaXMgYSBwcm9maWxlLXBhZ2UgbnVtYmVyIGFuZCBwdXR0aW5nCml0IG9uIHRoaXMgdHJhaXQgd291bGQgcHVibGlzaCBpdCBpbnRvIHRoZSBldmVudCBjb250cmFjdCdzIHNwZWMgZm9yIG5vdGhpbmcuAAAAAAAAAAAAAAZSZWNvcmQAAAAAAAYAAAJ3RXZlbnRzIHRoZXkgY3JlYXRlZCwgdG9vayBkZXBvc2l0cyBmb3IsIGFuZCBuZXZlciBzZXR0bGVkLgoKKipNdXN0IHN0YXkgZmllbGQtZm9yLWZpZWxkIHdpdGggdGhlIHJlcHV0YXRpb24gY29udHJhY3QncyBvd24gYFJlY29yZGAuKioKVGhlIHR3byBhcmUgc2VwYXJhdGUgZGVjbGFyYXRpb25zIG9uIHB1cnBvc2UgKHNlZSBiZWxvdyksIGFuZCBhCmAjW2NvbnRyYWN0dHlwZV1gIHN0cnVjdCBpcyBkZWNvZGVkIGJ5IHVucGFja2luZyBhIGhvc3QgbWFwIGludG8gYSBzbGljZQpvZiBleGFjdGx5IHRoZSBkZWNsYXJlZCBsZW5ndGgg4oCUIHNvIGEgZmllbGQgYWRkZWQgb24gb25lIHNpZGUgYW5kIG5vdCB0aGUKb3RoZXIgZG9lcyBub3QgZGVncmFkZSwgaXQgZmFpbHMgdGhlIHJlYWQgb3V0cmlnaHQgd2l0aCAiZGlmZmVyaW5nIGhvc3QKbWFwIGFuZCBvdXRwdXQgc2xpY2UgbGVuZ3RocyIuIFRoYXQgaXMgd2hhdCBoYXBwZW5lZCB3aGVuIHRoaXMgZmllbGQgd2FzCmFkZGVkIHRvIHRoZSBsZWRnZXIgYW5kIG5vdCB0byBoZXJlOiBldmVyeSBgdm91Y2hgIG9uIHRoZSBldmVudCBjb250cmFjdApzdG9wcGVkIHdvcmtpbmcsIGJlY2F1c2UgdGhlIGdhdGUgcmVhZHMgYSByZWNvcmQgYmVmb3JlIGl0IG9wZW5zLgAAAAAQZXZlbnRzX2FiYW5kb25lZAAAAAQAAAAAAAAAEGV2ZW50c19vcmdhbmlzZWQAAAAEAAAAAAAAAAhub19zaG93cwAAAAQAAAAAAAAABXNob3dzAAAAAAAABAAAAAAAAAAOdm91Y2hlc19icm9rZW4AAAAAAAQAAAAAAAAADXZvdWNoZXNfZ2l2ZW4AAAAAAAAE",
        "AAAAAgAAAN1XaG8gaXMgYWxsb3dlZCB0byByZXNlcnZlIGEgc3BvdC4KCkZpeGVkIGF0IGNyZWF0aW9uIGFuZCBlbmZvcmNlZCBpbnNpZGUgdGhlIGV2ZW50IGNvbnRyYWN0IHJhdGhlciB0aGFuIGJ5IGEKc2NyZWVuLCBiZWNhdXNlIGEgZ2F0ZSBhIGZyb250ZW5kIGFwcGxpZXMgaXMgYSBzdWdnZXN0aW9uOiBhbnlvbmUgY2FuIGNhbGwKYHJzdnBgIGRpcmVjdGx5IGFnYWluc3QgdGhlIGNvbnRyYWN0LgAAAAAAAAAAAAAJQWRtaXNzaW9uAAAAAAAABAAAAAAAAABEQW55b25lLCBmaXJzdCBjb21lIGZpcnN0IHNlcnZlZC4gV2hhdCBldmVyeSBldmVudCBjcmVhdGVkIHNvIGZhciBpcy4AAAAET3BlbgAAAAEAAABCQW55b25lIHdob3NlIHJlcHV0YXRpb24gcmVjb3JkIHNob3dzIGF0IGxlYXN0IHRoaXMgbWFueSBjaGVjay1pbnMuAAAAAAAFU2NvcmUAAAAAAAABAAAABAAAAAAAAAAwQW55b25lIHRoZSBvcmdhbml6ZXIgc2F5cyB5ZXMgdG8sIG9uZSBhdCBhIHRpbWUuAAAACEFwcHJvdmFsAAAAAQAAAENBbnlvbmUgdm91Y2hlZCBmb3IgYnkgdGhpcyBtYW55IG1lbWJlcnMgd2l0aCBhIHJlY29yZCBvZiB0aGVpciBvd24uAAAAAAVWb3VjaAAAAAAAAAEAAAAE",
        "AAAAAgAAAD1XaGVyZSB0aGUgZGVwb3NpdHMgb2Ygbm8tc2hvd3MgZ28gd2hlbiBhbiBldmVudCBpcyBmaW5hbGl6ZWQuAAAAAAAAAAAAAA1Gb3JmZWl0UG9saWN5AAAAAAAAAgAAAAAAAAAaU3RyYWlnaHQgdG8gdGhlIG9yZ2FuaXplci4AAAAAAAtUb09yZ2FuaXplcgAAAAAAAAAAK1NwbGl0IGV2ZW5seSBhbW9uZyBldmVyeW9uZSB3aG8gY2hlY2tlZCBpbi4AAAAAE1NwbGl0QW1vbmdBdHRlbmRlZXMA" ]),
      options
    )
  }
  public readonly fromJSON = {
    upgrade: this.txFromJSON<Result<void>>,
        get_admin: this.txFromJSON<Result<string>>,
        initialize: this.txFromJSON<Result<void>>,
        list_events: this.txFromJSON<Array<string>>,
        accept_admin: this.txFromJSON<Result<void>>,
        create_event: this.txFromJSON<Result<string>>,
        propose_admin: this.txFromJSON<Result<void>>,
        get_reputation: this.txFromJSON<Option<string>>,
        set_reputation: this.txFromJSON<Result<void>>,
        get_event_count: this.txFromJSON<u32>,
        get_pending_admin: this.txFromJSON<Option<string>>,
        get_event_wasm_hash: this.txFromJSON<Result<Buffer>>,
        set_event_wasm_hash: this.txFromJSON<Result<void>>
  }
}