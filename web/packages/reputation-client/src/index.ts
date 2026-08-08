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
    contractId: "CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  /**
   * A score write from an address the factory never registered.
   */
  3: {message:"NotAnEvent"}
}


/**
 * A member's attendance record, counted rather than scored.
 */
export interface Score {
  no_shows: u32;
  shows: u32;
}

export type DataKey = {tag: "Admin", values: void} | {tag: "Factory", values: void} | {tag: "Event", values: readonly [string]} | {tag: "Score", values: readonly [string]};



export interface Client {
  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace this contract's own code, keeping its address and its state.
   * Admin only.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a get_score transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A member's record. Unknown addresses read as `{0, 0}`.
   */
  get_score: ({member}: {member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Score>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Bind the ledger to its admin and to the factory that may register events.
   * 
   * The factory address is a parameter rather than something discovered
   * later because of the deployment order: the factory is deployed first,
   * this contract second with the factory's address in hand, and only then is
   * the factory pointed back at this one. Both directions stay changeable —
   * see `set_factory`.
   */
  initialize: ({admin, factory}: {admin: string, factory: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_factory transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_factory: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a set_factory transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Point the ledger at a different factory. Admin only.
   * 
   * The factory has to be redeployed whenever the event wasm changes in a way
   * its own `upgrade` cannot absorb; without this setter, that would strand
   * every score already recorded here.
   */
  set_factory: ({factory}: {factory: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_registered transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether the gate is open for `event` — the one read that lets a reviewer
   * verify the allowlist from outside.
   */
  is_registered: ({event}: {event: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a record_checkin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record that `member` showed up to `event`.
   */
  record_checkin: ({event, member}: {event: string, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a record_no_show transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Record that `member` reserved a spot at `event` and never checked in.
   */
  record_no_show: ({event, member}: {event: string, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a register_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Let an event contract write scores. Factory only, idempotent.
   * 
   * This is the whole gate. The factory calls it in the same transaction that
   * deploys the event, so the allowlist can only ever contain contracts the
   * factory itself built from a wasm hash the admin chose.
   */
  register_event: ({event}: {event: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAAwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAADtBIHNjb3JlIHdyaXRlIGZyb20gYW4gYWRkcmVzcyB0aGUgZmFjdG9yeSBuZXZlciByZWdpc3RlcmVkLgAAAAAKTm90QW5FdmVudAAAAAAAAw==",
        "AAAAAQAAADlBIG1lbWJlcidzIGF0dGVuZGFuY2UgcmVjb3JkLCBjb3VudGVkIHJhdGhlciB0aGFuIHNjb3JlZC4AAAAAAAAAAAAABVNjb3JlAAAAAAAAAgAAAAAAAAAIbm9fc2hvd3MAAAAEAAAAAAAAAAVzaG93cwAAAAAAAAQ=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAACxUaGUgb25seSBhZGRyZXNzIGFsbG93ZWQgdG8gcmVnaXN0ZXIgZXZlbnRzLgAAAAdGYWN0b3J5AAAAAAEAAAAsQWxsb3dsaXN0IG1lbWJlcnNoaXAgZm9yIG9uZSBldmVudCBjb250cmFjdC4AAAAFRXZlbnQAAAAAAAABAAAAEwAAAAEAAAAAAAAABVNjb3JlAAAAAAAAAQAAABM=",
        "AAAABQAAAJNQdWJsaXNoZWQgb24gZXZlcnkgd3JpdGUsIHNvIGEgcmV2aWV3ZXIgY2FuIHdhdGNoIGEgc2NvcmUgcmlzZSBvbiBhIGNoZWNrLWluCmFuZCBmYWxsIG9uIGEgZmluYWxpemVkIG5vLXNob3cgd2l0aG91dCByZWFkaW5nIGNvbnRyYWN0IHN0YXRlIGF0IGFsbC4AAAAAAAAAAAxTY29yZUNoYW5nZWQAAAABAAAADXNjb3JlX2NoYW5nZWQAAAAAAAADAAAAAAAAAAZtZW1iZXIAAAAAABMAAAAAAAAAAAAAAAVzaG93cwAAAAAAAAQAAAAAAAAAAAAAAAhub19zaG93cwAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0V2ZW50UmVnaXN0ZXJlZAAAAAABAAAAEGV2ZW50X3JlZ2lzdGVyZWQAAAABAAAAAAAAAAVldmVudAAAAAAAABMAAAAAAAAAAg==",
        "AAAAAAAAAFBSZXBsYWNlIHRoaXMgY29udHJhY3QncyBvd24gY29kZSwga2VlcGluZyBpdHMgYWRkcmVzcyBhbmQgaXRzIHN0YXRlLgpBZG1pbiBvbmx5LgAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAADZBIG1lbWJlcidzIHJlY29yZC4gVW5rbm93biBhZGRyZXNzZXMgcmVhZCBhcyBgezAsIDB9YC4AAAAAAAlnZXRfc2NvcmUAAAAAAAABAAAAAAAAAAZtZW1iZXIAAAAAABMAAAABAAAH0AAAAAVTY29yZQAAAA==",
        "AAAAAAAAAXtCaW5kIHRoZSBsZWRnZXIgdG8gaXRzIGFkbWluIGFuZCB0byB0aGUgZmFjdG9yeSB0aGF0IG1heSByZWdpc3RlciBldmVudHMuCgpUaGUgZmFjdG9yeSBhZGRyZXNzIGlzIGEgcGFyYW1ldGVyIHJhdGhlciB0aGFuIHNvbWV0aGluZyBkaXNjb3ZlcmVkCmxhdGVyIGJlY2F1c2Ugb2YgdGhlIGRlcGxveW1lbnQgb3JkZXI6IHRoZSBmYWN0b3J5IGlzIGRlcGxveWVkIGZpcnN0LAp0aGlzIGNvbnRyYWN0IHNlY29uZCB3aXRoIHRoZSBmYWN0b3J5J3MgYWRkcmVzcyBpbiBoYW5kLCBhbmQgb25seSB0aGVuIGlzCnRoZSBmYWN0b3J5IHBvaW50ZWQgYmFjayBhdCB0aGlzIG9uZS4gQm90aCBkaXJlY3Rpb25zIHN0YXkgY2hhbmdlYWJsZSDigJQKc2VlIGBzZXRfZmFjdG9yeWAuAAAAAAppbml0aWFsaXplAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAB2ZhY3RvcnkAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALZ2V0X2ZhY3RvcnkAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAOpQb2ludCB0aGUgbGVkZ2VyIGF0IGEgZGlmZmVyZW50IGZhY3RvcnkuIEFkbWluIG9ubHkuCgpUaGUgZmFjdG9yeSBoYXMgdG8gYmUgcmVkZXBsb3llZCB3aGVuZXZlciB0aGUgZXZlbnQgd2FzbSBjaGFuZ2VzIGluIGEgd2F5Cml0cyBvd24gYHVwZ3JhZGVgIGNhbm5vdCBhYnNvcmI7IHdpdGhvdXQgdGhpcyBzZXR0ZXIsIHRoYXQgd291bGQgc3RyYW5kCmV2ZXJ5IHNjb3JlIGFscmVhZHkgcmVjb3JkZWQgaGVyZS4AAAAAAAtzZXRfZmFjdG9yeQAAAAABAAAAAAAAAAdmYWN0b3J5AAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAG1XaGV0aGVyIHRoZSBnYXRlIGlzIG9wZW4gZm9yIGBldmVudGAg4oCUIHRoZSBvbmUgcmVhZCB0aGF0IGxldHMgYSByZXZpZXdlcgp2ZXJpZnkgdGhlIGFsbG93bGlzdCBmcm9tIG91dHNpZGUuAAAAAAAADWlzX3JlZ2lzdGVyZWQAAAAAAAABAAAAAAAAAAVldmVudAAAAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAACpSZWNvcmQgdGhhdCBgbWVtYmVyYCBzaG93ZWQgdXAgdG8gYGV2ZW50YC4AAAAAAA5yZWNvcmRfY2hlY2tpbgAAAAAAAgAAAAAAAAAFZXZlbnQAAAAAAAATAAAAAAAAAAZtZW1iZXIAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAEVSZWNvcmQgdGhhdCBgbWVtYmVyYCByZXNlcnZlZCBhIHNwb3QgYXQgYGV2ZW50YCBhbmQgbmV2ZXIgY2hlY2tlZCBpbi4AAAAAAAAOcmVjb3JkX25vX3Nob3cAAAAAAAIAAAAAAAAABWV2ZW50AAAAAAAAEwAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAQdMZXQgYW4gZXZlbnQgY29udHJhY3Qgd3JpdGUgc2NvcmVzLiBGYWN0b3J5IG9ubHksIGlkZW1wb3RlbnQuCgpUaGlzIGlzIHRoZSB3aG9sZSBnYXRlLiBUaGUgZmFjdG9yeSBjYWxscyBpdCBpbiB0aGUgc2FtZSB0cmFuc2FjdGlvbiB0aGF0CmRlcGxveXMgdGhlIGV2ZW50LCBzbyB0aGUgYWxsb3dsaXN0IGNhbiBvbmx5IGV2ZXIgY29udGFpbiBjb250cmFjdHMgdGhlCmZhY3RvcnkgaXRzZWxmIGJ1aWx0IGZyb20gYSB3YXNtIGhhc2ggdGhlIGFkbWluIGNob3NlLgAAAAAOcmVnaXN0ZXJfZXZlbnQAAAAAAAEAAAAAAAAABWV2ZW50AAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    upgrade: this.txFromJSON<Result<void>>,
        get_admin: this.txFromJSON<Result<string>>,
        get_score: this.txFromJSON<Score>,
        initialize: this.txFromJSON<Result<void>>,
        get_factory: this.txFromJSON<Result<string>>,
        set_factory: this.txFromJSON<Result<void>>,
        is_registered: this.txFromJSON<boolean>,
        record_checkin: this.txFromJSON<Result<void>>,
        record_no_show: this.txFromJSON<Result<void>>,
        register_event: this.txFromJSON<Result<void>>
  }
}