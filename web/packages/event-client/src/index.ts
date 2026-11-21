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
  22: {message:"NoReputation"},
  /**
   * `remove_host` aimed at the creator, who is permanent.
   */
  23: {message:"CannotRemoveCreator"},
  /**
   * A vouch from a record that cannot carry one: too few shows, or a vouch
   * of their own already broken.
   */
  24: {message:"CannotVouch"},
  /**
   * A second vouch for the same guest from the same member.
   */
  25: {message:"AlreadyVouched"},
  /**
   * A vouch for yourself, which would make the whole gate a formality.
   */
  26: {message:"CannotVouchForYourself"},
  /**
   * Not enough members have vouched for this guest yet.
   */
  27: {message:"NotEnoughVouches"},
  /**
   * `reclaim` before `starts_at + RECLAIM_GRACE_SECONDS`. The organizer
   * still has time to settle.
   */
  28: {message:"ReclaimTooEarly"},
  /**
   * A second `reclaim` from a guest who already took their deposit back.
   */
  29: {message:"AlreadyReclaimed"},
  /**
   * `deposit + fee_allowance`, multiplied out across the whole capacity,
   * does not fit in an `i128`.
   * 
   * Refused at creation rather than discovered at settlement: these three
   * numbers are the organizer's to choose, and the only moment they can be
   * rejected without anybody's money already depending on them is before the
   * event exists.
   */
  30: {message:"AmountsTooLarge"},
  /**
   * Arithmetic in the money path went out of range, which it cannot do while
   * this contract's own invariants hold.
   * 
   * Unreachable by construction: the ceiling at `initialize` bounds every
   * amount, the capacity guard bounds every list, and the attendance states
   * are mutually exclusive. It exists so that if one of those ever stops
   * being true, settlement **refuses with a name** instead of trapping with
   * an opaque host panic — a refusal can be diagnosed and recovered from, a
   * wrong payout cannot.
   */
  31: {message:"InvariantViolated"}
}

export type Phase = {tag: "Reserving", values: void} | {tag: "CheckingIn", values: void} | {tag: "Finalized", values: void};


/**
 * Everything about an event that arrived after the first revision.
 * 
 * This exists because `Config` cannot grow. It is a **stored** struct, and
 * every event already deployed holds one written by an older wasm — so adding
 * a field to it does not give those events the field, it gives every client
 * generated from the new spec a value it cannot decode. `get_config` on a live
 * event failed with `vec not set` the moment `admission` was added to it.
 * 
 * `Terms` is assembled at read time from separately keyed entries instead, so
 * it can keep growing: a client that asks an old event for its terms gets a
 * missing-function error it can recognise and answer for itself, which is a
 * far better failure than a config that will not decode at all.
 */
export interface Terms {
  /**
 * Who may reserve a spot. Fixed at creation, like the deposit and the
 * capacity: the terms somebody agreed to when they locked their money must
 * not be editable by the person holding it.
 */
admission: Admission;
  /**
 * Everyone who may run the event: open check-in, reopen reservations,
 * answer applications, finalize, and change this list.
 * 
 * The creator is always `hosts[0]` and cannot be removed, so this overlaps
 * `Config::organizer` by exactly one address on purpose. `organizer`
 * answers "whose event is this, and where does forfeited money go" — which
 * must have one unambiguous answer no matter who else is helping — and
 * `hosts` answers "who may act", which is a list.
 */
hosts: Array<string>;
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
  /**
 * Whoever created the event. Permanent, and the only address forfeited
 * deposits are ever paid to — see `Terms::hosts` for who may *act*.
 */
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

export type DataKey = {tag: "Config", values: void} | {tag: "Phase", values: void} | {tag: "Reserved", values: void} | {tag: "CheckedIn", values: void} | {tag: "Attendance", values: readonly [string]} | {tag: "Admission", values: void} | {tag: "Hosts", values: void} | {tag: "Reclaimed", values: void} | {tag: "Vouchers", values: readonly [string]};



export type ScoreKind = {tag: "CheckIn", values: void} | {tag: "NoShow", values: void};




/**
 * Where somebody stands with one event.
 * 
 * The first three exist only under `Admission::Approval` and none of them has
 * any money behind it — an application is a question, and asking it costs
 * nothing. `Reserved` is the first state that means a deposit is locked, which
 * is why it is also the first state the reserved list and the capacity count
 * know about.
 */
export type Attendance = {tag: "Applied", values: void} | {tag: "Approved", values: void} | {tag: "Declined", values: void} | {tag: "Reserved", values: void} | {tag: "CheckedIn", values: void} | {tag: "Reclaimed", values: void};








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
   * Construct and simulate a rsvp transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lock the deposit and reserve a spot. Only while the event is `Reserving`.
   */
  rsvp: ({guest}: {guest: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a apply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Ask to come. `Admission::Approval` only, and it moves no money.
   * 
   * The SOW's promise is that nothing is taken before the organizer says
   * yes, so this is two transactions rather than one: `apply` here, then
   * `rsvp` after approval, and the deposit moves in that second one. It has
   * to be the applicant's own transaction. An approval that could pull
   * somebody's deposit would mean anyone could be charged for being liked.
   */
  apply: ({guest}: {guest: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a vouch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Put your own record behind somebody else. `Admission::Vouch` only.
   * 
   * This is the mechanism that makes a vouch more than a whitelist entry: it
   * is a signed, public statement by a member with a record, and it costs
   * them if the person they backed does not turn up — see `finalize`.
   * 
   * Three refusals, each closing a different hole:
   * 
   * - **A voucher must qualify.** `VOUCH_QUALIFY_SHOWS` shows, *and* no
   * broken vouch of their own. Without the second half, somebody could
   * wave in strangers forever at the cost of a record that never moves.
   * - **Nobody vouches twice for the same guest.** Otherwise one member
   * meets a threshold of five on their own and the count means nothing.
   * - **Nobody vouches for themselves.** The same hole, one step shorter.
   * 
   * It moves no money and takes no spot. The guest still has to `rsvp`, and
   * that is where the deposit goes — a vouch is permission to reserve, not a
   * reservation.
   */
  vouch: ({voucher, guest}: {voucher: string, guest: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Let an applicant reserve. Any host.
   */
  approve: ({host, applicant}: {host: string, applicant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a decline transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Turn an applicant down. Any host.
   */
  decline: ({host, applicant}: {host: string, applicant: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_host transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether `who` may run this event. Everything host-gated is behind the
   * same check, so a screen can hide the controls it would refuse.
   */
  is_host: ({who}: {who: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a reclaim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Start check-in, closing reservations. Any host.
   * Take your own deposit back when the organizer never settled.
   * 
   * `open_checkin` and `finalize` both need a host signature, so without this
   * there is **no path out of a reserved deposit that a guest can take on
   * their own**: an organizer who walks away leaves every deposit in this
   * contract locked forever, recoverable by nobody — not the guest, not the
   * admin, not us. That is not a bug, which is why no audit would report it;
   * it is the design working exactly as written. On Mainnet it is the one way
   * Showup could take somebody's money and fail to give it back.
   * 
   * Three properties make this safe to expose:
   * 
   * - **It touches only the caller's own deposit.** There is no amount
   * argument and no recipient argument, so it can never become a way to
   * empty an event.
   * - **It cannot be used early.** Not until `starts_at` plus
   * `RECLAIM_GRACE_SECONDS`, by which point the organizer has had two days
   * past their own start time to settle.
   * - **It is not a way to dodge a no-show.** A reclaim leav
   */
  reclaim: ({guest}: {guest: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_host transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add someone who can run this event alongside the creator. Any host.
   * 
   * Idempotent: adding an existing host changes nothing and succeeds, so a
   * retried transaction never turns into an error somebody has to read.
   */
  add_host: ({host, new_host}: {host: string, new_host: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
   * Close the event and settle the no-shows' deposits. Any host.
   */
  finalize: ({host}: {host: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_phase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_phase: (options?: MethodOptions) => Promise<AssembledTransaction<Phase>>

  /**
   * Construct and simulate a get_terms transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The admission mode and the host list, in one read.
   * 
   * One call rather than two getters because a page needs both and every
   * extra RPC read is latency in front of somebody deciding whether to lock
   * a deposit. Absent on events deployed before this revision — a caller
   * that gets "function not found" back is looking at an open event with one
   * host, and can say so without asking anything else.
   */
  get_terms: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Terms>>>

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
   * Construct and simulate a get_vouches transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many members have vouched for `guest` at this event.
   */
  get_vouches: ({guest}: {guest: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a remove_host transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Take someone's hosting rights away. Any host, except the creator's.
   * 
   * Any host may remove any other, which means co-hosts can remove each
   * other — deliberately. The creator is permanent, so the worst case is a
   * mess only they can be asked to clean up, and the alternative (only the
   * creator may remove) leaves an event stuck the moment they are
   * unreachable, which is the exact situation co-hosting exists for.
   */
  remove_host: ({host, target}: {host: string, target: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a reopen_rsvp transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Go back to taking reservations, e.g. to let a latecomer in. Any host.
   * 
   * Guests who already checked in keep their refund and stay on the list; this
   * only reopens the door.
   */
  reopen_rsvp: ({host}: {host: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
   */
  open_checkin: ({host}: {host: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_reclaimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Everyone who took their own deposit back. Empty on a healthy event.
   */
  get_reclaimed: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAHwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAOSW52YWxpZERlcG9zaXQAAAAAAAMAAAAAAAAAD0ludmFsaWRDYXBhY2l0eQAAAAAEAAAAAAAAABNJbnZhbGlkRmVlQWxsb3dhbmNlAAAAAAUAAAAAAAAAD0FscmVhZHlSZXNlcnZlZAAAAAAGAAAAAAAAAAlFdmVudEZ1bGwAAAAAAAAHAAAAAAAAAAtOb3RSZXNlcnZlZAAAAAAIAAAAAAAAABBBbHJlYWR5Q2hlY2tlZEluAAAACQAAAAAAAAAJV3JvbmdDb2RlAAAAAAAACgAAAAAAAAAQQWxyZWFkeUZpbmFsaXplZAAAAAsAAAArYHJzdnBgIGFmdGVyIHRoZSBvcmdhbml6ZXIgb3BlbmVkIGNoZWNrLWluLgAAAAASUmVzZXJ2YXRpb25zQ2xvc2VkAAAAAAAMAAAAKmBjaGVja19pbmAgYmVmb3JlIHRoZSBvcmdhbml6ZXIgb3BlbmVkIGl0LgAAAAAADkNoZWNrSW5Ob3RPcGVuAAAAAAANAAAAQmBvcGVuX2NoZWNraW5gIC8gYHJlb3Blbl9yc3ZwYCBmcm9tIGEgcGhhc2UgdGhhdCBkb2Vzbid0IGFsbG93IGl0LgAAAAAACldyb25nUGhhc2UAAAAAAA4AAAAoRW1wdHksIG9yIGxvbmdlciB0aGFuIGBNQVhfVElUTEVfQllURVNgLgAAAAxJbnZhbGlkVGl0bGUAAAAPAAAAQFplcm8uIEFuIGV2ZW50IHdpdGggbm8gc3RhcnQgdGltZSBjYW5ub3QgYmUgc29ydGVkIG9yIGRlc2NyaWJlZC4AAAAQSW52YWxpZFN0YXJ0VGltZQAAABAAAABCYHJzdnBgIG9uIGEgYFNjb3JlYC1nYXRlZCBldmVudCBmcm9tIGEgcmVjb3JkIGJlbG93IHRoZSB0aHJlc2hvbGQuAAAAAAALU2NvcmVUb29Mb3cAAAAAEQAAAEhgcnN2cGAgb24gYW4gYEFwcHJvdmFsYCBldmVudCBmcm9tIHNvbWVvbmUgdGhlIG9yZ2FuaXplciBuZXZlciBhcHByb3ZlZC4AAAAKTm90QXBwbGllZAAAAAAAEgAAACVBIHNlY29uZCBgYXBwbHlgIGZyb20gdGhlIHNhbWUgZ3Vlc3QuAAAAAAAADkFscmVhZHlBcHBsaWVkAAAAAAATAAAANEEgaG9zdC1vbmx5IGNhbGwgZnJvbSBhbiBhZGRyZXNzIHRoYXQgaXMgbm90IGEgaG9zdC4AAAAITm90QUhvc3QAAAAUAAAAfEEgY2FsbCB0aGF0IG9ubHkgbWFrZXMgc2Vuc2UgdW5kZXIgYSBkaWZmZXJlbnQgYWRtaXNzaW9uIG1vZGUg4oCUIGFwcGx5aW5nCnRvIGFuIG9wZW4gZXZlbnQsIG9yIHZvdWNoaW5nIGZvciBhIGd1ZXN0IGF0IG9uZS4AAAASV3JvbmdBZG1pc3Npb25Nb2RlAAAAAAAVAAAARkEgZ2F0ZSB0aGF0IG5lZWRzIGEgcmVwdXRhdGlvbiBsZWRnZXIgb24gYW4gZXZlbnQgY3JlYXRlZCB3aXRob3V0IG9uZS4AAAAAAAxOb1JlcHV0YXRpb24AAAAWAAAANWByZW1vdmVfaG9zdGAgYWltZWQgYXQgdGhlIGNyZWF0b3IsIHdobyBpcyBwZXJtYW5lbnQuAAAAAAAAE0Nhbm5vdFJlbW92ZUNyZWF0b3IAAAAAFwAAAGNBIHZvdWNoIGZyb20gYSByZWNvcmQgdGhhdCBjYW5ub3QgY2Fycnkgb25lOiB0b28gZmV3IHNob3dzLCBvciBhIHZvdWNoCm9mIHRoZWlyIG93biBhbHJlYWR5IGJyb2tlbi4AAAAAC0Nhbm5vdFZvdWNoAAAAABgAAAA3QSBzZWNvbmQgdm91Y2ggZm9yIHRoZSBzYW1lIGd1ZXN0IGZyb20gdGhlIHNhbWUgbWVtYmVyLgAAAAAOQWxyZWFkeVZvdWNoZWQAAAAAABkAAABCQSB2b3VjaCBmb3IgeW91cnNlbGYsIHdoaWNoIHdvdWxkIG1ha2UgdGhlIHdob2xlIGdhdGUgYSBmb3JtYWxpdHkuAAAAAAAWQ2Fubm90Vm91Y2hGb3JZb3Vyc2VsZgAAAAAAGgAAADNOb3QgZW5vdWdoIG1lbWJlcnMgaGF2ZSB2b3VjaGVkIGZvciB0aGlzIGd1ZXN0IHlldC4AAAAAEE5vdEVub3VnaFZvdWNoZXMAAAAbAAAAXWByZWNsYWltYCBiZWZvcmUgYHN0YXJ0c19hdCArIFJFQ0xBSU1fR1JBQ0VfU0VDT05EU2AuIFRoZSBvcmdhbml6ZXIKc3RpbGwgaGFzIHRpbWUgdG8gc2V0dGxlLgAAAAAAAA9SZWNsYWltVG9vRWFybHkAAAAAHAAAAERBIHNlY29uZCBgcmVjbGFpbWAgZnJvbSBhIGd1ZXN0IHdobyBhbHJlYWR5IHRvb2sgdGhlaXIgZGVwb3NpdCBiYWNrLgAAABBBbHJlYWR5UmVjbGFpbWVkAAAAHQAAAURgZGVwb3NpdCArIGZlZV9hbGxvd2FuY2VgLCBtdWx0aXBsaWVkIG91dCBhY3Jvc3MgdGhlIHdob2xlIGNhcGFjaXR5LApkb2VzIG5vdCBmaXQgaW4gYW4gYGkxMjhgLgoKUmVmdXNlZCBhdCBjcmVhdGlvbiByYXRoZXIgdGhhbiBkaXNjb3ZlcmVkIGF0IHNldHRsZW1lbnQ6IHRoZXNlIHRocmVlCm51bWJlcnMgYXJlIHRoZSBvcmdhbml6ZXIncyB0byBjaG9vc2UsIGFuZCB0aGUgb25seSBtb21lbnQgdGhleSBjYW4gYmUKcmVqZWN0ZWQgd2l0aG91dCBhbnlib2R5J3MgbW9uZXkgYWxyZWFkeSBkZXBlbmRpbmcgb24gdGhlbSBpcyBiZWZvcmUgdGhlCmV2ZW50IGV4aXN0cy4AAAAPQW1vdW50c1Rvb0xhcmdlAAAAAB4AAAHoQXJpdGhtZXRpYyBpbiB0aGUgbW9uZXkgcGF0aCB3ZW50IG91dCBvZiByYW5nZSwgd2hpY2ggaXQgY2Fubm90IGRvIHdoaWxlCnRoaXMgY29udHJhY3QncyBvd24gaW52YXJpYW50cyBob2xkLgoKVW5yZWFjaGFibGUgYnkgY29uc3RydWN0aW9uOiB0aGUgY2VpbGluZyBhdCBgaW5pdGlhbGl6ZWAgYm91bmRzIGV2ZXJ5CmFtb3VudCwgdGhlIGNhcGFjaXR5IGd1YXJkIGJvdW5kcyBldmVyeSBsaXN0LCBhbmQgdGhlIGF0dGVuZGFuY2Ugc3RhdGVzCmFyZSBtdXR1YWxseSBleGNsdXNpdmUuIEl0IGV4aXN0cyBzbyB0aGF0IGlmIG9uZSBvZiB0aG9zZSBldmVyIHN0b3BzCmJlaW5nIHRydWUsIHNldHRsZW1lbnQgKipyZWZ1c2VzIHdpdGggYSBuYW1lKiogaW5zdGVhZCBvZiB0cmFwcGluZyB3aXRoCmFuIG9wYXF1ZSBob3N0IHBhbmljIOKAlCBhIHJlZnVzYWwgY2FuIGJlIGRpYWdub3NlZCBhbmQgcmVjb3ZlcmVkIGZyb20sIGEKd3JvbmcgcGF5b3V0IGNhbm5vdC4AAAARSW52YXJpYW50VmlvbGF0ZWQAAAAAAAAf",
        "AAAAAgAAAAAAAAAAAAAABVBoYXNlAAAAAAAAAwAAAAAAAAAsR3Vlc3RzIGNhbiByZXNlcnZlOyBub2JvZHkgY2FuIGNoZWNrIGluIHlldC4AAAAJUmVzZXJ2aW5nAAAAAAAAAAAAAD9UaGUgb3JnYW5pemVyIGhhcyBzdGFydGVkIGNoZWNrLWluLCBzbyByZXNlcnZhdGlvbnMgYXJlIGNsb3NlZC4AAAAACkNoZWNraW5nSW4AAAAAAAAAAAA4U2V0dGxlZC4gVGVybWluYWwg4oCUIHRoZXJlIGlzIGRlbGliZXJhdGVseSBubyB3YXkgYmFjay4AAAAJRmluYWxpemVkAAAA",
        "AAAAAQAAAtZFdmVyeXRoaW5nIGFib3V0IGFuIGV2ZW50IHRoYXQgYXJyaXZlZCBhZnRlciB0aGUgZmlyc3QgcmV2aXNpb24uCgpUaGlzIGV4aXN0cyBiZWNhdXNlIGBDb25maWdgIGNhbm5vdCBncm93LiBJdCBpcyBhICoqc3RvcmVkKiogc3RydWN0LCBhbmQKZXZlcnkgZXZlbnQgYWxyZWFkeSBkZXBsb3llZCBob2xkcyBvbmUgd3JpdHRlbiBieSBhbiBvbGRlciB3YXNtIOKAlCBzbyBhZGRpbmcKYSBmaWVsZCB0byBpdCBkb2VzIG5vdCBnaXZlIHRob3NlIGV2ZW50cyB0aGUgZmllbGQsIGl0IGdpdmVzIGV2ZXJ5IGNsaWVudApnZW5lcmF0ZWQgZnJvbSB0aGUgbmV3IHNwZWMgYSB2YWx1ZSBpdCBjYW5ub3QgZGVjb2RlLiBgZ2V0X2NvbmZpZ2Agb24gYSBsaXZlCmV2ZW50IGZhaWxlZCB3aXRoIGB2ZWMgbm90IHNldGAgdGhlIG1vbWVudCBgYWRtaXNzaW9uYCB3YXMgYWRkZWQgdG8gaXQuCgpgVGVybXNgIGlzIGFzc2VtYmxlZCBhdCByZWFkIHRpbWUgZnJvbSBzZXBhcmF0ZWx5IGtleWVkIGVudHJpZXMgaW5zdGVhZCwgc28KaXQgY2FuIGtlZXAgZ3Jvd2luZzogYSBjbGllbnQgdGhhdCBhc2tzIGFuIG9sZCBldmVudCBmb3IgaXRzIHRlcm1zIGdldHMgYQptaXNzaW5nLWZ1bmN0aW9uIGVycm9yIGl0IGNhbiByZWNvZ25pc2UgYW5kIGFuc3dlciBmb3IgaXRzZWxmLCB3aGljaCBpcyBhCmZhciBiZXR0ZXIgZmFpbHVyZSB0aGFuIGEgY29uZmlnIHRoYXQgd2lsbCBub3QgZGVjb2RlIGF0IGFsbC4AAAAAAAAAAAAFVGVybXMAAAAAAAACAAAAtldobyBtYXkgcmVzZXJ2ZSBhIHNwb3QuIEZpeGVkIGF0IGNyZWF0aW9uLCBsaWtlIHRoZSBkZXBvc2l0IGFuZCB0aGUKY2FwYWNpdHk6IHRoZSB0ZXJtcyBzb21lYm9keSBhZ3JlZWQgdG8gd2hlbiB0aGV5IGxvY2tlZCB0aGVpciBtb25leSBtdXN0Cm5vdCBiZSBlZGl0YWJsZSBieSB0aGUgcGVyc29uIGhvbGRpbmcgaXQuAAAAAAAJYWRtaXNzaW9uAAAAAAAH0AAAAAlBZG1pc3Npb24AAAAAAAHHRXZlcnlvbmUgd2hvIG1heSBydW4gdGhlIGV2ZW50OiBvcGVuIGNoZWNrLWluLCByZW9wZW4gcmVzZXJ2YXRpb25zLAphbnN3ZXIgYXBwbGljYXRpb25zLCBmaW5hbGl6ZSwgYW5kIGNoYW5nZSB0aGlzIGxpc3QuCgpUaGUgY3JlYXRvciBpcyBhbHdheXMgYGhvc3RzWzBdYCBhbmQgY2Fubm90IGJlIHJlbW92ZWQsIHNvIHRoaXMgb3ZlcmxhcHMKYENvbmZpZzo6b3JnYW5pemVyYCBieSBleGFjdGx5IG9uZSBhZGRyZXNzIG9uIHB1cnBvc2UuIGBvcmdhbml6ZXJgCmFuc3dlcnMgIndob3NlIGV2ZW50IGlzIHRoaXMsIGFuZCB3aGVyZSBkb2VzIGZvcmZlaXRlZCBtb25leSBnbyIg4oCUIHdoaWNoCm11c3QgaGF2ZSBvbmUgdW5hbWJpZ3VvdXMgYW5zd2VyIG5vIG1hdHRlciB3aG8gZWxzZSBpcyBoZWxwaW5nIOKAlCBhbmQKYGhvc3RzYCBhbnN3ZXJzICJ3aG8gbWF5IGFjdCIsIHdoaWNoIGlzIGEgbGlzdC4AAAAABWhvc3RzAAAAAAAD6gAAABM=",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAACgAAAAAAAAAIY2FwYWNpdHkAAAAEAAAAcXNoYTI1NiBvZiB0aGUgY2hlY2staW4gc2VjcmV0LiBUaGUgc2VjcmV0IGl0c2VsZiBuZXZlciB0b3VjaGVzIHRoZSBjaGFpbgp1bnRpbCBhIGd1ZXN0IHJldmVhbHMgaXQgYnkgY2hlY2tpbmcgaW4uAAAAAAAACWNvZGVfaGFzaAAAAAAAA+4AAAAgAAAAJ0xvY2tlZCBieSBlYWNoIGd1ZXN0IHRvIHJlc2VydmUgYSBzcG90LgAAAAAHZGVwb3NpdAAAAAALAAAAkVBhaWQgYmFjayB0byBlYWNoIGd1ZXN0IG9uIGNoZWNrLWluLCBvbiB0b3Agb2YgdGhlIGRlcG9zaXQsIHRvIGNvdmVyIHRoZQpmZWVzIHRoZXkgc3BlbnQgb24gYHJzdnBgICsgYGNoZWNrX2luYC4gRnVuZGVkIGJ5IHRoZSBvcmdhbml6ZXIgdXBmcm9udC4AAAAAAAANZmVlX2FsbG93YW5jZQAAAAAAAAsAAACIV2hvZXZlciBjcmVhdGVkIHRoZSBldmVudC4gUGVybWFuZW50LCBhbmQgdGhlIG9ubHkgYWRkcmVzcyBmb3JmZWl0ZWQKZGVwb3NpdHMgYXJlIGV2ZXIgcGFpZCB0byDigJQgc2VlIGBUZXJtczo6aG9zdHNgIGZvciB3aG8gbWF5ICphY3QqLgAAAAlvcmdhbml6ZXIAAAAAAAATAAAAAAAAAAZwb2xpY3kAAAAAB9AAAAANRm9yZmVpdFBvbGljeQAAAAAAATpXaGVyZSBzaG93LXVwIHNjb3JlcyBhcmUgcmVjb3JkZWQsIGlmIHRoZSBmYWN0b3J5IGhhZCBhIGxlZGdlciB3aXJlZCB1cAp3aGVuIHRoaXMgZXZlbnQgd2FzIGNyZWF0ZWQuIEZpeGVkIGZvciB0aGUgZXZlbnQncyB3aG9sZSBsaWZlOiBhbiBldmVudApwZW9wbGUgaGF2ZSBsb2NrZWQgZGVwb3NpdHMgaW4gbXVzdCBub3QgaGF2ZSBpdHMgc2NvcmluZyBtb3ZlZAp1bmRlcm5lYXRoIHRoZW0sIGFuZCBgTm9uZWAgaGFzIHRvIGtlZXAgd29ya2luZyBiZWNhdXNlIGV2ZW50cyBjcmVhdGVkCmJlZm9yZSByZXB1dGF0aW9uIGV4aXN0ZWQgc3RpbGwgcnVuLgAAAAAACnJlcHV0YXRpb24AAAAAA+gAAAATAAABXFVuaXggc2Vjb25kcywgVVRDLiAqKkluZm9ybWF0aW9uYWwuKioKClRoZSBwaGFzZSBtYWNoaW5lIGlzIHRoZSBzaW5nbGUgYXV0aG9yaXR5IG9uIHdoYXQgaXMgYWxsb3dlZCB3aGVuLCBhbmQgYQpzZWNvbmQgdGltZS1iYXNlZCBhdXRob3JpdHkgd291bGQgY29udHJhZGljdCBpdCDigJQgYHJlb3Blbl9yc3ZwYCBleGlzdHMKcHJlY2lzZWx5IHNvIGEgbGF0ZWNvbWVyIGNhbiBzdGlsbCByZXNlcnZlIGFmdGVyIHRoZSBldmVudCBoYXMgYmVndW4uClRoaXMgZWFybnMgaXRzIHBsYWNlIGJ5IG1ha2luZyBldmVudHMgc29ydGFibGUgYW5kIGJ5IGxldHRpbmcgdGhlIFVJIHNheQoic3RhcnRzIGluIDMgaG91cnMiLgAAAAlzdGFydHNfYXQAAAAAAAAGAAABKldoYXQgdGhlIGV2ZW50IGlzIGNhbGxlZC4gVXAgdG8gYE1BWF9USVRMRV9CWVRFU2Agb2YgVVRGLTguCgpPbi1jaGFpbiByYXRoZXIgdGhhbiBpbiB0aGUgb2ZmLWNoYWluIGluZGV4LCBhbmQgdGhhdCBpcyB0aGUgd2hvbGUgcmVhc29uCnRoZSBpbmRleCBuZWVkcyBubyBsb2dpbjogYC9hcGkvZXZlbnRzL3N5bmNgIGNhbiBvbmx5IHN0b3JlIHdoYXQgaXQgY2FuCnJlLXJlYWQgZnJvbSBhIGNvbnRyYWN0LCBzbyBhIHRpdGxlIGl0IGNvdWxkIG5vdCB2ZXJpZnkgd291bGQgYmUgYSB0aXRsZQphbnlib2R5IGNvdWxkIHNldC4AAAAAAAV0aXRsZQAAAAAAABAAAAAAAAAABXRva2VuAAAAAAAAEw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACQAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAAAAAAAAAAAFUGhhc2UAAAAAAAAAAAAAAAAAAAhSZXNlcnZlZAAAAAAAAAAAAAAACUNoZWNrZWRJbgAAAAAAAAEAAAAAAAAACkF0dGVuZGFuY2UAAAAAAAEAAAATAAAAAAAAAMpBZGRlZCBhZnRlciB0aGUgZmlyc3QgcmV2aXNpb24sIGFuZCBrZXllZCBzZXBhcmF0ZWx5IGZvciB0aGF0IHJlYXNvbiDigJQKc2VlIGBUZXJtc2AuIEFuIGV2ZW50IHRoYXQgcHJlZGF0ZXMgdGhlbSBoYXMgbmVpdGhlciBrZXksIHdoaWNoIGlzIHdoeQpib3RoIHJlYWRlcnMgYmVsb3cgaGF2ZSBhIGRlZmF1bHQgcmF0aGVyIHRoYW4gYW4gYHVud3JhcGAuAAAAAAAJQWRtaXNzaW9uAAAAAAAAAAAAAAAAAAAFSG9zdHMAAAAAAAAAAAAA90V2ZXJ5b25lIHdobyBoYXMgdGFrZW4gdGhlaXIgZGVwb3NpdCBiYWNrIHdpdGhvdXQgdGhlIG9yZ2FuaXplci4KCkEgbGlzdCByYXRoZXIgdGhhbiBhIGNvdW50ZXIgZm9yIHRoZSBzYW1lIHJlYXNvbiBgVm91Y2hlcnNgIGlzIG9uZTogdGhlCmV2aWRlbmNlIGhhcyB0byBiZSBhYmxlIHRvIG5hbWUgd2hvLCBhbmQgYGZpbmFsaXplYCByZWFkcyBpdHMgbGVuZ3RoIHRvCmtub3cgaG93IG11Y2ggbW9uZXkgaGFzIGFscmVhZHkgbGVmdC4AAAAACVJlY2xhaW1lZAAAAAAAAAEAAADdRXZlcnlvbmUgd2hvIGhhcyB2b3VjaGVkIGZvciB0aGlzIGd1ZXN0LCBhdCB0aGlzIGV2ZW50LgoKQSBsaXN0IHJhdGhlciB0aGFuIGEgY291bnRlciBiZWNhdXNlIGBmaW5hbGl6ZWAgaGFzIHRvIGNoYXJnZSB0aGVtIGJ5Cm5hbWUgd2hlbiB0aGUgZ3Vlc3QgZG9lcyBub3QgdHVybiB1cCDigJQgYSBudW1iZXIgY291bGQgc2F5IGhvdyBtYW55IHdlcmUKd3JvbmcgYnV0IG5vdCB3aGljaC4AAAAAAAAIVm91Y2hlcnMAAAABAAAAEw==",
        "AAAABQAAADlQdWJsaXNoZWQgd2hlbiBzb21lYm9keSBwdXRzIHRoZWlyIHJlY29yZCBiZWhpbmQgYSBndWVzdC4AAAAAAAAAAAAAB1ZvdWNoZWQAAAAAAQAAAAd2b3VjaGVkAAAAAAMAAAAAAAAAB3ZvdWNoZXIAAAAAEwAAAAAAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAAAAABASG93IG1hbnkgdGhpcyBndWVzdCBub3cgaGFzLCBzbyBhIHdhdGNoZXIgY2FuIHNlZSB0aGUgZ2F0ZSBvcGVuLgAAAAd2b3VjaGVzAAAAAAQAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACFJlc2VydmVkAAAAAQAAAAhyZXNlcnZlZAAAAAMAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAAAAAAAAAAAB2RlcG9zaXQAAAAACwAAAAAAAAAAAAAACnNwb3RzX2xlZnQAAAAAAAQAAAAAAAAAAg==",
        "AAAAAgAAAAAAAAAAAAAACVNjb3JlS2luZAAAAAAAAAIAAAAAAAAAAAAAAAdDaGVja0luAAAAAAAAAAAAAAAABk5vU2hvdwAA",
        "AAAABQAAAAAAAAAAAAAACUNoZWNrZWRJbgAAAAAAAAEAAAAKY2hlY2tlZF9pbgAAAAAAAgAAAAAAAAAFZ3Vlc3QAAAAAAAATAAAAAAAAADRkZXBvc2l0ICsgZmVlX2FsbG93YW5jZSwgcmV0dXJuZWQgaW4gdGhpcyBzYW1lIGNhbGwuAAAACHJlZnVuZGVkAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAACUZpbmFsaXplZAAAAAAAAAEAAAAJZmluYWxpemVkAAAAAAAAAwAAAAAAAAAGc2hvd2VkAAAAAAAEAAAAAAAAAAAAAAAIbm9fc2hvd3MAAAAEAAAAAAAAACVUb3RhbCBkZXBvc2l0cyBmb3JmZWl0ZWQgYnkgbm8tc2hvd3MuAAAAAAAACWZvcmZlaXRlZAAAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACUhvc3RBZGRlZAAAAAAAAAEAAAAKaG9zdF9hZGRlZAAAAAAAAQAAAAAAAAAEaG9zdAAAABMAAAAAAAAAAg==",
        "AAAAAgAAAWBXaGVyZSBzb21lYm9keSBzdGFuZHMgd2l0aCBvbmUgZXZlbnQuCgpUaGUgZmlyc3QgdGhyZWUgZXhpc3Qgb25seSB1bmRlciBgQWRtaXNzaW9uOjpBcHByb3ZhbGAgYW5kIG5vbmUgb2YgdGhlbSBoYXMKYW55IG1vbmV5IGJlaGluZCBpdCDigJQgYW4gYXBwbGljYXRpb24gaXMgYSBxdWVzdGlvbiwgYW5kIGFza2luZyBpdCBjb3N0cwpub3RoaW5nLiBgUmVzZXJ2ZWRgIGlzIHRoZSBmaXJzdCBzdGF0ZSB0aGF0IG1lYW5zIGEgZGVwb3NpdCBpcyBsb2NrZWQsIHdoaWNoCmlzIHdoeSBpdCBpcyBhbHNvIHRoZSBmaXJzdCBzdGF0ZSB0aGUgcmVzZXJ2ZWQgbGlzdCBhbmQgdGhlIGNhcGFjaXR5IGNvdW50Cmtub3cgYWJvdXQuAAAAAAAAAApBdHRlbmRhbmNlAAAAAAAGAAAAAAAAACBBc2tlZCB0byBjb21lLCBub3QgeWV0IGFuc3dlcmVkLgAAAAdBcHBsaWVkAAAAAAAAAABCQW5zd2VyZWQgeWVzLiBNYXkgbm93IHJlc2VydmUsIGFuZCB0aGF0IGlzIHdoZW4gdGhlIGRlcG9zaXQgbW92ZXMuAAAAAAAIQXBwcm92ZWQAAAAAAAAAaEFuc3dlcmVkIG5vLiBUZXJtaW5hbCwgc28gYSBkZWNsaW5lZCBhcHBsaWNhbnQgY2Fubm90IHJlLWFwcGx5IHRoZWlyIHdheQpiYWNrIGludG8gYW4gb3JnYW5pemVyJ3MgaW5ib3guAAAACERlY2xpbmVkAAAAAAAAAAAAAAAIUmVzZXJ2ZWQAAAAAAAAAAAAAAAlDaGVja2VkSW4AAAAAAAAAAAABolRvb2sgdGhlaXIgb3duIGRlcG9zaXQgYmFjaywgYmVjYXVzZSB0aGUgb3JnYW5pemVyIG5ldmVyIHNldHRsZWQuCgoqKkRlbGliZXJhdGVseSBuZWl0aGVyIGBDaGVja2VkSW5gIG5vciBsZWZ0IGFzIGBSZXNlcnZlZGAuKiogQSByZWNsYWltIGlzCm5vdCBhdHRlbmRhbmNlIGFuZCBpdCBpcyBub3QgYWJzZW5jZTogdGhlIGd1ZXN0IHJlY292ZXJlZCB0aGVpciBtb25leQpmcm9tIGFuIGV2ZW50IHRoYXQgbmV2ZXIgaGFwcGVuZWQgcHJvcGVybHksIGFuZCB0aGUgb25lIG51bWJlciB0aGlzCnByb2R1Y3Qgc2VsbHMgbXVzdCBub3QgcmVjb3JkIHRoYXQgYXMgZWl0aGVyLiBCZWluZyBpdHMgb3duIHN0YXRlIGlzCndoYXQga2VlcHMgYGZpbmFsaXplYCdzIG5vLXNob3cgbG9vcCBmcm9tIHRvdWNoaW5nIHRoZW0g4oCUIHNlZSB0aGVyZS4AAAAAAAlSZWNsYWltZWQAAAA=",
        "AAAAAAAAAElMb2NrIHRoZSBkZXBvc2l0IGFuZCByZXNlcnZlIGEgc3BvdC4gT25seSB3aGlsZSB0aGUgZXZlbnQgaXMgYFJlc2VydmluZ2AuAAAAAAAABHJzdnAAAAABAAAAAAAAAAVndWVzdAAAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAZxBc2sgdG8gY29tZS4gYEFkbWlzc2lvbjo6QXBwcm92YWxgIG9ubHksIGFuZCBpdCBtb3ZlcyBubyBtb25leS4KClRoZSBTT1cncyBwcm9taXNlIGlzIHRoYXQgbm90aGluZyBpcyB0YWtlbiBiZWZvcmUgdGhlIG9yZ2FuaXplciBzYXlzCnllcywgc28gdGhpcyBpcyB0d28gdHJhbnNhY3Rpb25zIHJhdGhlciB0aGFuIG9uZTogYGFwcGx5YCBoZXJlLCB0aGVuCmByc3ZwYCBhZnRlciBhcHByb3ZhbCwgYW5kIHRoZSBkZXBvc2l0IG1vdmVzIGluIHRoYXQgc2Vjb25kIG9uZS4gSXQgaGFzCnRvIGJlIHRoZSBhcHBsaWNhbnQncyBvd24gdHJhbnNhY3Rpb24uIEFuIGFwcHJvdmFsIHRoYXQgY291bGQgcHVsbApzb21lYm9keSdzIGRlcG9zaXQgd291bGQgbWVhbiBhbnlvbmUgY291bGQgYmUgY2hhcmdlZCBmb3IgYmVpbmcgbGlrZWQuAAAABWFwcGx5AAAAAAAAAQAAAAAAAAAFZ3Vlc3QAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAA4FQdXQgeW91ciBvd24gcmVjb3JkIGJlaGluZCBzb21lYm9keSBlbHNlLiBgQWRtaXNzaW9uOjpWb3VjaGAgb25seS4KClRoaXMgaXMgdGhlIG1lY2hhbmlzbSB0aGF0IG1ha2VzIGEgdm91Y2ggbW9yZSB0aGFuIGEgd2hpdGVsaXN0IGVudHJ5OiBpdAppcyBhIHNpZ25lZCwgcHVibGljIHN0YXRlbWVudCBieSBhIG1lbWJlciB3aXRoIGEgcmVjb3JkLCBhbmQgaXQgY29zdHMKdGhlbSBpZiB0aGUgcGVyc29uIHRoZXkgYmFja2VkIGRvZXMgbm90IHR1cm4gdXAg4oCUIHNlZSBgZmluYWxpemVgLgoKVGhyZWUgcmVmdXNhbHMsIGVhY2ggY2xvc2luZyBhIGRpZmZlcmVudCBob2xlOgoKLSAqKkEgdm91Y2hlciBtdXN0IHF1YWxpZnkuKiogYFZPVUNIX1FVQUxJRllfU0hPV1NgIHNob3dzLCAqYW5kKiBubwpicm9rZW4gdm91Y2ggb2YgdGhlaXIgb3duLiBXaXRob3V0IHRoZSBzZWNvbmQgaGFsZiwgc29tZWJvZHkgY291bGQKd2F2ZSBpbiBzdHJhbmdlcnMgZm9yZXZlciBhdCB0aGUgY29zdCBvZiBhIHJlY29yZCB0aGF0IG5ldmVyIG1vdmVzLgotICoqTm9ib2R5IHZvdWNoZXMgdHdpY2UgZm9yIHRoZSBzYW1lIGd1ZXN0LioqIE90aGVyd2lzZSBvbmUgbWVtYmVyCm1lZXRzIGEgdGhyZXNob2xkIG9mIGZpdmUgb24gdGhlaXIgb3duIGFuZCB0aGUgY291bnQgbWVhbnMgbm90aGluZy4KLSAqKk5vYm9keSB2b3VjaGVzIGZvciB0aGVtc2VsdmVzLioqIFRoZSBzYW1lIGhvbGUsIG9uZSBzdGVwIHNob3J0ZXIuCgpJdCBtb3ZlcyBubyBtb25leSBhbmQgdGFrZXMgbm8gc3BvdC4gVGhlIGd1ZXN0IHN0aWxsIGhhcyB0byBgcnN2cGAsIGFuZAp0aGF0IGlzIHdoZXJlIHRoZSBkZXBvc2l0IGdvZXMg4oCUIGEgdm91Y2ggaXMgcGVybWlzc2lvbiB0byByZXNlcnZlLCBub3QgYQpyZXNlcnZhdGlvbi4AAAAAAAAFdm91Y2gAAAAAAAACAAAAAAAAAAd2b3VjaGVyAAAAABMAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAABQAAAAAAAAAAAAAAC0hvc3RSZW1vdmVkAAAAAAEAAAAMaG9zdF9yZW1vdmVkAAAAAQAAAAAAAAAEaG9zdAAAABMAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADFBoYXNlQ2hhbmdlZAAAAAEAAAANcGhhc2VfY2hhbmdlZAAAAAAAAAEAAAAAAAAABXBoYXNlAAAAAAAH0AAAAAVQaGFzZQAAAAAAAAAAAAAC",
        "AAAAAAAAACNMZXQgYW4gYXBwbGljYW50IHJlc2VydmUuIEFueSBob3N0LgAAAAAHYXBwcm92ZQAAAAACAAAAAAAAAARob3N0AAAAEwAAAAAAAAAJYXBwbGljYW50AAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAACFUdXJuIGFuIGFwcGxpY2FudCBkb3duLiBBbnkgaG9zdC4AAAAAAAAHZGVjbGluZQAAAAACAAAAAAAAAARob3N0AAAAEwAAAAAAAAAJYXBwbGljYW50AAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAIRXaGV0aGVyIGB3aG9gIG1heSBydW4gdGhpcyBldmVudC4gRXZlcnl0aGluZyBob3N0LWdhdGVkIGlzIGJlaGluZCB0aGUKc2FtZSBjaGVjaywgc28gYSBzY3JlZW4gY2FuIGhpZGUgdGhlIGNvbnRyb2xzIGl0IHdvdWxkIHJlZnVzZS4AAAAHaXNfaG9zdAAAAAABAAAAAAAAAAN3aG8AAAAAEwAAAAEAAAPpAAAAAQAAAAM=",
        "AAAAAAAABABTdGFydCBjaGVjay1pbiwgY2xvc2luZyByZXNlcnZhdGlvbnMuIEFueSBob3N0LgpUYWtlIHlvdXIgb3duIGRlcG9zaXQgYmFjayB3aGVuIHRoZSBvcmdhbml6ZXIgbmV2ZXIgc2V0dGxlZC4KCmBvcGVuX2NoZWNraW5gIGFuZCBgZmluYWxpemVgIGJvdGggbmVlZCBhIGhvc3Qgc2lnbmF0dXJlLCBzbyB3aXRob3V0IHRoaXMKdGhlcmUgaXMgKipubyBwYXRoIG91dCBvZiBhIHJlc2VydmVkIGRlcG9zaXQgdGhhdCBhIGd1ZXN0IGNhbiB0YWtlIG9uCnRoZWlyIG93bioqOiBhbiBvcmdhbml6ZXIgd2hvIHdhbGtzIGF3YXkgbGVhdmVzIGV2ZXJ5IGRlcG9zaXQgaW4gdGhpcwpjb250cmFjdCBsb2NrZWQgZm9yZXZlciwgcmVjb3ZlcmFibGUgYnkgbm9ib2R5IOKAlCBub3QgdGhlIGd1ZXN0LCBub3QgdGhlCmFkbWluLCBub3QgdXMuIFRoYXQgaXMgbm90IGEgYnVnLCB3aGljaCBpcyB3aHkgbm8gYXVkaXQgd291bGQgcmVwb3J0IGl0OwppdCBpcyB0aGUgZGVzaWduIHdvcmtpbmcgZXhhY3RseSBhcyB3cml0dGVuLiBPbiBNYWlubmV0IGl0IGlzIHRoZSBvbmUgd2F5ClNob3d1cCBjb3VsZCB0YWtlIHNvbWVib2R5J3MgbW9uZXkgYW5kIGZhaWwgdG8gZ2l2ZSBpdCBiYWNrLgoKVGhyZWUgcHJvcGVydGllcyBtYWtlIHRoaXMgc2FmZSB0byBleHBvc2U6CgotICoqSXQgdG91Y2hlcyBvbmx5IHRoZSBjYWxsZXIncyBvd24gZGVwb3NpdC4qKiBUaGVyZSBpcyBubyBhbW91bnQKYXJndW1lbnQgYW5kIG5vIHJlY2lwaWVudCBhcmd1bWVudCwgc28gaXQgY2FuIG5ldmVyIGJlY29tZSBhIHdheSB0bwplbXB0eSBhbiBldmVudC4KLSAqKkl0IGNhbm5vdCBiZSB1c2VkIGVhcmx5LioqIE5vdCB1bnRpbCBgc3RhcnRzX2F0YCBwbHVzCmBSRUNMQUlNX0dSQUNFX1NFQ09ORFNgLCBieSB3aGljaCBwb2ludCB0aGUgb3JnYW5pemVyIGhhcyBoYWQgdHdvIGRheXMKcGFzdCB0aGVpciBvd24gc3RhcnQgdGltZSB0byBzZXR0bGUuCi0gKipJdCBpcyBub3QgYSB3YXkgdG8gZG9kZ2UgYSBuby1zaG93LioqIEEgcmVjbGFpbSBsZWF2AAAAB3JlY2xhaW0AAAAAAQAAAAAAAAAFZ3Vlc3QAAAAAAAATAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAM9BZGQgc29tZW9uZSB3aG8gY2FuIHJ1biB0aGlzIGV2ZW50IGFsb25nc2lkZSB0aGUgY3JlYXRvci4gQW55IGhvc3QuCgpJZGVtcG90ZW50OiBhZGRpbmcgYW4gZXhpc3RpbmcgaG9zdCBjaGFuZ2VzIG5vdGhpbmcgYW5kIHN1Y2NlZWRzLCBzbyBhCnJldHJpZWQgdHJhbnNhY3Rpb24gbmV2ZXIgdHVybnMgaW50byBhbiBlcnJvciBzb21lYm9keSBoYXMgdG8gcmVhZC4AAAAACGFkZF9ob3N0AAAAAgAAAAAAAAAEaG9zdAAAABMAAAAAAAAACG5ld19ob3N0AAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAPZQcm92ZSBhdHRlbmRhbmNlIHdpdGggdGhlIG9yZ2FuaXplcidzIHNlY3JldCBhbmQgdGFrZSB0aGUgZGVwb3NpdCBiYWNrLgoKVGhpcyBpcyB0aGUgb25seSBwbGFjZSBhIGd1ZXN0IGdldHMgcGFpZCBvbiB0aGUgaGFwcHkgcGF0aCDigJQgdGhlIGRlcG9zaXQKYW5kIHRoZSBmZWUgcmVpbWJ1cnNlbWVudCBsYW5kIGluIHRoZSBzYW1lIGNhbGwsIHNvIHRoZXJlIGlzIG5vdGhpbmcgdG8KY29tZSBiYWNrIGFuZCBjbGFpbSBsYXRlci4AAAAAAAhjaGVja19pbgAAAAIAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAAAAAAGc2VjcmV0AAAAAAAOAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAADxDbG9zZSB0aGUgZXZlbnQgYW5kIHNldHRsZSB0aGUgbm8tc2hvd3MnIGRlcG9zaXRzLiBBbnkgaG9zdC4AAAAIZmluYWxpemUAAAABAAAAAAAAAARob3N0AAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAJZ2V0X3BoYXNlAAAAAAAAAAAAAAEAAAfQAAAABVBoYXNlAAAA",
        "AAAAAAAAAYNUaGUgYWRtaXNzaW9uIG1vZGUgYW5kIHRoZSBob3N0IGxpc3QsIGluIG9uZSByZWFkLgoKT25lIGNhbGwgcmF0aGVyIHRoYW4gdHdvIGdldHRlcnMgYmVjYXVzZSBhIHBhZ2UgbmVlZHMgYm90aCBhbmQgZXZlcnkKZXh0cmEgUlBDIHJlYWQgaXMgbGF0ZW5jeSBpbiBmcm9udCBvZiBzb21lYm9keSBkZWNpZGluZyB3aGV0aGVyIHRvIGxvY2sKYSBkZXBvc2l0LiBBYnNlbnQgb24gZXZlbnRzIGRlcGxveWVkIGJlZm9yZSB0aGlzIHJldmlzaW9uIOKAlCBhIGNhbGxlcgp0aGF0IGdldHMgImZ1bmN0aW9uIG5vdCBmb3VuZCIgYmFjayBpcyBsb29raW5nIGF0IGFuIG9wZW4gZXZlbnQgd2l0aCBvbmUKaG9zdCwgYW5kIGNhbiBzYXkgc28gd2l0aG91dCBhc2tpbmcgYW55dGhpbmcgZWxzZS4AAAAACWdldF90ZXJtcwAAAAAAAAAAAAABAAAD6QAAB9AAAAAFVGVybXMAAAAAAAAD",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPpAAAH0AAAAAZDb25maWcAAAAAAAM=",
        "AAAAAAAAARdDcmVhdGUgdGhlIGV2ZW50IGFuZCBmdW5kIHRoZSBmZWUtcmVpbWJ1cnNlbWVudCBwb29sLgoKVGhlIG9yZ2FuaXplciB0cmFuc2ZlcnMgYGZlZV9hbGxvd2FuY2UgKiBjYXBhY2l0eWAgaW4sIHNvIGV2ZXJ5IGd1ZXN0IHdobwpzaG93cyB1cCBjYW4gYmUgbWFkZSB3aG9sZSBmb3IgdGhlIGZlZXMgdGhleSBzcGVuZC4gV2hhdGV2ZXIgaXMgbGVmdCBvdmVyCih0aGUgbm8tc2hvd3MgbmV2ZXIgY29zdCBhbnl0aGluZykgZ29lcyBiYWNrIHRvIHRoZSBvcmdhbml6ZXIgb24KYGZpbmFsaXplYC4AAAAACmluaXRpYWxpemUAAAAAAAsAAAAAAAAACW9yZ2FuaXplcgAAAAAAABMAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAJc3RhcnRzX2F0AAAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAdkZXBvc2l0AAAAAAsAAAAAAAAADWZlZV9hbGxvd2FuY2UAAAAAAAALAAAAAAAAAAhjYXBhY2l0eQAAAAQAAAAAAAAACWNvZGVfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAZwb2xpY3kAAAAAB9AAAAANRm9yZmVpdFBvbGljeQAAAAAAAAAAAAAKcmVwdXRhdGlvbgAAAAAD6AAAABMAAAAAAAAACWFkbWlzc2lvbgAAAAAAB9AAAAAJQWRtaXNzaW9uAAAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAABQAAAKxQdWJsaXNoZWQgd2hlbiBhIGd1ZXN0IGV4aXRzIGEgZGVwb3NpdCB0aGUgb3JnYW5pemVyIG5ldmVyIHNldHRsZWQuCgpXb3J0aCB3YXRjaGluZyBvbiBpdHMgb3duOiBldmVyeSBvbmUgb2YgdGhlc2UgaXMgYW4gZXZlbnQgc29tZWJvZHkgdG9vawptb25leSBmb3IgYW5kIHdhbGtlZCBhd2F5IGZyb20uAAAAAAAAABBEZXBvc2l0UmVjbGFpbWVkAAAAAQAAABFkZXBvc2l0X3JlY2xhaW1lZAAAAAAAAAIAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAAAAAA0VGhlIGRlcG9zaXQsIGFuZCBvbmx5IHRoZSBkZXBvc2l0IOKAlCBzZWUgYHJlY2xhaW1gLgAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAAAAAAADhIb3cgbWFueSBtZW1iZXJzIGhhdmUgdm91Y2hlZCBmb3IgYGd1ZXN0YCBhdCB0aGlzIGV2ZW50LgAAAAtnZXRfdm91Y2hlcwAAAAABAAAAAAAAAAVndWVzdAAAAAAAABMAAAABAAAABA==",
        "AAAAAAAAAZdUYWtlIHNvbWVvbmUncyBob3N0aW5nIHJpZ2h0cyBhd2F5LiBBbnkgaG9zdCwgZXhjZXB0IHRoZSBjcmVhdG9yJ3MuCgpBbnkgaG9zdCBtYXkgcmVtb3ZlIGFueSBvdGhlciwgd2hpY2ggbWVhbnMgY28taG9zdHMgY2FuIHJlbW92ZSBlYWNoCm90aGVyIOKAlCBkZWxpYmVyYXRlbHkuIFRoZSBjcmVhdG9yIGlzIHBlcm1hbmVudCwgc28gdGhlIHdvcnN0IGNhc2UgaXMgYQptZXNzIG9ubHkgdGhleSBjYW4gYmUgYXNrZWQgdG8gY2xlYW4gdXAsIGFuZCB0aGUgYWx0ZXJuYXRpdmUgKG9ubHkgdGhlCmNyZWF0b3IgbWF5IHJlbW92ZSkgbGVhdmVzIGFuIGV2ZW50IHN0dWNrIHRoZSBtb21lbnQgdGhleSBhcmUKdW5yZWFjaGFibGUsIHdoaWNoIGlzIHRoZSBleGFjdCBzaXR1YXRpb24gY28taG9zdGluZyBleGlzdHMgZm9yLgAAAAALcmVtb3ZlX2hvc3QAAAAAAgAAAAAAAAAEaG9zdAAAABMAAAAAAAAABnRhcmdldAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAKhHbyBiYWNrIHRvIHRha2luZyByZXNlcnZhdGlvbnMsIGUuZy4gdG8gbGV0IGEgbGF0ZWNvbWVyIGluLiBBbnkgaG9zdC4KCkd1ZXN0cyB3aG8gYWxyZWFkeSBjaGVja2VkIGluIGtlZXAgdGhlaXIgcmVmdW5kIGFuZCBzdGF5IG9uIHRoZSBsaXN0OyB0aGlzCm9ubHkgcmVvcGVucyB0aGUgZG9vci4AAAALcmVvcGVuX3JzdnAAAAAAAQAAAAAAAAAEaG9zdAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAABQAAAUZQdWJsaXNoZWQgd2hlbiBhIHdyaXRlIHRvIHRoZSByZXB1dGF0aW9uIGxlZGdlciBmYWlsZWQgYW5kIHdhcyBzd2FsbG93ZWQuCgpTd2FsbG93aW5nIGl0IGlzIGRlbGliZXJhdGUg4oCUIHNlZSBgcmVjb3JkX3Njb3JlYCDigJQgYnV0IHN3YWxsb3dpbmcgaXQKKnNpbGVudGx5KiB3b3VsZCBtZWFuIGEgbGVkZ2VyIGNvdWxkIHF1aWV0bHkgc3RvcCByZWNvcmRpbmcgYW5kIG5vYm9keSB3b3VsZApmaW5kIG91dCB1bnRpbCBzb21lb25lIGNvbXBhcmVkIHR3byBzZXRzIG9mIG51bWJlcnMuIFRoaXMgbWFrZXMgZXZlcnkKZHJvcHBlZCB3cml0ZSB2aXNpYmxlIG9uLWNoYWluLgAAAAAAAAAAABFSZXB1dGF0aW9uU2tpcHBlZAAAAAAAAAEAAAAScmVwdXRhdGlvbl9za2lwcGVkAAAAAAACAAAAAAAAAAZtZW1iZXIAAAAAABMAAAAAAAAAAAAAAARraW5kAAAH0AAAAAlTY29yZUtpbmQAAAAAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAMZ2V0X3Jlc2VydmVkAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAAMaXNfZmluYWxpemVkAAAAAAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAMb3Blbl9jaGVja2luAAAAAQAAAAAAAAAEaG9zdAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAENFdmVyeW9uZSB3aG8gdG9vayB0aGVpciBvd24gZGVwb3NpdCBiYWNrLiBFbXB0eSBvbiBhIGhlYWx0aHkgZXZlbnQuAAAAAA1nZXRfcmVjbGFpbWVkAAAAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAABQAAAN5PbmUgZXZlbnQgZm9yIGJvdGggYW5zd2VycywgYmVjYXVzZSB0aGUgaW50ZXJlc3RpbmcgdGhpbmcgdG8gd2F0Y2ggaXMgdGhhdAphbiBhcHBsaWNhdGlvbiB3YXMgYW5zd2VyZWQgYXQgYWxsIOKAlCBhbiBvcmdhbml6ZXIgd2hvIGFwcHJvdmVzIGV2ZXJ5Ym9keSBhbmQKb25lIHdobyBpcyBhY3R1YWxseSBjaG9vc2luZyBsb29rIGlkZW50aWNhbCB1bnRpbCB5b3UgcmVhZCB0aGUgZmxhZy4AAAAAAAAAAAATQXBwbGljYXRpb25BbnN3ZXJlZAAAAAABAAAAFGFwcGxpY2F0aW9uX2Fuc3dlcmVkAAAAAgAAAAAAAAAJYXBwbGljYW50AAAAAAAAEwAAAAAAAAAAAAAACGFwcHJvdmVkAAAAAQAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAE0FwcGxpY2F0aW9uUmVjZWl2ZWQAAAAAAQAAABRhcHBsaWNhdGlvbl9yZWNlaXZlZAAAAAEAAAAAAAAACWFwcGxpY2FudAAAAAAAABMAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAOZ2V0X2F0dGVuZGFuY2UAAAAAAAEAAAAAAAAABWd1ZXN0AAAAAAAAEwAAAAEAAAPoAAAH0AAAAApBdHRlbmRhbmNlAAA=",
        "AAAAAAAAAAAAAAAOZ2V0X2NoZWNrZWRfaW4AAAAAAAAAAAABAAAD6gAAABM=",
        "AAAAAQAAAatBIG1lbWJlcidzIGF0dGVuZGFuY2UgcmVjb3JkLCBhcyB0aGUgZXZlbnQgY29udHJhY3QgcmVhZHMgaXQuCgpNaXJyb3JzIHRoZSByZXB1dGF0aW9uIGNvbnRyYWN0J3Mgb3duIGBTY29yZWAgZmllbGQgZm9yIGZpZWxkLiBJdCBpcyBjb3BpZWQKcmF0aGVyIHRoYW4gc2hhcmVkIGJlY2F1c2UgdGhhdCBjb250cmFjdCBkZWxpYmVyYXRlbHkgZG9lcyBub3QgbGluayB0aGlzCmNyYXRlIOKAlCBkb2luZyBzbyB3b3VsZCBwdWJsaXNoIGEgYEZvcmZlaXRQb2xpY3lgIHR5cGUgb24gYSByZXB1dGF0aW9uCmxlZGdlcidzIHNwZWMg4oCUIGFuZCBhIGAjW2NvbnRyYWN0dHlwZV1gIHN0cnVjdCBlbmNvZGVzIGFzIGEgbWFwIGtleWVkIGJ5CmZpZWxkIG5hbWUsIHNvIHR3byBpZGVudGljYWwgZGVjbGFyYXRpb25zIGRlY29kZSBlYWNoIG90aGVyIGV4YWN0bHkuAAAAAAAAAAAFU2NvcmUAAAAAAAACAAAAAAAAAAhub19zaG93cwAAAAQAAAAAAAAABXNob3dzAAAAAAAABA==",
        "AAAAAQAAAWlXaGF0IGFuIGV2ZW50IG5lZWRzIHRvIGtub3cgYWJvdXQgYSB3b3VsZC1iZSB2b3VjaGVyLgoKTWlycm9ycyB0aGUgcmVwdXRhdGlvbiBsZWRnZXIncyBgUmVjb3JkYCBmaWVsZCBmb3IgZmllbGQsIGFuZCBjb3BpZWQgcmF0aGVyCnRoYW4gc2hhcmVkIGZvciB0aGUgc2FtZSByZWFzb24gYXMgYFNjb3JlYCDigJQgc2VlIGJlbG93LiBPbmx5IHRoZSBmaWVsZHMgYQpnYXRlIHJlYWRzIGFyZSBoZXJlOiBgZXZlbnRzX29yZ2FuaXNlZGAgaXMgYSBwcm9maWxlLXBhZ2UgbnVtYmVyIGFuZCBwdXR0aW5nCml0IG9uIHRoaXMgdHJhaXQgd291bGQgcHVibGlzaCBpdCBpbnRvIHRoZSBldmVudCBjb250cmFjdCdzIHNwZWMgZm9yIG5vdGhpbmcuAAAAAAAAAAAAAAZSZWNvcmQAAAAAAAYAAAJ3RXZlbnRzIHRoZXkgY3JlYXRlZCwgdG9vayBkZXBvc2l0cyBmb3IsIGFuZCBuZXZlciBzZXR0bGVkLgoKKipNdXN0IHN0YXkgZmllbGQtZm9yLWZpZWxkIHdpdGggdGhlIHJlcHV0YXRpb24gY29udHJhY3QncyBvd24gYFJlY29yZGAuKioKVGhlIHR3byBhcmUgc2VwYXJhdGUgZGVjbGFyYXRpb25zIG9uIHB1cnBvc2UgKHNlZSBiZWxvdyksIGFuZCBhCmAjW2NvbnRyYWN0dHlwZV1gIHN0cnVjdCBpcyBkZWNvZGVkIGJ5IHVucGFja2luZyBhIGhvc3QgbWFwIGludG8gYSBzbGljZQpvZiBleGFjdGx5IHRoZSBkZWNsYXJlZCBsZW5ndGgg4oCUIHNvIGEgZmllbGQgYWRkZWQgb24gb25lIHNpZGUgYW5kIG5vdCB0aGUKb3RoZXIgZG9lcyBub3QgZGVncmFkZSwgaXQgZmFpbHMgdGhlIHJlYWQgb3V0cmlnaHQgd2l0aCAiZGlmZmVyaW5nIGhvc3QKbWFwIGFuZCBvdXRwdXQgc2xpY2UgbGVuZ3RocyIuIFRoYXQgaXMgd2hhdCBoYXBwZW5lZCB3aGVuIHRoaXMgZmllbGQgd2FzCmFkZGVkIHRvIHRoZSBsZWRnZXIgYW5kIG5vdCB0byBoZXJlOiBldmVyeSBgdm91Y2hgIG9uIHRoZSBldmVudCBjb250cmFjdApzdG9wcGVkIHdvcmtpbmcsIGJlY2F1c2UgdGhlIGdhdGUgcmVhZHMgYSByZWNvcmQgYmVmb3JlIGl0IG9wZW5zLgAAAAAQZXZlbnRzX2FiYW5kb25lZAAAAAQAAAAAAAAAEGV2ZW50c19vcmdhbmlzZWQAAAAEAAAAAAAAAAhub19zaG93cwAAAAQAAAAAAAAABXNob3dzAAAAAAAABAAAAAAAAAAOdm91Y2hlc19icm9rZW4AAAAAAAQAAAAAAAAADXZvdWNoZXNfZ2l2ZW4AAAAAAAAE",
        "AAAAAgAAAN1XaG8gaXMgYWxsb3dlZCB0byByZXNlcnZlIGEgc3BvdC4KCkZpeGVkIGF0IGNyZWF0aW9uIGFuZCBlbmZvcmNlZCBpbnNpZGUgdGhlIGV2ZW50IGNvbnRyYWN0IHJhdGhlciB0aGFuIGJ5IGEKc2NyZWVuLCBiZWNhdXNlIGEgZ2F0ZSBhIGZyb250ZW5kIGFwcGxpZXMgaXMgYSBzdWdnZXN0aW9uOiBhbnlvbmUgY2FuIGNhbGwKYHJzdnBgIGRpcmVjdGx5IGFnYWluc3QgdGhlIGNvbnRyYWN0LgAAAAAAAAAAAAAJQWRtaXNzaW9uAAAAAAAABAAAAAAAAABEQW55b25lLCBmaXJzdCBjb21lIGZpcnN0IHNlcnZlZC4gV2hhdCBldmVyeSBldmVudCBjcmVhdGVkIHNvIGZhciBpcy4AAAAET3BlbgAAAAEAAABCQW55b25lIHdob3NlIHJlcHV0YXRpb24gcmVjb3JkIHNob3dzIGF0IGxlYXN0IHRoaXMgbWFueSBjaGVjay1pbnMuAAAAAAAFU2NvcmUAAAAAAAABAAAABAAAAAAAAAAwQW55b25lIHRoZSBvcmdhbml6ZXIgc2F5cyB5ZXMgdG8sIG9uZSBhdCBhIHRpbWUuAAAACEFwcHJvdmFsAAAAAQAAAENBbnlvbmUgdm91Y2hlZCBmb3IgYnkgdGhpcyBtYW55IG1lbWJlcnMgd2l0aCBhIHJlY29yZCBvZiB0aGVpciBvd24uAAAAAAVWb3VjaAAAAAAAAAEAAAAE",
        "AAAAAgAAAD1XaGVyZSB0aGUgZGVwb3NpdHMgb2Ygbm8tc2hvd3MgZ28gd2hlbiBhbiBldmVudCBpcyBmaW5hbGl6ZWQuAAAAAAAAAAAAAA1Gb3JmZWl0UG9saWN5AAAAAAAAAgAAAAAAAAAaU3RyYWlnaHQgdG8gdGhlIG9yZ2FuaXplci4AAAAAAAtUb09yZ2FuaXplcgAAAAAAAAAAK1NwbGl0IGV2ZW5seSBhbW9uZyBldmVyeW9uZSB3aG8gY2hlY2tlZCBpbi4AAAAAE1NwbGl0QW1vbmdBdHRlbmRlZXMA" ]),
      options
    )
  }
  public readonly fromJSON = {
    rsvp: this.txFromJSON<Result<void>>,
        apply: this.txFromJSON<Result<void>>,
        vouch: this.txFromJSON<Result<void>>,
        approve: this.txFromJSON<Result<void>>,
        decline: this.txFromJSON<Result<void>>,
        is_host: this.txFromJSON<Result<boolean>>,
        reclaim: this.txFromJSON<Result<void>>,
        add_host: this.txFromJSON<Result<void>>,
        check_in: this.txFromJSON<Result<void>>,
        finalize: this.txFromJSON<Result<void>>,
        get_phase: this.txFromJSON<Phase>,
        get_terms: this.txFromJSON<Result<Terms>>,
        get_config: this.txFromJSON<Result<Config>>,
        initialize: this.txFromJSON<Result<void>>,
        get_vouches: this.txFromJSON<u32>,
        remove_host: this.txFromJSON<Result<void>>,
        reopen_rsvp: this.txFromJSON<Result<void>>,
        get_reserved: this.txFromJSON<Array<string>>,
        is_finalized: this.txFromJSON<boolean>,
        open_checkin: this.txFromJSON<Result<void>>,
        get_reclaimed: this.txFromJSON<Array<string>>,
        get_attendance: this.txFromJSON<Option<Attendance>>,
        get_checked_in: this.txFromJSON<Array<string>>
  }
}