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
  2: {message:"NotInitialized"}
}

export type DataKey = {tag: "Admin", values: void} | {tag: "EventWasmHash", values: void} | {tag: "Events", values: void} | {tag: "Count", values: void} | {tag: "Reputation", values: void};


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
   * Construct and simulate a create_event transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deploy and initialize an event owned by `organizer`.
   * 
   * The organizer authorizes this whole call tree, which is what lets the
   * event's own `initialize` pull the fee pool out of their wallet as part of
   * the same transaction.
   */
  create_event: ({organizer, title, starts_at, token, deposit, fee_allowance, capacity, code_hash, policy}: {organizer: string, title: string, starts_at: u64, token: string, deposit: i128, fee_allowance: i128, capacity: u32, code_hash: Buffer, policy: ForfeitPolicy}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAAgAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAg==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAANRXZlbnRXYXNtSGFzaAAAAAAAAAAAAAAAAAAABkV2ZW50cwAAAAAAAAAAAFJNb25vdG9uaWMgY291bnRlcjsgZG91YmxlcyBhcyB0aGUgZGVwbG95IHNhbHQgc28gZXZlcnkgZXZlbnQgZ2V0cyBpdHMgb3duCmFkZHJlc3MuAAAAAAAFQ291bnQAAAAAAAAAAAAAhVRoZSByZXB1dGF0aW9uIGxlZGdlciwgaWYgb25lIGlzIHdpcmVkIHVwLiBBYnNlbnQgaXMgYSB2YWxpZCBzdGF0ZTogdGhlCmZhY3RvcnkgcHJlZGF0ZXMgcmVwdXRhdGlvbiBhbmQgc3RpbGwgaGFzIHRvIHdvcmsgd2l0aG91dCBpdC4AAAAAAAAKUmVwdXRhdGlvbgAA",
        "AAAAAAAAAFNSZXBsYWNlIHRoZSBmYWN0b3J5J3Mgb3duIGNvZGUsIGtlZXBpbmcgaXRzIGFkZHJlc3MgYW5kIGl0cyBldmVudCBsaXN0LgpBZG1pbiBvbmx5LgAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAABQAAAAAAAAAAAAAADEV2ZW50Q3JlYXRlZAAAAAEAAAANZXZlbnRfY3JlYXRlZAAAAAAAAAYAAAAAAAAABWV2ZW50AAAAAAAAEwAAAAAAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAAb0NhcnJpZWQgb24gdGhlIGV2ZW50IHNvIGEgZmVlZCBvciBhbiBpbmRleGVyIGNhbiBzaG93IG5hbWVzIHdpdGhvdXQKcmVhZGluZyBldmVyeSBldmVudCBjb250cmFjdCBvbmUgYXQgYSB0aW1lLgAAAAAFdGl0bGUAAAAAAAAQAAAAAAAAAAAAAAAJc3RhcnRzX2F0AAAAAAAABgAAAAAAAAAAAAAAB2RlcG9zaXQAAAAACwAAAAAAAAAAAAAACGNhcGFjaXR5AAAABAAAAAAAAAAC",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAADVSZWdpc3RlciB0aGUgZmFjdG9yeSBhZ2FpbnN0IHRoZSB1cGxvYWRlZCBldmVudCB3YXNtLgAAAAAAAAppbml0aWFsaXplAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAD2V2ZW50X3dhc21faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALbGlzdF9ldmVudHMAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAANtEZXBsb3kgYW5kIGluaXRpYWxpemUgYW4gZXZlbnQgb3duZWQgYnkgYG9yZ2FuaXplcmAuCgpUaGUgb3JnYW5pemVyIGF1dGhvcml6ZXMgdGhpcyB3aG9sZSBjYWxsIHRyZWUsIHdoaWNoIGlzIHdoYXQgbGV0cyB0aGUKZXZlbnQncyBvd24gYGluaXRpYWxpemVgIHB1bGwgdGhlIGZlZSBwb29sIG91dCBvZiB0aGVpciB3YWxsZXQgYXMgcGFydCBvZgp0aGUgc2FtZSB0cmFuc2FjdGlvbi4AAAAADGNyZWF0ZV9ldmVudAAAAAkAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAJc3RhcnRzX2F0AAAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAdkZXBvc2l0AAAAAAsAAAAAAAAADWZlZV9hbGxvd2FuY2UAAAAAAAALAAAAAAAAAAhjYXBhY2l0eQAAAAQAAAAAAAAACWNvZGVfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAZwb2xpY3kAAAAAB9AAAAANRm9yZmVpdFBvbGljeQAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAACNgTm9uZWAgdW50aWwgYW4gYWRtaW4gd2lyZXMgb25lIHVwLgAAAAAOZ2V0X3JlcHV0YXRpb24AAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAANxXaXJlIHRoZSBmYWN0b3J5IHRvIGEgcmVwdXRhdGlvbiBsZWRnZXIsIG9yIG1vdmUgaXQgdG8gYW5vdGhlciBvbmUuCkFkbWluIG9ubHkuCgpUaGlzIGlzIHRoZSBzZWNvbmQgaGFsZiBvZiB0aGUgY2lyY3VsYXIgc2V0dXA6IHJlcHV0YXRpb24gaXMgZGVwbG95ZWQKa25vd2luZyB0aGUgZmFjdG9yeSdzIGFkZHJlc3MsIHRoZW4gdGhlIGZhY3RvcnkgaXMgcG9pbnRlZCBiYWNrIGhlcmUuAAAADnNldF9yZXB1dGF0aW9uAAAAAAABAAAAAAAAAApyZXB1dGF0aW9uAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAAPZ2V0X2V2ZW50X2NvdW50AAAAAAAAAAABAAAABA==",
        "AAAAAAAAAINXaGljaCBldmVudCByZXZpc2lvbiBuZXcgZXZlbnRzIGdldC4gTGV0cyBhIHJldmlld2VyIGNoZWNrIHRoYXQgdGhlCmRlcGxveWVkIGZhY3RvcnkgcmVhbGx5IGlzIHBvaW50aW5nIGF0IHRoZSB3YXNtIHRoZSBkb2NzIGNsYWltLgAAAAATZ2V0X2V2ZW50X3dhc21faGFzaAAAAAAAAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAAQ1Qb2ludCBuZXcgZXZlbnRzIGF0IGEgbmV3IGV2ZW50IHdhc20uIEFkbWluIG9ubHkuCgpSZWFkIGF0IGRlcGxveSB0aW1lIG9uIGV2ZXJ5IGBjcmVhdGVfZXZlbnRgLCBzbyB0aGlzIHRha2VzIGVmZmVjdCBvbiB0aGUKbmV4dCBldmVudCBhbmQgbGVhdmVzIGV2ZXJ5IGV4aXN0aW5nIG9uZSBleGFjdGx5IGFzIGl0IHdhcyDigJQgYW4gZXZlbnQKcGVvcGxlIGhhdmUgYWxyZWFkeSBsb2NrZWQgZGVwb3NpdHMgaW4gbXVzdCBuZXZlciBjaGFuZ2UgdW5kZXJuZWF0aCB0aGVtLgAAAAAAABNzZXRfZXZlbnRfd2FzbV9oYXNoAAAAAAEAAAAAAAAAD2V2ZW50X3dhc21faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAgAAAD1XaGVyZSB0aGUgZGVwb3NpdHMgb2Ygbm8tc2hvd3MgZ28gd2hlbiBhbiBldmVudCBpcyBmaW5hbGl6ZWQuAAAAAAAAAAAAAA1Gb3JmZWl0UG9saWN5AAAAAAAAAgAAAAAAAAAaU3RyYWlnaHQgdG8gdGhlIG9yZ2FuaXplci4AAAAAAAtUb09yZ2FuaXplcgAAAAAAAAAAK1NwbGl0IGV2ZW5seSBhbW9uZyBldmVyeW9uZSB3aG8gY2hlY2tlZCBpbi4AAAAAE1NwbGl0QW1vbmdBdHRlbmRlZXMA" ]),
      options
    )
  }
  public readonly fromJSON = {
    upgrade: this.txFromJSON<Result<void>>,
        get_admin: this.txFromJSON<Result<string>>,
        initialize: this.txFromJSON<Result<void>>,
        list_events: this.txFromJSON<Array<string>>,
        create_event: this.txFromJSON<Result<string>>,
        get_reputation: this.txFromJSON<Option<string>>,
        set_reputation: this.txFromJSON<Result<void>>,
        get_event_count: this.txFromJSON<u32>,
        get_event_wasm_hash: this.txFromJSON<Result<Buffer>>,
        set_event_wasm_hash: this.txFromJSON<Result<void>>
  }
}