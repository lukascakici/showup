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
 * 
 * **This struct is frozen.** It is the *stored* type at `DataKey::Score`, and
 * every entry in the live ledger was written by an older wasm — so adding a
 * field to it does not give those entries the field, it makes every client
 * generated from the new spec fail to decode them. The first engagement's
 * scores are graded evidence and have to stay readable at the same address.
 * 
 * It is also what the event contract reads through `interfaces::Score` to
 * enforce a `Score` gate, and *that* contract is deployed. Changing the shape
 * here would break admission on every gated event already on the factory.
 * 
 * Everything the record has grown since lives under its own key and is
 * assembled at read time by `get_record`. See `Extras`.
 */
export interface Score {
  no_shows: u32;
  shows: u32;
}


/**
 * What a record carries beyond turning up, stored separately so it can grow.
 * 
 * One key rather than three, because these are always read together and a
 * Soroban storage entry is rented individually: three keys per member would be
 * three leases to renew for a record that is one thing.
 */
export interface Extras {
  /**
 * Events this member created, counted when each one settles.
 */
events_organised: u32;
  /**
 * How many of those turned out to be for somebody who never showed up.
 * 
 * The half of vouching that makes it cost something: a vouch is a public
 * statement with the voucher's own record behind it.
 */
vouches_broken: u32;
  /**
 * Vouches this member has signed for other people.
 */
vouches_given: u32;
}


/**
 * The whole record, assembled at read time.
 * 
 * A return-only struct, never stored — which is exactly why it is allowed to
 * keep growing where `Score` is not. A client built against an older spec
 * simply does not call this.
 */
export interface Record {
  events_organised: u32;
  no_shows: u32;
  shows: u32;
  vouches_broken: u32;
  vouches_given: u32;
}

export type DataKey = {tag: "Admin", values: void} | {tag: "Factory", values: void} | {tag: "Event", values: readonly [string]} | {tag: "Score", values: readonly [string]} | {tag: "Extras", values: readonly [string]};




export interface Client {
  /**
   * Construct and simulate a renew transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Renew a record's lease. **Anyone may call this, and anyone pays.**
   * 
   * Soroban rents state: an entry nobody touches for long enough is archived
   * and stops being readable. Every write here already extends the lease of
   * what it wrote, which quietly means a record only survives while its owner
   * keeps attending things — so a reputation would expire precisely for the
   * person who stopped needing to prove it, and the only way back would be
   * through us.
   * 
   * So this takes no auth and no admin. A record is a claim its owner should
   * not have to ask permission to keep, and anyone who cares about it — the
   * member, a friend, an organizer who wants to admit them next month — can
   * pay the few stroops to keep it alive. That is what makes the ledger
   * outlive our goodwill, which is the durability the SOW scopes explicitly.
   * 
   * Renewing a record nobody has ever written is a no-op rather than an
   * error: there is no lease to extend, and creating an empty one to renew
   * would let anybody fill the ledger with blank entries at our expense.
   */
  renew: ({member}: {member: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
   * 
   * Deliberately unchanged, and it must stay that way: this is what the
   * deployed event contract calls to enforce a `Score` gate, without a
   * `try_`. A different shape here would trap every gated `rsvp` on the
   * factory rather than refusing it.
   */
  get_score: ({member}: {member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Score>>

  /**
   * Construct and simulate a get_record transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The whole record: turning up, vouching, and organising.
   * 
   * Everything `get_score` returns and everything added since, in one read,
   * because a profile page needs all of it and each extra call is latency in
   * front of somebody deciding whether to vouch for a stranger.
   */
  get_record: ({member}: {member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Record>>

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

  /**
   * Construct and simulate a record_organised transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Count an event against the address that created it. Registered events only.
   * 
   * Called by the event contract when it settles, so the count means "ran an
   * event to the end" rather than "deployed a contract once". An organizer
   * who abandons an event never earns the line.
   */
  record_organised: ({event, organizer}: {event: string, organizer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
        "AAAAAQAAAwZBIG1lbWJlcidzIGF0dGVuZGFuY2UgcmVjb3JkLCBjb3VudGVkIHJhdGhlciB0aGFuIHNjb3JlZC4KCioqVGhpcyBzdHJ1Y3QgaXMgZnJvemVuLioqIEl0IGlzIHRoZSAqc3RvcmVkKiB0eXBlIGF0IGBEYXRhS2V5OjpTY29yZWAsIGFuZApldmVyeSBlbnRyeSBpbiB0aGUgbGl2ZSBsZWRnZXIgd2FzIHdyaXR0ZW4gYnkgYW4gb2xkZXIgd2FzbSDigJQgc28gYWRkaW5nIGEKZmllbGQgdG8gaXQgZG9lcyBub3QgZ2l2ZSB0aG9zZSBlbnRyaWVzIHRoZSBmaWVsZCwgaXQgbWFrZXMgZXZlcnkgY2xpZW50CmdlbmVyYXRlZCBmcm9tIHRoZSBuZXcgc3BlYyBmYWlsIHRvIGRlY29kZSB0aGVtLiBUaGUgZmlyc3QgZW5nYWdlbWVudCdzCnNjb3JlcyBhcmUgZ3JhZGVkIGV2aWRlbmNlIGFuZCBoYXZlIHRvIHN0YXkgcmVhZGFibGUgYXQgdGhlIHNhbWUgYWRkcmVzcy4KCkl0IGlzIGFsc28gd2hhdCB0aGUgZXZlbnQgY29udHJhY3QgcmVhZHMgdGhyb3VnaCBgaW50ZXJmYWNlczo6U2NvcmVgIHRvCmVuZm9yY2UgYSBgU2NvcmVgIGdhdGUsIGFuZCAqdGhhdCogY29udHJhY3QgaXMgZGVwbG95ZWQuIENoYW5naW5nIHRoZSBzaGFwZQpoZXJlIHdvdWxkIGJyZWFrIGFkbWlzc2lvbiBvbiBldmVyeSBnYXRlZCBldmVudCBhbHJlYWR5IG9uIHRoZSBmYWN0b3J5LgoKRXZlcnl0aGluZyB0aGUgcmVjb3JkIGhhcyBncm93biBzaW5jZSBsaXZlcyB1bmRlciBpdHMgb3duIGtleSBhbmQgaXMKYXNzZW1ibGVkIGF0IHJlYWQgdGltZSBieSBgZ2V0X3JlY29yZGAuIFNlZSBgRXh0cmFzYC4AAAAAAAAAAAAFU2NvcmUAAAAAAAACAAAAAAAAAAhub19zaG93cwAAAAQAAAAAAAAABXNob3dzAAAAAAAABA==",
        "AAAAAQAAARZXaGF0IGEgcmVjb3JkIGNhcnJpZXMgYmV5b25kIHR1cm5pbmcgdXAsIHN0b3JlZCBzZXBhcmF0ZWx5IHNvIGl0IGNhbiBncm93LgoKT25lIGtleSByYXRoZXIgdGhhbiB0aHJlZSwgYmVjYXVzZSB0aGVzZSBhcmUgYWx3YXlzIHJlYWQgdG9nZXRoZXIgYW5kIGEKU29yb2JhbiBzdG9yYWdlIGVudHJ5IGlzIHJlbnRlZCBpbmRpdmlkdWFsbHk6IHRocmVlIGtleXMgcGVyIG1lbWJlciB3b3VsZCBiZQp0aHJlZSBsZWFzZXMgdG8gcmVuZXcgZm9yIGEgcmVjb3JkIHRoYXQgaXMgb25lIHRoaW5nLgAAAAAAAAAAAAZFeHRyYXMAAAAAAAMAAAA6RXZlbnRzIHRoaXMgbWVtYmVyIGNyZWF0ZWQsIGNvdW50ZWQgd2hlbiBlYWNoIG9uZSBzZXR0bGVzLgAAAAAAEGV2ZW50c19vcmdhbmlzZWQAAAAEAAAAv0hvdyBtYW55IG9mIHRob3NlIHR1cm5lZCBvdXQgdG8gYmUgZm9yIHNvbWVib2R5IHdobyBuZXZlciBzaG93ZWQgdXAuCgpUaGUgaGFsZiBvZiB2b3VjaGluZyB0aGF0IG1ha2VzIGl0IGNvc3Qgc29tZXRoaW5nOiBhIHZvdWNoIGlzIGEgcHVibGljCnN0YXRlbWVudCB3aXRoIHRoZSB2b3VjaGVyJ3Mgb3duIHJlY29yZCBiZWhpbmQgaXQuAAAAAA52b3VjaGVzX2Jyb2tlbgAAAAAABAAAADBWb3VjaGVzIHRoaXMgbWVtYmVyIGhhcyBzaWduZWQgZm9yIG90aGVyIHBlb3BsZS4AAAANdm91Y2hlc19naXZlbgAAAAAAAAQ=",
        "AAAAAQAAANpUaGUgd2hvbGUgcmVjb3JkLCBhc3NlbWJsZWQgYXQgcmVhZCB0aW1lLgoKQSByZXR1cm4tb25seSBzdHJ1Y3QsIG5ldmVyIHN0b3JlZCDigJQgd2hpY2ggaXMgZXhhY3RseSB3aHkgaXQgaXMgYWxsb3dlZCB0bwprZWVwIGdyb3dpbmcgd2hlcmUgYFNjb3JlYCBpcyBub3QuIEEgY2xpZW50IGJ1aWx0IGFnYWluc3QgYW4gb2xkZXIgc3BlYwpzaW1wbHkgZG9lcyBub3QgY2FsbCB0aGlzLgAAAAAAAAAAAAZSZWNvcmQAAAAAAAUAAAAAAAAAEGV2ZW50c19vcmdhbmlzZWQAAAAEAAAAAAAAAAhub19zaG93cwAAAAQAAAAAAAAABXNob3dzAAAAAAAABAAAAAAAAAAOdm91Y2hlc19icm9rZW4AAAAAAAQAAAAAAAAADXZvdWNoZXNfZ2l2ZW4AAAAAAAAE",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAACxUaGUgb25seSBhZGRyZXNzIGFsbG93ZWQgdG8gcmVnaXN0ZXIgZXZlbnRzLgAAAAdGYWN0b3J5AAAAAAEAAAAsQWxsb3dsaXN0IG1lbWJlcnNoaXAgZm9yIG9uZSBldmVudCBjb250cmFjdC4AAAAFRXZlbnQAAAAAAAABAAAAEwAAAAEAAAAAAAAABVNjb3JlAAAAAAAAAQAAABMAAAABAAAAvUFkZGVkIGFmdGVyIHRoZSBmaXJzdCByZXZpc2lvbiwgYW5kIGtleWVkIHNlcGFyYXRlbHkgZm9yIHRoYXQgcmVhc29uIOKAlApzZWUgYFNjb3JlYC4gQSBtZW1iZXIgd2hvIHByZWRhdGVzIGl0IGhhcyBubyBzdWNoIGVudHJ5LCB3aGljaCBpcyB3aHkKdGhlIHJlYWRlciBiZWxvdyBkZWZhdWx0cyByYXRoZXIgdGhhbiB1bndyYXBzLgAAAAAAAAZFeHRyYXMAAAAAAAEAAAAT",
        "AAAABQAAAJNQdWJsaXNoZWQgb24gZXZlcnkgd3JpdGUsIHNvIGEgcmV2aWV3ZXIgY2FuIHdhdGNoIGEgc2NvcmUgcmlzZSBvbiBhIGNoZWNrLWluCmFuZCBmYWxsIG9uIGEgZmluYWxpemVkIG5vLXNob3cgd2l0aG91dCByZWFkaW5nIGNvbnRyYWN0IHN0YXRlIGF0IGFsbC4AAAAAAAAAAAxTY29yZUNoYW5nZWQAAAABAAAADXNjb3JlX2NoYW5nZWQAAAAAAAADAAAAAAAAAAZtZW1iZXIAAAAAABMAAAAAAAAAAAAAAAVzaG93cwAAAAAAAAQAAAAAAAAAAAAAAAhub19zaG93cwAAAAQAAAAAAAAAAg==",
        "AAAABQAAAI1QdWJsaXNoZWQgd2hlbiBhIGxlYXNlIGlzIHJlbmV3ZWQsIHNvIGEgcmVjb3JkIGtlcHQgYWxpdmUgYnkgYSBzdHJhbmdlciBpcwp2aXNpYmxlIGFzIGV4YWN0bHkgdGhhdCByYXRoZXIgdGhhbiBsb29raW5nIGxpa2UgaXQgbmV2ZXIgZXhwaXJlZC4AAAAAAAAAAAAADVJlY29yZFJlbmV3ZWQAAAAAAAABAAAADnJlY29yZF9yZW5ld2VkAAAAAAABAAAAAAAAAAZtZW1iZXIAAAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAD0V2ZW50UmVnaXN0ZXJlZAAAAAABAAAAEGV2ZW50X3JlZ2lzdGVyZWQAAAABAAAAAAAAAAVldmVudAAAAAAAABMAAAAAAAAAAg==",
        "AAAAAAAAA/dSZW5ldyBhIHJlY29yZCdzIGxlYXNlLiAqKkFueW9uZSBtYXkgY2FsbCB0aGlzLCBhbmQgYW55b25lIHBheXMuKioKClNvcm9iYW4gcmVudHMgc3RhdGU6IGFuIGVudHJ5IG5vYm9keSB0b3VjaGVzIGZvciBsb25nIGVub3VnaCBpcyBhcmNoaXZlZAphbmQgc3RvcHMgYmVpbmcgcmVhZGFibGUuIEV2ZXJ5IHdyaXRlIGhlcmUgYWxyZWFkeSBleHRlbmRzIHRoZSBsZWFzZSBvZgp3aGF0IGl0IHdyb3RlLCB3aGljaCBxdWlldGx5IG1lYW5zIGEgcmVjb3JkIG9ubHkgc3Vydml2ZXMgd2hpbGUgaXRzIG93bmVyCmtlZXBzIGF0dGVuZGluZyB0aGluZ3Mg4oCUIHNvIGEgcmVwdXRhdGlvbiB3b3VsZCBleHBpcmUgcHJlY2lzZWx5IGZvciB0aGUKcGVyc29uIHdobyBzdG9wcGVkIG5lZWRpbmcgdG8gcHJvdmUgaXQsIGFuZCB0aGUgb25seSB3YXkgYmFjayB3b3VsZCBiZQp0aHJvdWdoIHVzLgoKU28gdGhpcyB0YWtlcyBubyBhdXRoIGFuZCBubyBhZG1pbi4gQSByZWNvcmQgaXMgYSBjbGFpbSBpdHMgb3duZXIgc2hvdWxkCm5vdCBoYXZlIHRvIGFzayBwZXJtaXNzaW9uIHRvIGtlZXAsIGFuZCBhbnlvbmUgd2hvIGNhcmVzIGFib3V0IGl0IOKAlCB0aGUKbWVtYmVyLCBhIGZyaWVuZCwgYW4gb3JnYW5pemVyIHdobyB3YW50cyB0byBhZG1pdCB0aGVtIG5leHQgbW9udGgg4oCUIGNhbgpwYXkgdGhlIGZldyBzdHJvb3BzIHRvIGtlZXAgaXQgYWxpdmUuIFRoYXQgaXMgd2hhdCBtYWtlcyB0aGUgbGVkZ2VyCm91dGxpdmUgb3VyIGdvb2R3aWxsLCB3aGljaCBpcyB0aGUgZHVyYWJpbGl0eSB0aGUgU09XIHNjb3BlcyBleHBsaWNpdGx5LgoKUmVuZXdpbmcgYSByZWNvcmQgbm9ib2R5IGhhcyBldmVyIHdyaXR0ZW4gaXMgYSBuby1vcCByYXRoZXIgdGhhbiBhbgplcnJvcjogdGhlcmUgaXMgbm8gbGVhc2UgdG8gZXh0ZW5kLCBhbmQgY3JlYXRpbmcgYW4gZW1wdHkgb25lIHRvIHJlbmV3CndvdWxkIGxldCBhbnlib2R5IGZpbGwgdGhlIGxlZGdlciB3aXRoIGJsYW5rIGVudHJpZXMgYXQgb3VyIGV4cGVuc2UuAAAAAAVyZW5ldwAAAAAAAAEAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAA=",
        "AAAAAAAAAFBSZXBsYWNlIHRoaXMgY29udHJhY3QncyBvd24gY29kZSwga2VlcGluZyBpdHMgYWRkcmVzcyBhbmQgaXRzIHN0YXRlLgpBZG1pbiBvbmx5LgAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAASNBIG1lbWJlcidzIHJlY29yZC4gVW5rbm93biBhZGRyZXNzZXMgcmVhZCBhcyBgezAsIDB9YC4KCkRlbGliZXJhdGVseSB1bmNoYW5nZWQsIGFuZCBpdCBtdXN0IHN0YXkgdGhhdCB3YXk6IHRoaXMgaXMgd2hhdCB0aGUKZGVwbG95ZWQgZXZlbnQgY29udHJhY3QgY2FsbHMgdG8gZW5mb3JjZSBhIGBTY29yZWAgZ2F0ZSwgd2l0aG91dCBhCmB0cnlfYC4gQSBkaWZmZXJlbnQgc2hhcGUgaGVyZSB3b3VsZCB0cmFwIGV2ZXJ5IGdhdGVkIGByc3ZwYCBvbiB0aGUKZmFjdG9yeSByYXRoZXIgdGhhbiByZWZ1c2luZyBpdC4AAAAACWdldF9zY29yZQAAAAAAAAEAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAEAAAfQAAAABVNjb3JlAAAA",
        "AAAAAAAAAQVUaGUgd2hvbGUgcmVjb3JkOiB0dXJuaW5nIHVwLCB2b3VjaGluZywgYW5kIG9yZ2FuaXNpbmcuCgpFdmVyeXRoaW5nIGBnZXRfc2NvcmVgIHJldHVybnMgYW5kIGV2ZXJ5dGhpbmcgYWRkZWQgc2luY2UsIGluIG9uZSByZWFkLApiZWNhdXNlIGEgcHJvZmlsZSBwYWdlIG5lZWRzIGFsbCBvZiBpdCBhbmQgZWFjaCBleHRyYSBjYWxsIGlzIGxhdGVuY3kgaW4KZnJvbnQgb2Ygc29tZWJvZHkgZGVjaWRpbmcgd2hldGhlciB0byB2b3VjaCBmb3IgYSBzdHJhbmdlci4AAAAAAAAKZ2V0X3JlY29yZAAAAAAAAQAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAQAAB9AAAAAGUmVjb3JkAAA=",
        "AAAAAAAAAXtCaW5kIHRoZSBsZWRnZXIgdG8gaXRzIGFkbWluIGFuZCB0byB0aGUgZmFjdG9yeSB0aGF0IG1heSByZWdpc3RlciBldmVudHMuCgpUaGUgZmFjdG9yeSBhZGRyZXNzIGlzIGEgcGFyYW1ldGVyIHJhdGhlciB0aGFuIHNvbWV0aGluZyBkaXNjb3ZlcmVkCmxhdGVyIGJlY2F1c2Ugb2YgdGhlIGRlcGxveW1lbnQgb3JkZXI6IHRoZSBmYWN0b3J5IGlzIGRlcGxveWVkIGZpcnN0LAp0aGlzIGNvbnRyYWN0IHNlY29uZCB3aXRoIHRoZSBmYWN0b3J5J3MgYWRkcmVzcyBpbiBoYW5kLCBhbmQgb25seSB0aGVuIGlzCnRoZSBmYWN0b3J5IHBvaW50ZWQgYmFjayBhdCB0aGlzIG9uZS4gQm90aCBkaXJlY3Rpb25zIHN0YXkgY2hhbmdlYWJsZSDigJQKc2VlIGBzZXRfZmFjdG9yeWAuAAAAAAppbml0aWFsaXplAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAB2ZhY3RvcnkAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAALZ2V0X2ZhY3RvcnkAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAOpQb2ludCB0aGUgbGVkZ2VyIGF0IGEgZGlmZmVyZW50IGZhY3RvcnkuIEFkbWluIG9ubHkuCgpUaGUgZmFjdG9yeSBoYXMgdG8gYmUgcmVkZXBsb3llZCB3aGVuZXZlciB0aGUgZXZlbnQgd2FzbSBjaGFuZ2VzIGluIGEgd2F5Cml0cyBvd24gYHVwZ3JhZGVgIGNhbm5vdCBhYnNvcmI7IHdpdGhvdXQgdGhpcyBzZXR0ZXIsIHRoYXQgd291bGQgc3RyYW5kCmV2ZXJ5IHNjb3JlIGFscmVhZHkgcmVjb3JkZWQgaGVyZS4AAAAAAAtzZXRfZmFjdG9yeQAAAAABAAAAAAAAAAdmYWN0b3J5AAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAG1XaGV0aGVyIHRoZSBnYXRlIGlzIG9wZW4gZm9yIGBldmVudGAg4oCUIHRoZSBvbmUgcmVhZCB0aGF0IGxldHMgYSByZXZpZXdlcgp2ZXJpZnkgdGhlIGFsbG93bGlzdCBmcm9tIG91dHNpZGUuAAAAAAAADWlzX3JlZ2lzdGVyZWQAAAAAAAABAAAAAAAAAAVldmVudAAAAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAACpSZWNvcmQgdGhhdCBgbWVtYmVyYCBzaG93ZWQgdXAgdG8gYGV2ZW50YC4AAAAAAA5yZWNvcmRfY2hlY2tpbgAAAAAAAgAAAAAAAAAFZXZlbnQAAAAAAAATAAAAAAAAAAZtZW1iZXIAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAEVSZWNvcmQgdGhhdCBgbWVtYmVyYCByZXNlcnZlZCBhIHNwb3QgYXQgYGV2ZW50YCBhbmQgbmV2ZXIgY2hlY2tlZCBpbi4AAAAAAAAOcmVjb3JkX25vX3Nob3cAAAAAAAIAAAAAAAAABWV2ZW50AAAAAAAAEwAAAAAAAAAGbWVtYmVyAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAQdMZXQgYW4gZXZlbnQgY29udHJhY3Qgd3JpdGUgc2NvcmVzLiBGYWN0b3J5IG9ubHksIGlkZW1wb3RlbnQuCgpUaGlzIGlzIHRoZSB3aG9sZSBnYXRlLiBUaGUgZmFjdG9yeSBjYWxscyBpdCBpbiB0aGUgc2FtZSB0cmFuc2FjdGlvbiB0aGF0CmRlcGxveXMgdGhlIGV2ZW50LCBzbyB0aGUgYWxsb3dsaXN0IGNhbiBvbmx5IGV2ZXIgY29udGFpbiBjb250cmFjdHMgdGhlCmZhY3RvcnkgaXRzZWxmIGJ1aWx0IGZyb20gYSB3YXNtIGhhc2ggdGhlIGFkbWluIGNob3NlLgAAAAAOcmVnaXN0ZXJfZXZlbnQAAAAAAAEAAAAAAAAABWV2ZW50AAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAQhDb3VudCBhbiBldmVudCBhZ2FpbnN0IHRoZSBhZGRyZXNzIHRoYXQgY3JlYXRlZCBpdC4gUmVnaXN0ZXJlZCBldmVudHMgb25seS4KCkNhbGxlZCBieSB0aGUgZXZlbnQgY29udHJhY3Qgd2hlbiBpdCBzZXR0bGVzLCBzbyB0aGUgY291bnQgbWVhbnMgInJhbiBhbgpldmVudCB0byB0aGUgZW5kIiByYXRoZXIgdGhhbiAiZGVwbG95ZWQgYSBjb250cmFjdCBvbmNlIi4gQW4gb3JnYW5pemVyCndobyBhYmFuZG9ucyBhbiBldmVudCBuZXZlciBlYXJucyB0aGUgbGluZS4AAAAQcmVjb3JkX29yZ2FuaXNlZAAAAAIAAAAAAAAABWV2ZW50AAAAAAAAEwAAAAAAAAAJb3JnYW5pemVyAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    renew: this.txFromJSON<null>,
        upgrade: this.txFromJSON<Result<void>>,
        get_admin: this.txFromJSON<Result<string>>,
        get_score: this.txFromJSON<Score>,
        get_record: this.txFromJSON<Record>,
        initialize: this.txFromJSON<Result<void>>,
        get_factory: this.txFromJSON<Result<string>>,
        set_factory: this.txFromJSON<Result<void>>,
        is_registered: this.txFromJSON<boolean>,
        record_checkin: this.txFromJSON<Result<void>>,
        record_no_show: this.txFromJSON<Result<void>>,
        register_event: this.txFromJSON<Result<void>>,
        record_organised: this.txFromJSON<Result<void>>
  }
}