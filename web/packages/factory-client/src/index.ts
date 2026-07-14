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
    contractId: "CAI5RQZFS46KK2MWOBW7EEM3DJWJN6JSE5LW5JRJ6RCIJMTHCA7JD3CW",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"}
}

export type DataKey = {tag: "Admin", values: void} | {tag: "EventWasmHash", values: void} | {tag: "Events", values: void} | {tag: "Count", values: void};


/**
 * Where the deposits of no-shows go when an event is finalized.
 */
export type ForfeitPolicy = {tag: "ToOrganizer", values: void} | {tag: "SplitAmongAttendees", values: void};

export interface Client {
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
  create_event: ({organizer, token, deposit, fee_allowance, capacity, code_hash, policy}: {organizer: string, token: string, deposit: i128, fee_allowance: i128, capacity: u32, code_hash: Buffer, policy: ForfeitPolicy}, options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a get_event_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_event_count: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

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
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAANRXZlbnRXYXNtSGFzaAAAAAAAAAAAAAAAAAAABkV2ZW50cwAAAAAAAAAAAFJNb25vdG9uaWMgY291bnRlcjsgZG91YmxlcyBhcyB0aGUgZGVwbG95IHNhbHQgc28gZXZlcnkgZXZlbnQgZ2V0cyBpdHMgb3duCmFkZHJlc3MuAAAAAAAFQ291bnQAAAA=",
        "AAAABQAAAAAAAAAAAAAADEV2ZW50Q3JlYXRlZAAAAAEAAAANZXZlbnRfY3JlYXRlZAAAAAAAAAQAAAAAAAAABWV2ZW50AAAAAAAAEwAAAAAAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAAAAAAAAdkZXBvc2l0AAAAAAsAAAAAAAAAAAAAAAhjYXBhY2l0eQAAAAQAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAADVSZWdpc3RlciB0aGUgZmFjdG9yeSBhZ2FpbnN0IHRoZSB1cGxvYWRlZCBldmVudCB3YXNtLgAAAAAAAAppbml0aWFsaXplAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAD2V2ZW50X3dhc21faGFzaAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALbGlzdF9ldmVudHMAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAANtEZXBsb3kgYW5kIGluaXRpYWxpemUgYW4gZXZlbnQgb3duZWQgYnkgYG9yZ2FuaXplcmAuCgpUaGUgb3JnYW5pemVyIGF1dGhvcml6ZXMgdGhpcyB3aG9sZSBjYWxsIHRyZWUsIHdoaWNoIGlzIHdoYXQgbGV0cyB0aGUKZXZlbnQncyBvd24gYGluaXRpYWxpemVgIHB1bGwgdGhlIGZlZSBwb29sIG91dCBvZiB0aGVpciB3YWxsZXQgYXMgcGFydCBvZgp0aGUgc2FtZSB0cmFuc2FjdGlvbi4AAAAADGNyZWF0ZV9ldmVudAAAAAcAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAHZGVwb3NpdAAAAAALAAAAAAAAAA1mZWVfYWxsb3dhbmNlAAAAAAAACwAAAAAAAAAIY2FwYWNpdHkAAAAEAAAAAAAAAAljb2RlX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAGcG9saWN5AAAAAAfQAAAADUZvcmZlaXRQb2xpY3kAAAAAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAAAAAAAAPZ2V0X2V2ZW50X2NvdW50AAAAAAAAAAABAAAABA==",
        "AAAAAgAAAD1XaGVyZSB0aGUgZGVwb3NpdHMgb2Ygbm8tc2hvd3MgZ28gd2hlbiBhbiBldmVudCBpcyBmaW5hbGl6ZWQuAAAAAAAAAAAAAA1Gb3JmZWl0UG9saWN5AAAAAAAAAgAAAAAAAAAaU3RyYWlnaHQgdG8gdGhlIG9yZ2FuaXplci4AAAAAAAtUb09yZ2FuaXplcgAAAAAAAAAAK1NwbGl0IGV2ZW5seSBhbW9uZyBldmVyeW9uZSB3aG8gY2hlY2tlZCBpbi4AAAAAE1NwbGl0QW1vbmdBdHRlbmRlZXMA" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_admin: this.txFromJSON<Result<string>>,
        initialize: this.txFromJSON<Result<void>>,
        list_events: this.txFromJSON<Array<string>>,
        create_event: this.txFromJSON<Result<string>>,
        get_event_count: this.txFromJSON<u32>
  }
}