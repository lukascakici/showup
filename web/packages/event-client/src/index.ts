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




export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidDeposit"},
  4: {message:"InvalidCapacity"},
  5: {message:"InvalidFeeAllowance"},
  6: {message:"AlreadyReserved"},
  7: {message:"EventFull"},
  8: {message:"NotReserved"},
  9: {message:"AlreadyCheckedIn"},
  10: {message:"WrongCode"},
  11: {message:"AlreadyFinalized"},
  /**
   * `rsvp` after the organizer opened check-in.
   */
  12: {message:"ReservationsClosed"},
  /**
   * `check_in` before the organizer opened it.
   */
  13: {message:"CheckInNotOpen"},
  /**
   * `open_checkin` / `reopen_rsvp` from a phase that doesn't allow it.
   */
  14: {message:"WrongPhase"},
  /**
   * Empty, or longer than `MAX_TITLE_BYTES`.
   */
  15: {message:"InvalidTitle"},
  /**
   * Zero. An event with no start time cannot be sorted or described.
   */
  16: {message:"InvalidStartTime"},
  /**
   * `rsvp` on a `Score`-gated event from a record below the threshold.
   */
  17: {message:"ScoreTooLow"},
  /**
   * `rsvp` on an `Approval` event from someone the organizer never approved.
   */
  18: {message:"NotApplied"},
  /**
   * A second `apply` from the same guest.
   */
  19: {message:"AlreadyApplied"},
  /**
   * A host-only call from an address that is not a host.
   */
  20: {message:"NotAHost"},
  /**
   * A call that only makes sense under a different admission mode — applying
   * to an open event, or vouching for a guest at one.
   */
  21: {message:"WrongAdmissionMode"},
  /**
   * A gate that needs a reputation ledger on an event created without one.
   */
  22: {message:"NoReputation"}
}

export type Phase = {tag: "Reserving", values: void} | {tag: "CheckingIn", values: void} | {tag: "Finalized", values: void};


export interface Config {
  /**
 * Who may reserve a spot. Fixed at creation, like the deposit and the
 * capacity: the terms somebody agreed to when they locked their money must
 * not be editable by the person holding it.
 */
admission: Admission;
  capacity: u32;
  /**
 * sha256 of the check-in secret. The secret itself never touches the chain
 * until a guest reveals it by checking in.
 */
code_hash: Buffer;
  /**
 * Locked by each guest to reserve a spot.
 */
deposit: i128;
  /**
 * Paid back to each guest on check-in, on top of the deposit, to cover the
 * fees they spent on `rsvp` + `check_in`. Funded by the organizer upfront.
 */
fee_allowance: i128;
  organizer: string;
  policy: ForfeitPolicy;
  /**
 * Where show-up scores are recorded, if the factory had a ledger wired up
 * when this event was created. Fixed for the event's whole life: an event
 * people have locked deposits in must not have its scoring moved
 * underneath them, and `None` has to keep working because events created
 * before reputation existed still run.
 */
reputation: Option<string>;
  /**
 * Unix seconds, UTC. **Informational.**
 * 
 * The phase machine is the single authority on what is allowed when, and a
 * second time-based authority would contradict it — `reopen_rsvp` exists
 * precisely so a latecomer can still reserve after the event has begun.
 * This earns its place by making events sortable and by letting the UI say
 * "starts in 3 hours".
 */
starts_at: u64;
  /**
 * What the event is called. Up to `MAX_TITLE_BYTES` of UTF-8.
 * 
 * On-chain rather than in the off-chain index, and that is the whole reason
 * the index needs no login: `/api/events/sync` can only store what it can
 * re-read from a contract, so a title it could not verify would be a title
 * anybody could set.
 */
title: string;
  token: string;
}

export type DataKey = {tag: "Config", values: void} | {tag: "Phase", values: void} | {tag: "Reserved", values: void} | {tag: "CheckedIn", values: void} | {tag: "Attendance", values: readonly [string]};


export type ScoreKind = {tag: "CheckIn", values: void} | {tag: "NoShow", values: void};



export type Attendance = {tag: "Reserved", values: void} | {tag: "CheckedIn", values: void};




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
   * Construct and simulate a rsvp transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lock the deposit and reserve a spot. Only while the event is `Reserving`.
   */
  rsvp: ({guest}: {guest: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a check_in transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Prove attendance with the organizer's secret and take the deposit back.
   * 
   * This is the only place a guest gets paid on the happy path — the deposit
   * and the fee reimbursement land in the same call, so there is nothing to
   * come back and claim later.
   */
  check_in: ({guest, secret}: {guest: string, secret: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a finalize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Close the event and settle the no-shows' deposits.
   */
  finalize: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_phase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_phase: (options?: MethodOptions) => Promise<AssembledTransaction<Phase>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Config>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create the event and fund the fee-reimbursement pool.
   * 
   * The organizer transfers `fee_allowance * capacity` in, so every guest who
   * shows up can be made whole for the fees they spend. Whatever is left over
   * (the no-shows never cost anything) goes back to the organizer on
   * `finalize`.
   */
  initialize: ({organizer, title, starts_at, token, deposit, fee_allowance, capacity, code_hash, policy, reputation, admission}: {organizer: string, title: string, starts_at: u64, token: string, deposit: i128, fee_allowance: i128, capacity: u32, code_hash: Buffer, policy: ForfeitPolicy, reputation: Option<string>, admission: Admission}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a reopen_rsvp transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Go back to taking reservations, e.g. to let a latecomer in. Organizer only.
   * 
   * Guests who already checked in keep their refund and stay on the list; this
   * only reopens the door.
   */
  reopen_rsvp: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_reserved transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reserved: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a is_finalized transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_finalized: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a open_checkin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Start check-in, closing reservations. Organizer only.
   */
  open_checkin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_attendance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_attendance: ({guest}: {guest: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Attendance>>>

  /**
   * Construct and simulate a get_checked_in transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_checked_in: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAFgAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAOSW52YWxpZERlcG9zaXQAAAAAAAMAAAAAAAAAD0ludmFsaWRDYXBhY2l0eQAAAAAEAAAAAAAAABNJbnZhbGlkRmVlQWxsb3dhbmNlAAAAAAUAAAAAAAAAD0FscmVhZHlSZXNlcnZlZAAAAAAGAAAAAAAAAAlFdmVudEZ1bGwAAAAAAAAHAAAAAAAAAAtOb3RSZXNlcnZlZAAAAAAIAAAAAAAAABBBbHJlYWR5Q2hlY2tlZEluAAAACQAAAAAAAAAJV3JvbmdDb2RlAAAAAAAACgAAAAAAAAAQQWxyZWFkeUZpbmFsaXplZAAAAAsAAAArYHJzdnBgIGFmdGVyIHRoZSBvcmdhbml6ZXIgb3BlbmVkIGNoZWNrLWluLgAAAAASUmVzZXJ2YXRpb25zQ2xvc2VkAAAAAAAMAAAAKmBjaGVja19pbmAgYmVmb3JlIHRoZSBvcmdhbml6ZXIgb3BlbmVkIGl0LgAAAAAADkNoZWNrSW5Ob3RPcGVuAAAAAAANAAAAQmBvcGVuX2NoZWNraW5gIC8gYHJlb3Blbl9yc3ZwYCBmcm9tIGEgcGhhc2UgdGhhdCBkb2Vzbid0IGFsbG93IGl0LgAAAAAACldyb25nUGhhc2UAAAAAAA4AAAAoRW1wdHksIG9yIGxvbmdlciB0aGFuIGBNQVhfVElUTEVfQllURVNgLgAAAAxJbnZhbGlkVGl0bGUAAAAPAAAAQFplcm8uIEFuIGV2ZW50IHdpdGggbm8gc3RhcnQgdGltZSBjYW5ub3QgYmUgc29ydGVkIG9yIGRlc2NyaWJlZC4AAAAQSW52YWxpZFN0YXJ0VGltZQAAABAAAABCYHJzdnBgIG9uIGEgYFNjb3JlYC1nYXRlZCBldmVudCBmcm9tIGEgcmVjb3JkIGJlbG93IHRoZSB0aHJlc2hvbGQuAAAAAAALU2NvcmVUb29Mb3cAAAAAEQAAAEhgcnN2cGAgb24gYW4gYEFwcHJvdmFsYCBldmVudCBmcm9tIHNvbWVvbmUgdGhlIG9yZ2FuaXplciBuZXZlciBhcHByb3ZlZC4AAAAKTm90QXBwbGllZAAAAAAAEgAAACVBIHNlY29uZCBgYXBwbHlgIGZyb20gdGhlIHNhbWUgZ3Vlc3QuAAAAAAAADkFscmVhZHlBcHBsaWVkAAAAAAATAAAANEEgaG9zdC1vbmx5IGNhbGwgZnJvbSBhbiBhZGRyZXNzIHRoYXQgaXMgbm90IGEgaG9zdC4AAAAITm90QUhvc3QAAAAUAAAAfEEgY2FsbCB0aGF0IG9ubHkgbWFrZXMgc2Vuc2UgdW5kZXIgYSBkaWZmZXJlbnQgYWRtaXNzaW9uIG1vZGUg4oCUIGFwcGx5aW5nCnRvIGFuIG9wZW4gZXZlbnQsIG9yIHZvdWNoaW5nIGZvciBhIGd1ZXN0IGF0IG9uZS4AAAASV3JvbmdBZG1pc3Npb25Nb2RlAAAAAAAVAAAARkEgZ2F0ZSB0aGF0IG5lZWRzIGEgcmVwdXRhdGlvbiBsZWRnZXIgb24gYW4gZXZlbnQgY3JlYXRlZCB3aXRob3V0IG9uZS4AAAAAAAxOb1JlcHV0YXRpb24AAAAW",
        "AAAAAgAAAAAAAAAAAAAABVBoYXNlAAAAAAAAAwAAAAAAAAAsR3Vlc3RzIGNhbiByZXNlcnZlOyBub2JvZHkgY2FuIGNoZWNrIGluIHlldC4AAAAJUmVzZXJ2aW5nAAAAAAAAAAAAAD9UaGUgb3JnYW5pemVyIGhhcyBzdGFydGVkIGNoZWNrLWluLCBzbyByZXNlcnZhdGlvbnMgYXJlIGNsb3NlZC4AAAAACkNoZWNraW5nSW4AAAAAAAAAAAA4U2V0dGxlZC4gVGVybWluYWwg4oCUIHRoZXJlIGlzIGRlbGliZXJhdGVseSBubyB3YXkgYmFjay4AAAAJRmluYWxpemVkAAAA",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAACwAAALZXaG8gbWF5IHJlc2VydmUgYSBzcG90LiBGaXhlZCBhdCBjcmVhdGlvbiwgbGlrZSB0aGUgZGVwb3NpdCBhbmQgdGhlCmNhcGFjaXR5OiB0aGUgdGVybXMgc29tZWJvZHkgYWdyZWVkIHRvIHdoZW4gdGhleSBsb2NrZWQgdGhlaXIgbW9uZXkgbXVzdApub3QgYmUgZWRpdGFibGUgYnkgdGhlIHBlcnNvbiBob2xkaW5nIGl0LgAAAAAACWFkbWlzc2lvbgAAAAAAB9AAAAAJQWRtaXNzaW9uAAAAAAAAAAAAAAhjYXBhY2l0eQAAAAQAAABxc2hhMjU2IG9mIHRoZSBjaGVjay1pbiBzZWNyZXQuIFRoZSBzZWNyZXQgaXRzZWxmIG5ldmVyIHRvdWNoZXMgdGhlIGNoYWluCnVudGlsIGEgZ3Vlc3QgcmV2ZWFscyBpdCBieSBjaGVja2luZyBpbi4AAAAAAAAJY29kZV9oYXNoAAAAAAAD7gAAACAAAAAnTG9ja2VkIGJ5IGVhY2ggZ3Vlc3QgdG8gcmVzZXJ2ZSBhIHNwb3QuAAAAAAdkZXBvc2l0AAAAAAsAAACRUGFpZCBiYWNrIHRvIGVhY2ggZ3Vlc3Qgb24gY2hlY2staW4sIG9uIHRvcCBvZiB0aGUgZGVwb3NpdCwgdG8gY292ZXIgdGhlCmZlZXMgdGhleSBzcGVudCBvbiBgcnN2cGAgKyBgY2hlY2tfaW5gLiBGdW5kZWQgYnkgdGhlIG9yZ2FuaXplciB1cGZyb250LgAAAAAAAA1mZWVfYWxsb3dhbmNlAAAAAAAACwAAAAAAAAAJb3JnYW5pemVyAAAAAAAAEwAAAAAAAAAGcG9saWN5AAAAAAfQAAAADUZvcmZlaXRQb2xpY3kAAAAAAAE6V2hlcmUgc2hvdy11cCBzY29yZXMgYXJlIHJlY29yZGVkLCBpZiB0aGUgZmFjdG9yeSBoYWQgYSBsZWRnZXIgd2lyZWQgdXAKd2hlbiB0aGlzIGV2ZW50IHdhcyBjcmVhdGVkLiBGaXhlZCBmb3IgdGhlIGV2ZW50J3Mgd2hvbGUgbGlmZTogYW4gZXZlbnQKcGVvcGxlIGhhdmUgbG9ja2VkIGRlcG9zaXRzIGluIG11c3Qgbm90IGhhdmUgaXRzIHNjb3JpbmcgbW92ZWQKdW5kZXJuZWF0aCB0aGVtLCBhbmQgYE5vbmVgIGhhcyB0byBrZWVwIHdvcmtpbmcgYmVjYXVzZSBldmVudHMgY3JlYXRlZApiZWZvcmUgcmVwdXRhdGlvbiBleGlzdGVkIHN0aWxsIHJ1bi4AAAAAAApyZXB1dGF0aW9uAAAAAAPoAAAAEwAAAVxVbml4IHNlY29uZHMsIFVUQy4gKipJbmZvcm1hdGlvbmFsLioqCgpUaGUgcGhhc2UgbWFjaGluZSBpcyB0aGUgc2luZ2xlIGF1dGhvcml0eSBvbiB3aGF0IGlzIGFsbG93ZWQgd2hlbiwgYW5kIGEKc2Vjb25kIHRpbWUtYmFzZWQgYXV0aG9yaXR5IHdvdWxkIGNvbnRyYWRpY3QgaXQg4oCUIGByZW9wZW5fcnN2cGAgZXhpc3RzCnByZWNpc2VseSBzbyBhIGxhdGVjb21lciBjYW4gc3RpbGwgcmVzZXJ2ZSBhZnRlciB0aGUgZXZlbnQgaGFzIGJlZ3VuLgpUaGlzIGVhcm5zIGl0cyBwbGFjZSBieSBtYWtpbmcgZXZlbnRzIHNvcnRhYmxlIGFuZCBieSBsZXR0aW5nIHRoZSBVSSBzYXkKInN0YXJ0cyBpbiAzIGhvdXJzIi4AAAAJc3RhcnRzX2F0AAAAAAAABgAAASpXaGF0IHRoZSBldmVudCBpcyBjYWxsZWQuIFVwIHRvIGBNQVhfVElUTEVfQllURVNgIG9mIFVURi04LgoKT24tY2hhaW4gcmF0aGVyIHRoYW4gaW4gdGhlIG9mZi1jaGFpbiBpbmRleCwgYW5kIHRoYXQgaXMgdGhlIHdob2xlIHJlYXNvbgp0aGUgaW5kZXggbmVlZHMgbm8gbG9naW46IGAvYXBpL2V2ZW50cy9zeW5jYCBjYW4gb25seSBzdG9yZSB3aGF0IGl0IGNhbgpyZS1yZWFkIGZyb20gYSBjb250cmFjdCwgc28gYSB0aXRsZSBpdCBjb3VsZCBub3QgdmVyaWZ5IHdvdWxkIGJlIGEgdGl0bGUKYW55Ym9keSBjb3VsZCBzZXQuAAAAAAAFdGl0bGUAAAAAAAAQAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAAAAAAAAAAAFUGhhc2UAAAAAAAAAAAAAAAAAAAhSZXNlcnZlZAAAAAAAAAAAAAAACUNoZWNrZWRJbgAAAAAAAAEAAAAAAAAACkF0dGVuZGFuY2UAAAAAAAEAAAAT",
        "AAAABQAAAAAAAAAAAAAACFJlc2VydmVkAAAAAQAAAAhyZXNlcnZlZAAAAAMAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAAAAAAAAAAAB2RlcG9zaXQAAAAACwAAAAAAAAAAAAAACnNwb3RzX2xlZnQAAAAAAAQAAAAAAAAAAg==",
        "AAAAAgAAAAAAAAAAAAAACVNjb3JlS2luZAAAAAAAAAIAAAAAAAAAAAAAAAdDaGVja0luAAAAAAAAAAAAAAAABk5vU2hvdwAA",
        "AAAABQAAAAAAAAAAAAAACUNoZWNrZWRJbgAAAAAAAAEAAAAKY2hlY2tlZF9pbgAAAAAAAgAAAAAAAAAFZ3Vlc3QAAAAAAAATAAAAAAAAADRkZXBvc2l0ICsgZmVlX2FsbG93YW5jZSwgcmV0dXJuZWQgaW4gdGhpcyBzYW1lIGNhbGwuAAAACHJlZnVuZGVkAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAACUZpbmFsaXplZAAAAAAAAAEAAAAJZmluYWxpemVkAAAAAAAAAwAAAAAAAAAGc2hvd2VkAAAAAAAEAAAAAAAAAAAAAAAIbm9fc2hvd3MAAAAEAAAAAAAAACVUb3RhbCBkZXBvc2l0cyBmb3JmZWl0ZWQgYnkgbm8tc2hvd3MuAAAAAAAACWZvcmZlaXRlZAAAAAAAAAsAAAAAAAAAAg==",
        "AAAAAgAAAAAAAAAAAAAACkF0dGVuZGFuY2UAAAAAAAIAAAAAAAAAAAAAAAhSZXNlcnZlZAAAAAAAAAAAAAAACUNoZWNrZWRJbgAAAA==",
        "AAAAAAAAAElMb2NrIHRoZSBkZXBvc2l0IGFuZCByZXNlcnZlIGEgc3BvdC4gT25seSB3aGlsZSB0aGUgZXZlbnQgaXMgYFJlc2VydmluZ2AuAAAAAAAABHJzdnAAAAABAAAAAAAAAAVndWVzdAAAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAABQAAAAAAAAAAAAAADFBoYXNlQ2hhbmdlZAAAAAEAAAANcGhhc2VfY2hhbmdlZAAAAAAAAAEAAAAAAAAABXBoYXNlAAAAAAAH0AAAAAVQaGFzZQAAAAAAAAAAAAAC",
        "AAAAAAAAAPZQcm92ZSBhdHRlbmRhbmNlIHdpdGggdGhlIG9yZ2FuaXplcidzIHNlY3JldCBhbmQgdGFrZSB0aGUgZGVwb3NpdCBiYWNrLgoKVGhpcyBpcyB0aGUgb25seSBwbGFjZSBhIGd1ZXN0IGdldHMgcGFpZCBvbiB0aGUgaGFwcHkgcGF0aCDigJQgdGhlIGRlcG9zaXQKYW5kIHRoZSBmZWUgcmVpbWJ1cnNlbWVudCBsYW5kIGluIHRoZSBzYW1lIGNhbGwsIHNvIHRoZXJlIGlzIG5vdGhpbmcgdG8KY29tZSBiYWNrIGFuZCBjbGFpbSBsYXRlci4AAAAAAAhjaGVja19pbgAAAAIAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAAAAAAGc2VjcmV0AAAAAAAOAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAADJDbG9zZSB0aGUgZXZlbnQgYW5kIHNldHRsZSB0aGUgbm8tc2hvd3MnIGRlcG9zaXRzLgAAAAAACGZpbmFsaXplAAAAAAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X3BoYXNlAAAAAAAAAAAAAAEAAAfQAAAABVBoYXNlAAAA",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPpAAAH0AAAAAZDb25maWcAAAAAAAM=",
        "AAAAAAAAARdDcmVhdGUgdGhlIGV2ZW50IGFuZCBmdW5kIHRoZSBmZWUtcmVpbWJ1cnNlbWVudCBwb29sLgoKVGhlIG9yZ2FuaXplciB0cmFuc2ZlcnMgYGZlZV9hbGxvd2FuY2UgKiBjYXBhY2l0eWAgaW4sIHNvIGV2ZXJ5IGd1ZXN0IHdobwpzaG93cyB1cCBjYW4gYmUgbWFkZSB3aG9sZSBmb3IgdGhlIGZlZXMgdGhleSBzcGVuZC4gV2hhdGV2ZXIgaXMgbGVmdCBvdmVyCih0aGUgbm8tc2hvd3MgbmV2ZXIgY29zdCBhbnl0aGluZykgZ29lcyBiYWNrIHRvIHRoZSBvcmdhbml6ZXIgb24KYGZpbmFsaXplYC4AAAAACmluaXRpYWxpemUAAAAAAAsAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAJc3RhcnRzX2F0AAAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAdkZXBvc2l0AAAAAAsAAAAAAAAADWZlZV9hbGxvd2FuY2UAAAAAAAALAAAAAAAAAAhjYXBhY2l0eQAAAAQAAAAAAAAACWNvZGVfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAZwb2xpY3kAAAAAB9AAAAANRm9yZmVpdFBvbGljeQAAAAAAAAAAAAAKcmVwdXRhdGlvbgAAAAAD6AAAABMAAAAAAAAACWFkbWlzc2lvbgAAAAAAB9AAAAAJQWRtaXNzaW9uAAAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAK5HbyBiYWNrIHRvIHRha2luZyByZXNlcnZhdGlvbnMsIGUuZy4gdG8gbGV0IGEgbGF0ZWNvbWVyIGluLiBPcmdhbml6ZXIgb25seS4KCkd1ZXN0cyB3aG8gYWxyZWFkeSBjaGVja2VkIGluIGtlZXAgdGhlaXIgcmVmdW5kIGFuZCBzdGF5IG9uIHRoZSBsaXN0OyB0aGlzCm9ubHkgcmVvcGVucyB0aGUgZG9vci4AAAAAAAtyZW9wZW5fcnN2cAAAAAAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAABQAAAUZQdWJsaXNoZWQgd2hlbiBhIHdyaXRlIHRvIHRoZSByZXB1dGF0aW9uIGxlZGdlciBmYWlsZWQgYW5kIHdhcyBzd2FsbG93ZWQuCgpTd2FsbG93aW5nIGl0IGlzIGRlbGliZXJhdGUg4oCUIHNlZSBgcmVjb3JkX3Njb3JlYCDigJQgYnV0IHN3YWxsb3dpbmcgaXQKKnNpbGVudGx5KiB3b3VsZCBtZWFuIGEgbGVkZ2VyIGNvdWxkIHF1aWV0bHkgc3RvcCByZWNvcmRpbmcgYW5kIG5vYm9keSB3b3VsZApmaW5kIG91dCB1bnRpbCBzb21lb25lIGNvbXBhcmVkIHR3byBzZXRzIG9mIG51bWJlcnMuIFRoaXMgbWFrZXMgZXZlcnkKZHJvcHBlZCB3cml0ZSB2aXNpYmxlIG9uLWNoYWluLgAAAAAAAAAAABFSZXB1dGF0aW9uU2tpcHBlZAAAAAAAAAEAAAAScmVwdXRhdGlvbl9za2lwcGVkAAAAAAACAAAAAAAAAAZtZW1iZXIAAAAAABMAAAAAAAAAAAAAAARraW5kAAAH0AAAAAlTY29yZUtpbmQAAAAAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAMZ2V0X3Jlc2VydmVkAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAAMaXNfZmluYWxpemVkAAAAAAAAAAEAAAAB",
        "AAAAAAAAADVTdGFydCBjaGVjay1pbiwgY2xvc2luZyByZXNlcnZhdGlvbnMuIE9yZ2FuaXplciBvbmx5LgAAAAAAAAxvcGVuX2NoZWNraW4AAAAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAOZ2V0X2F0dGVuZGFuY2UAAAAAAAEAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAEAAAPoAAAH0AAAAApBdHRlbmRhbmNlAAA=",
        "AAAAAAAAAAAAAAAOZ2V0X2NoZWNrZWRfaW4AAAAAAAAAAAABAAAD6gAAABM=",
        "AAAAAQAAAatBIG1lbWJlcidzIGF0dGVuZGFuY2UgcmVjb3JkLCBhcyB0aGUgZXZlbnQgY29udHJhY3QgcmVhZHMgaXQuCgpNaXJyb3JzIHRoZSByZXB1dGF0aW9uIGNvbnRyYWN0J3Mgb3duIGBTY29yZWAgZmllbGQgZm9yIGZpZWxkLiBJdCBpcyBjb3BpZWQKcmF0aGVyIHRoYW4gc2hhcmVkIGJlY2F1c2UgdGhhdCBjb250cmFjdCBkZWxpYmVyYXRlbHkgZG9lcyBub3QgbGluayB0aGlzCmNyYXRlIOKAlCBkb2luZyBzbyB3b3VsZCBwdWJsaXNoIGEgYEZvcmZlaXRQb2xpY3lgIHR5cGUgb24gYSByZXB1dGF0aW9uCmxlZGdlcidzIHNwZWMg4oCUIGFuZCBhIGAjW2NvbnRyYWN0dHlwZV1gIHN0cnVjdCBlbmNvZGVzIGFzIGEgbWFwIGtleWVkIGJ5CmZpZWxkIG5hbWUsIHNvIHR3byBpZGVudGljYWwgZGVjbGFyYXRpb25zIGRlY29kZSBlYWNoIG90aGVyIGV4YWN0bHkuAAAAAAAAAAAFU2NvcmUAAAAAAAACAAAAAAAAAAhub19zaG93cwAAAAQAAAAAAAAABXNob3dzAAAAAAAABA==",
        "AAAAAgAAAN1XaG8gaXMgYWxsb3dlZCB0byByZXNlcnZlIGEgc3BvdC4KCkZpeGVkIGF0IGNyZWF0aW9uIGFuZCBlbmZvcmNlZCBpbnNpZGUgdGhlIGV2ZW50IGNvbnRyYWN0IHJhdGhlciB0aGFuIGJ5IGEKc2NyZWVuLCBiZWNhdXNlIGEgZ2F0ZSBhIGZyb250ZW5kIGFwcGxpZXMgaXMgYSBzdWdnZXN0aW9uOiBhbnlvbmUgY2FuIGNhbGwKYHJzdnBgIGRpcmVjdGx5IGFnYWluc3QgdGhlIGNvbnRyYWN0LgAAAAAAAAAAAAAJQWRtaXNzaW9uAAAAAAAABAAAAAAAAABEQW55b25lLCBmaXJzdCBjb21lIGZpcnN0IHNlcnZlZC4gV2hhdCBldmVyeSBldmVudCBjcmVhdGVkIHNvIGZhciBpcy4AAAAET3BlbgAAAAEAAABCQW55b25lIHdob3NlIHJlcHV0YXRpb24gcmVjb3JkIHNob3dzIGF0IGxlYXN0IHRoaXMgbWFueSBjaGVjay1pbnMuAAAAAAAFU2NvcmUAAAAAAAABAAAABAAAAAAAAAAwQW55b25lIHRoZSBvcmdhbml6ZXIgc2F5cyB5ZXMgdG8sIG9uZSBhdCBhIHRpbWUuAAAACEFwcHJvdmFsAAAAAQAAAENBbnlvbmUgdm91Y2hlZCBmb3IgYnkgdGhpcyBtYW55IG1lbWJlcnMgd2l0aCBhIHJlY29yZCBvZiB0aGVpciBvd24uAAAAAAVWb3VjaAAAAAAAAAEAAAAE",
        "AAAAAgAAAD1XaGVyZSB0aGUgZGVwb3NpdHMgb2Ygbm8tc2hvd3MgZ28gd2hlbiBhbiBldmVudCBpcyBmaW5hbGl6ZWQuAAAAAAAAAAAAAA1Gb3JmZWl0UG9saWN5AAAAAAAAAgAAAAAAAAAaU3RyYWlnaHQgdG8gdGhlIG9yZ2FuaXplci4AAAAAAAtUb09yZ2FuaXplcgAAAAAAAAAAK1NwbGl0IGV2ZW5seSBhbW9uZyBldmVyeW9uZSB3aG8gY2hlY2tlZCBpbi4AAAAAE1NwbGl0QW1vbmdBdHRlbmRlZXMA" ]),
      options
    )
  }
  public readonly fromJSON = {
    rsvp: this.txFromJSON<Result<void>>,
        check_in: this.txFromJSON<Result<void>>,
        finalize: this.txFromJSON<Result<void>>,
        get_phase: this.txFromJSON<Phase>,
        get_config: this.txFromJSON<Result<Config>>,
        initialize: this.txFromJSON<Result<void>>,
        reopen_rsvp: this.txFromJSON<Result<void>>,
        get_reserved: this.txFromJSON<Array<string>>,
        is_finalized: this.txFromJSON<boolean>,
        open_checkin: this.txFromJSON<Result<void>>,
        get_attendance: this.txFromJSON<Option<Attendance>>,
        get_checked_in: this.txFromJSON<Array<string>>
  }
}