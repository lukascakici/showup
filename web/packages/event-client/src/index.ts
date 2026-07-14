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
  11: {message:"AlreadyFinalized"}
}


export interface Config {
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
  token: string;
}

export type DataKey = {tag: "Config", values: void} | {tag: "Finalized", values: void} | {tag: "Reserved", values: void} | {tag: "CheckedIn", values: void} | {tag: "Attendance", values: readonly [string]};




export type Attendance = {tag: "Reserved", values: void} | {tag: "CheckedIn", values: void};

/**
 * Where the deposits of no-shows go when an event is finalized.
 */
export type ForfeitPolicy = {tag: "ToOrganizer", values: void} | {tag: "SplitAmongAttendees", values: void};

export interface Client {
  /**
   * Construct and simulate a rsvp transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lock the deposit and reserve a spot.
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
  initialize: ({organizer, token, deposit, fee_allowance, capacity, code_hash, policy}: {organizer: string, token: string, deposit: i128, fee_allowance: i128, capacity: u32, code_hash: Buffer, policy: ForfeitPolicy}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_reserved transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reserved: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a is_finalized transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_finalized: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAOSW52YWxpZERlcG9zaXQAAAAAAAMAAAAAAAAAD0ludmFsaWRDYXBhY2l0eQAAAAAEAAAAAAAAABNJbnZhbGlkRmVlQWxsb3dhbmNlAAAAAAUAAAAAAAAAD0FscmVhZHlSZXNlcnZlZAAAAAAGAAAAAAAAAAlFdmVudEZ1bGwAAAAAAAAHAAAAAAAAAAtOb3RSZXNlcnZlZAAAAAAIAAAAAAAAABBBbHJlYWR5Q2hlY2tlZEluAAAACQAAAAAAAAAJV3JvbmdDb2RlAAAAAAAACgAAAAAAAAAQQWxyZWFkeUZpbmFsaXplZAAAAAs=",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAABwAAAAAAAAAIY2FwYWNpdHkAAAAEAAAAcXNoYTI1NiBvZiB0aGUgY2hlY2staW4gc2VjcmV0LiBUaGUgc2VjcmV0IGl0c2VsZiBuZXZlciB0b3VjaGVzIHRoZSBjaGFpbgp1bnRpbCBhIGd1ZXN0IHJldmVhbHMgaXQgYnkgY2hlY2tpbmcgaW4uAAAAAAAACWNvZGVfaGFzaAAAAAAAA+4AAAAgAAAAJ0xvY2tlZCBieSBlYWNoIGd1ZXN0IHRvIHJlc2VydmUgYSBzcG90LgAAAAAHZGVwb3NpdAAAAAALAAAAkVBhaWQgYmFjayB0byBlYWNoIGd1ZXN0IG9uIGNoZWNrLWluLCBvbiB0b3Agb2YgdGhlIGRlcG9zaXQsIHRvIGNvdmVyIHRoZQpmZWVzIHRoZXkgc3BlbnQgb24gYHJzdnBgICsgYGNoZWNrX2luYC4gRnVuZGVkIGJ5IHRoZSBvcmdhbml6ZXIgdXBmcm9udC4AAAAAAAANZmVlX2FsbG93YW5jZQAAAAAAAAsAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAABnBvbGljeQAAAAAH0AAAAA1Gb3JmZWl0UG9saWN5AAAAAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAAAAAAAAAAAJRmluYWxpemVkAAAAAAAAAAAAAAAAAAAIUmVzZXJ2ZWQAAAAAAAAAAAAAAAlDaGVja2VkSW4AAAAAAAABAAAAAAAAAApBdHRlbmRhbmNlAAAAAAABAAAAEw==",
        "AAAABQAAAAAAAAAAAAAACFJlc2VydmVkAAAAAQAAAAhyZXNlcnZlZAAAAAMAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAAAAAAAAAAAB2RlcG9zaXQAAAAACwAAAAAAAAAAAAAACnNwb3RzX2xlZnQAAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACUNoZWNrZWRJbgAAAAAAAAEAAAAKY2hlY2tlZF9pbgAAAAAAAgAAAAAAAAAFZ3Vlc3QAAAAAAAATAAAAAAAAADRkZXBvc2l0ICsgZmVlX2FsbG93YW5jZSwgcmV0dXJuZWQgaW4gdGhpcyBzYW1lIGNhbGwuAAAACHJlZnVuZGVkAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAACUZpbmFsaXplZAAAAAAAAAEAAAAJZmluYWxpemVkAAAAAAAAAwAAAAAAAAAGc2hvd2VkAAAAAAAEAAAAAAAAAAAAAAAIbm9fc2hvd3MAAAAEAAAAAAAAACVUb3RhbCBkZXBvc2l0cyBmb3JmZWl0ZWQgYnkgbm8tc2hvd3MuAAAAAAAACWZvcmZlaXRlZAAAAAAAAAsAAAAAAAAAAg==",
        "AAAAAgAAAAAAAAAAAAAACkF0dGVuZGFuY2UAAAAAAAIAAAAAAAAAAAAAAAhSZXNlcnZlZAAAAAAAAAAAAAAACUNoZWNrZWRJbgAAAA==",
        "AAAAAAAAACRMb2NrIHRoZSBkZXBvc2l0IGFuZCByZXNlcnZlIGEgc3BvdC4AAAAEcnN2cAAAAAEAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAPZQcm92ZSBhdHRlbmRhbmNlIHdpdGggdGhlIG9yZ2FuaXplcidzIHNlY3JldCBhbmQgdGFrZSB0aGUgZGVwb3NpdCBiYWNrLgoKVGhpcyBpcyB0aGUgb25seSBwbGFjZSBhIGd1ZXN0IGdldHMgcGFpZCBvbiB0aGUgaGFwcHkgcGF0aCDigJQgdGhlIGRlcG9zaXQKYW5kIHRoZSBmZWUgcmVpbWJ1cnNlbWVudCBsYW5kIGluIHRoZSBzYW1lIGNhbGwsIHNvIHRoZXJlIGlzIG5vdGhpbmcgdG8KY29tZSBiYWNrIGFuZCBjbGFpbSBsYXRlci4AAAAAAAhjaGVja19pbgAAAAIAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAAAAAAGc2VjcmV0AAAAAAAOAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAADJDbG9zZSB0aGUgZXZlbnQgYW5kIHNldHRsZSB0aGUgbm8tc2hvd3MnIGRlcG9zaXRzLgAAAAAACGZpbmFsaXplAAAAAAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPpAAAH0AAAAAZDb25maWcAAAAAAAM=",
        "AAAAAAAAARdDcmVhdGUgdGhlIGV2ZW50IGFuZCBmdW5kIHRoZSBmZWUtcmVpbWJ1cnNlbWVudCBwb29sLgoKVGhlIG9yZ2FuaXplciB0cmFuc2ZlcnMgYGZlZV9hbGxvd2FuY2UgKiBjYXBhY2l0eWAgaW4sIHNvIGV2ZXJ5IGd1ZXN0IHdobwpzaG93cyB1cCBjYW4gYmUgbWFkZSB3aG9sZSBmb3IgdGhlIGZlZXMgdGhleSBzcGVuZC4gV2hhdGV2ZXIgaXMgbGVmdCBvdmVyCih0aGUgbm8tc2hvd3MgbmV2ZXIgY29zdCBhbnl0aGluZykgZ29lcyBiYWNrIHRvIHRoZSBvcmdhbml6ZXIgb24KYGZpbmFsaXplYC4AAAAACmluaXRpYWxpemUAAAAAAAcAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAHZGVwb3NpdAAAAAALAAAAAAAAAA1mZWVfYWxsb3dhbmNlAAAAAAAACwAAAAAAAAAIY2FwYWNpdHkAAAAEAAAAAAAAAAljb2RlX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAGcG9saWN5AAAAAAfQAAAADUZvcmZlaXRQb2xpY3kAAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAMZ2V0X3Jlc2VydmVkAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAAMaXNfZmluYWxpemVkAAAAAAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAOZ2V0X2F0dGVuZGFuY2UAAAAAAAEAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAEAAAPoAAAH0AAAAApBdHRlbmRhbmNlAAA=",
        "AAAAAAAAAAAAAAAOZ2V0X2NoZWNrZWRfaW4AAAAAAAAAAAABAAAD6gAAABM=",
        "AAAAAgAAAD1XaGVyZSB0aGUgZGVwb3NpdHMgb2Ygbm8tc2hvd3MgZ28gd2hlbiBhbiBldmVudCBpcyBmaW5hbGl6ZWQuAAAAAAAAAAAAAA1Gb3JmZWl0UG9saWN5AAAAAAAAAgAAAAAAAAAaU3RyYWlnaHQgdG8gdGhlIG9yZ2FuaXplci4AAAAAAAtUb09yZ2FuaXplcgAAAAAAAAAAK1NwbGl0IGV2ZW5seSBhbW9uZyBldmVyeW9uZSB3aG8gY2hlY2tlZCBpbi4AAAAAE1NwbGl0QW1vbmdBdHRlbmRlZXMA" ]),
      options
    )
  }
  public readonly fromJSON = {
    rsvp: this.txFromJSON<Result<void>>,
        check_in: this.txFromJSON<Result<void>>,
        finalize: this.txFromJSON<Result<void>>,
        get_config: this.txFromJSON<Result<Config>>,
        initialize: this.txFromJSON<Result<void>>,
        get_reserved: this.txFromJSON<Array<string>>,
        is_finalized: this.txFromJSON<boolean>,
        get_attendance: this.txFromJSON<Option<Attendance>>,
        get_checked_in: this.txFromJSON<Array<string>>
  }
}