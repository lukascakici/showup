"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarClock,
  CheckCircle2,
  DoorOpen,
  ExternalLink,
  Flag,
  Globe,
  Info,
  Link2,
  Lock,
  Send,
  TriangleAlert,
  Undo2,
  Wallet,
} from "lucide-react";
import {
  event as eventClient,
  friendlyContractError,
  fromStroops,
  secretToBuffer,
} from "@/lib/contracts";
import { EXPLORER_CONTRACT, EXPLORER_TX } from "@/lib/stellar";
import { useSigner } from "@/lib/signer";
import { useWallet } from "@/lib/wallet";
import { recallSecret, rememberSecret } from "@/lib/secrets";
import { requestSync } from "@/lib/event-index";
import {
  attendanceOf,
  forfeitPool,
  isKnownEvent,
  spotsLeft,
  useActivity,
  useEvent,
  type EventState,
} from "@/lib/events";
import {
  BASE_RESERVE_STROOPS,
  FEE_HEADROOM_STROOPS,
  blocksReservation,
  fundingFor,
  type Funding,
} from "@/lib/funding";
import { shortAddr } from "@/lib/format";
import { checkInUrl, inviteUrl } from "@/lib/links";
import {
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  Input,
  Panel,
  SectionLabel,
  Skeleton,
} from "./ui";
import { ActivityFeed } from "./ActivityFeed";
import { CopyLink } from "./CopyLink";
import { EventPoster } from "./EventPoster";
import { FaucetButton } from "./Faucet";
import { AvatarStack } from "./Identicon";
import { QrCode } from "./QrCode";

type Action = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string };

export function EventDetail({ id, linkSecret }: { id: string; linkSecret: string | null }) {
  const { address, status, balance, openPicker, refreshBalance } = useWallet();
  const signer = useSigner();
  const { data: event, error, loading, refreshing, refresh } = useEvent(id);
  const {
    data: activityResult,
    error: activityError,
    loading: activityLoading,
    refresh: refreshActivity,
  } = useActivity(id);
  // null while unasked or unanswerable; only `false` is a confirmed "no such event".
  const [known, setKnown] = useState<boolean | null>(null);
  const [action, setAction] = useState<Action>({ kind: "idle" });
  // A guest arriving through the organizer's link shouldn't have to type
  // anything — the secret is already in the URL. Derive rather than seed state,
  // so a link opened after mount still fills the field.
  const [typedCode, setTypedCode] = useState<string | null>(null);
  const code = typedCode ?? linkSecret ?? "";
  const setCode = setTypedCode;

  // Asked once, and only after a read has already failed — the answer costs an
  // RPC call and is worthless while the event is loading fine.
  useEffect(() => {
    if (event || !error) return;
    let live = true;
    isKnownEvent(id)
      .then((answer) => live && setKnown(answer))
      .catch(() => live && setKnown(null));
    return () => {
      live = false;
    };
  }, [event, error, id]);

  /**
   * Archive this event's history while the chain still has it.
   *
   * Soroban RPC drops ledgers after about a week, and the transaction hashes in
   * the feed only exist in contract events — so an event nobody syncs inside
   * that window loses its history permanently, while its state sits there
   * looking complete. Asking on every page view is the cheapest possible
   * guarantee: it costs one request against an endpoint that stops sweeping
   * deeply once the archive reaches the event's creation, and it means an event
   * anyone still visits can never fall off the back.
   */
  useEffect(() => {
    void requestSync(id);
  }, [id]);

  // The balance is otherwise fetched only on connect and on a manual click, so
  // every action on this page — all of which move XLM — left the number in the
  // top bar quietly wrong until someone thought to refresh it.
  const after = useCallback(async () => {
    await Promise.all([refresh(), refreshActivity(), refreshBalance()]);
    // Something just happened on chain, so the archive is one row behind. Not
    // awaited: the sync re-reads everything from the contract itself, so it can
    // arrive whenever it arrives.
    void requestSync(id);
    setAction({ kind: "idle" });
  }, [id, refresh, refreshActivity, refreshBalance]);

  const run = async (fn: () => Promise<unknown>) => {
    setAction({ kind: "busy" });
    try {
      await fn();
      await after();
    } catch (err) {
      setAction({ kind: "error", message: friendlyContractError(err) });
    }
  };

  if (loading && !event) {
    return (
      <Card>
        <div className="flex flex-col gap-3" role="status" aria-label="Loading event">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Card>
    );
  }
  if (!event) {
    return (
      <Card>
        {/* Only `false` — a confirmed answer from the factory — is allowed to
            say the event doesn't exist. Both "we haven't asked yet" and "we
            couldn't ask" fall through to the recoverable message, because
            `loadEvent` fans four RPC reads out at once and a single dropped one
            looks exactly like an address that was never deployed to. */}
        {known === false ? (
          <>
            <h2 className="font-display text-lg font-bold tracking-tight">No event here</h2>
            <p className="mt-1 text-sm text-muted">
              This factory has never deployed an event at this address. Check the link —
              it may have been cut short, or point at a different network.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-lg font-bold tracking-tight">
              Couldn&apos;t load this event
            </h2>
            <p className="mt-1 text-sm text-muted">
              The chain didn&apos;t answer just now. Nothing has happened to the event or
              to any deposit in it — this is a failed read, and it usually passes.
            </p>
            {error && <p className="mt-2 font-mono text-xs text-muted-2">{error}</p>}
            <Button
              variant="secondary"
              onClick={() => void refresh()}
              loading={refreshing}
              className="mt-4"
            >
              Try again
            </Button>
          </>
        )}
      </Card>
    );
  }

  // A host, not only the creator: the contract gates these controls on host
  // membership now, so showing them to the creator alone would hide a button the
  // chain would have accepted.
  const isHost = !!address && event.hosts.includes(address);
  const mine = attendanceOf(event, address);
  const left = spotsLeft(event);
  const refund = event.deposit + event.feeAllowance;
  const funding = fundingFor(balance, event.deposit);
  const reserving = event.phase === "Reserving";
  const checkingIn = event.phase === "CheckingIn";
  const finalized = event.phase === "Finalized";
  const splits = event.policy.tag === "SplitAmongAttendees";

  const rsvp = () =>
    run(async () => {
      const tx = await eventClient(id, signer).rsvp({ guest: signer.publicKey! });
      await tx.signAndSend();
    });

  const checkIn = () =>
    run(async () => {
      const tx = await eventClient(id, signer).check_in({
        guest: signer.publicKey!,
        secret: secretToBuffer(code.trim()),
      });
      await tx.signAndSend();
      if (isHost) rememberSecret(id, code.trim());
    });

  const finalize = () =>
    run(async () => {
      const tx = await eventClient(id, signer).finalize({ host: signer.publicKey! });
      await tx.signAndSend();
    });

  const openCheckin = () =>
    run(async () => {
      const tx = await eventClient(id, signer).open_checkin({ host: signer.publicKey! });
      await tx.signAndSend();
    });

  const reopenRsvp = () =>
    run(async () => {
      const tx = await eventClient(id, signer).reopen_rsvp({ host: signer.publicKey! });
      await tx.signAndSend();
    });

  const busy = action.kind === "busy";

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[340px_1fr] lg:gap-12">
      {/* ---------------------------------------------------------------- */}
      {/* Identity: who is running this, and who has already committed.     */}
      {/* ---------------------------------------------------------------- */}
      <aside className="lg:sticky lg:top-24">
        <EventPoster
          id={id}
          title={event.title}
          startsAt={event.startsAt}
          size="lg"
          className="mb-6"
        />

        <div className="text-[12.5px] text-muted-2">Organizer</div>
        <div className="mt-2 flex items-center gap-3 border-b border-border pb-5">
          <span
            aria-hidden
            className="size-8 shrink-0 rounded-[9px] bg-[linear-gradient(140deg,#8E9098,#CDCFD6)]"
          />
          <span className="min-w-0 flex-1 truncate font-mono text-sm">
            {shortAddr(event.organizer, 6, 6)}
          </span>
          {isHost && <Chip tone="accent">You</Chip>}
        </div>

        {/* An event can be run by more than one wallet now. The extra hosts are
            only worth naming when there are any — on the common event this row
            never renders. */}
        {event.hosts.length > 1 && (
          <div className="border-b border-border py-5">
            <div className="mb-3 text-[12.5px] text-muted-2">
              Also hosted by {event.hosts.length - 1}{" "}
              {event.hosts.length === 2 ? "other wallet" : "other wallets"}
            </div>
            <AvatarStack addresses={event.hosts.filter((h) => h !== event.organizer)} />
          </div>
        )}

        <div className="border-b border-border py-5">
          <div className="mb-3 text-[12.5px] text-muted-2">
            {event.reserved.length} reserved · {event.checkedIn.length} showed up
          </div>
          {event.reserved.length > 0 ? (
            <AvatarStack addresses={event.reserved} />
          ) : (
            <p className="text-[13px] text-muted-3">Nobody has taken a spot yet.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5 pt-[18px]">
          <Chip pill>Stellar Testnet</Chip>
          <Chip pill>{splits ? "Split among attendees" : "Forfeits to organizer"}</Chip>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* The event itself, and the one thing you can do about it.          */}
      {/* ---------------------------------------------------------------- */}
      <div className="min-w-0">
        <h1 className="font-display text-[34px] font-bold leading-[1.06] tracking-[-0.03em] text-balance sm:text-[44px]">
          {event.title || (
            <span className="font-mono text-2xl">{shortAddr(id, 8, 8)}</span>
          )}
        </h1>

        <div className="mt-6 flex flex-col gap-4">
          <WhenTile startsAt={event.startsAt} />
          <WhereTile id={id} />
        </div>

        <div className="mt-8">
          <Panel title="Reservation and deposit" meta="Stellar · Soroban">
            {/* A returning visitor is already connected — we just don't know it
                for the moment the kit takes to say so, and swapping a whole
                "connect first" block out afterwards is worse than a placeholder. */}
            {status === "restoring" ? (
              <div
                className="flex flex-col gap-3"
                role="status"
                aria-label="Checking your wallet"
              >
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="mt-1 h-14 w-full" />
              </div>
            ) : !address ? (
              // The explainer promises three steps starting with "reserve", so it
              // is only true while reserving is possible. Otherwise the reason to
              // connect is a different one, and saying the wrong one is worse than
              // the single line it replaced.
              reserving && left > 0 ? (
                <ColdStart
                  deposit={event.deposit}
                  refund={refund}
                  feeAllowance={event.feeAllowance}
                  onConnect={openPicker}
                  connecting={status === "connecting"}
                />
              ) : (
                <div>
                  <p className="text-sm text-muted">
                    {finalized
                      ? "This event is closed and every deposit has been settled. Connect your wallet to see how yours ended up."
                      : checkingIn
                        ? `Check-in is open. Connect the wallet you reserved with to take your ${fromStroops(refund)} XLM back.`
                        : "This event is full, so no new spots can be taken. Connect your wallet if you already reserved one."}
                  </p>
                  <Button
                    onClick={openPicker}
                    size="lg"
                    fullWidth
                    className="mt-4"
                    loading={status === "connecting"}
                  >
                    <Wallet className="size-4" />
                    Connect wallet
                  </Button>
                </div>
              )
            ) : mine === "checked-in" ? (
              <Settled
                deposit={event.deposit}
                refund={refund}
                splits={splits}
                finalized={finalized}
              />
            ) : reserving && mine === "none" ? (
              <Offer
                deposit={event.deposit}
                refund={refund}
                feeAllowance={event.feeAllowance}
                funding={funding}
                left={left}
                busy={busy}
                onReserve={rsvp}
              />
            ) : reserving && mine === "reserved" ? (
              <Holding deposit={event.deposit} refund={refund} left={left} />
            ) : checkingIn && mine === "reserved" ? (
              <CheckIn
                refund={refund}
                code={code}
                setCode={setCode}
                busy={busy}
                onCheckIn={checkIn}
              />
            ) : checkingIn ? (
              <p className="text-sm text-muted">
                The organizer has started check-in, so no new spots can be taken. This
                is what stops someone who was sent the link from joining on the spot
                and taking a cut of the no-shows&apos; deposits.
              </p>
            ) : (
              <p className="text-sm text-muted">
                This event is closed. {event.checkedIn.length} showed up,{" "}
                {event.reserved.length - event.checkedIn.length} didn&apos;t, and every
                deposit has been settled.
              </p>
            )}
          </Panel>
        </div>

        {action.kind === "error" && (
          <div className="mt-4">
            <ErrorNote>{action.message}</ErrorNote>
          </div>
        )}

        {isHost && (
          <div className="mt-8">
            <OrganizerPanel
              id={id}
              phase={event.phase}
              checkedIn={event.checkedIn.length}
              noShows={event.reserved.length - event.checkedIn.length}
              pool={forfeitPool(event)}
              busy={busy}
              onFinalize={finalize}
              onOpenCheckin={openCheckin}
              onReopenRsvp={reopenRsvp}
            />
          </div>
        )}

        <div className="mt-9">
          <SectionLabel className="border-b border-border pb-3">
            ABOUT THIS EVENT
          </SectionLabel>
          <p className="mt-5 text-[15.5px] leading-[1.65] text-foreground-2 text-pretty">
            Every spot here is backed by {fromStroops(event.deposit)} XLM held in this
            event&apos;s own contract on Stellar Testnet — not by the organizer, and not
            by us. Check in at the door and it comes straight back.
          </p>
          <div className="mt-4 grid gap-2.5 text-[15px] text-foreground-2">
            <Line>
              {event.capacity} spots, {left > 0 ? `${left} still open` : "all taken"}
            </Line>
            <Line>
              {fromStroops(refund)} XLM back on check-in — your deposit plus{" "}
              {fromStroops(event.feeAllowance)} XLM the organizer put up for your fees
            </Line>
            <Line>
              {splits
                ? "No-shows' deposits are split between everyone who turned up"
                : "No-shows' deposits go to the organizer on finalize"}
            </Line>
          </div>

          <div className="mt-7 flex items-start gap-4 rounded-[14px] border border-border-strong bg-surface-2 px-5 py-4.5">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-lift" />
            <p className="text-sm leading-[1.6] text-[#9a9ba1]">
              Reserving locks real Testnet XLM. If you don&apos;t check in,{" "}
              {splits
                ? "your deposit stays in the pool and is shared out among the people who did"
                : "your deposit goes to the organizer"}{" "}
              when the event is finalized. There is no cancel — the only way back is to
              turn up.
            </p>
          </div>
        </div>

        <div className="mt-9">
          <ActivityFeed
            activity={activityResult?.activity ?? []}
            loading={activityLoading}
            error={activityError}
            truncated={activityResult?.truncated ?? false}
            onRetry={() => void refreshActivity()}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Where and when                                                             */
/* -------------------------------------------------------------------------- */

function WhenTile({ startsAt }: { startsAt: number }) {
  if (!startsAt) {
    return (
      <Tile icon={<CalendarClock className="size-5" />}>
        <div className="text-base font-medium">No date set</div>
        <div className="mt-0.5 text-sm text-muted">
          Created before events carried a start time.
        </div>
      </Tile>
    );
  }

  const d = new Date(startsAt * 1000);
  const month = d.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  const day = d.getDate();

  return (
    <div className="flex items-center gap-4">
      <div className="w-12 shrink-0 overflow-hidden rounded-[10px] border border-border-strong bg-surface text-center">
        <div className="bg-surface-3 py-[3px] text-[10px] tracking-[0.1em] text-muted">
          {month}
        </div>
        <div className="py-[5px] font-display text-[19px]">{day}</div>
      </div>
      <div className="min-w-0">
        <div className="text-base font-medium">
          {d.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
        <div className="mt-0.5 text-sm text-muted">
          {d.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}{" "}
          your time
        </div>
      </div>
    </div>
  );
}

/** The chain is the venue. It is the only address this event actually has. */
function WhereTile({ id }: { id: string }) {
  return (
    <Tile icon={<Globe className="size-5" />}>
      <div className="text-base font-medium">Stellar Testnet</div>
      {/* This is the link a reviewer taps to open the event on Stellar Expert,
          and it was 20px tall. Nothing else sits in this row, so the hit area
          can grow without landing on top of anything. */}
      <a
        href={EXPLORER_CONTRACT(id)}
        target="_blank"
        rel="noreferrer"
        title={id}
        className="-my-2 inline-flex items-center gap-1 py-2 font-mono text-sm text-muted transition-colors hover:text-accent-soft"
      >
        {shortAddr(id, 8, 8)}
        <ExternalLink className="size-3.5" />
      </a>
    </Tile>
  );
}

function Tile({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <div
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-border-strong bg-surface text-muted"
      >
        {icon}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span aria-hidden className="text-accent">
        —
      </span>
      <span>{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Arriving with nothing                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The first thing a stranger sees.
 *
 * Everyone arriving from a link in a group chat has no wallet, no Testnet
 * account, no XLM and no reason to believe that "put down a deposit" means
 * anything other than losing money. So: what happens, in order; that the money
 * isn't real; and the button.
 */
function ColdStart({
  deposit,
  refund,
  feeAllowance,
  onConnect,
  connecting,
}: {
  deposit: bigint;
  refund: bigint;
  feeAllowance: bigint;
  onConnect: () => void;
  connecting: boolean;
}) {
  const steps = [
    `Reserve. ${fromStroops(deposit)} XLM leaves your wallet and is locked in this event's own contract. Nobody can take it — not the organizer, not us.`,
    "Show up. The organizer opens check-in and shares a code or a link at the event.",
    `Check in. You get ${fromStroops(refund)} XLM back: your deposit plus ${fromStroops(feeAllowance)} XLM the organizer put up so attending costs you nothing.`,
  ];

  return (
    <div>
      <div className="text-[12.5px] text-muted-2">How this works</div>
      <ol className="mt-3.5 flex flex-col gap-3.5">
        {steps.map((text, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface font-mono text-[11px] tabular-nums text-accent-lift">
              {i + 1}
            </span>
            <span className="text-sm leading-[1.55] text-muted">{text}</span>
          </li>
        ))}
      </ol>

      {/* The single most reassuring fact available, and it was nowhere on this
          page: none of this is real money. */}
      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3.5">
        <Info className="mt-0.5 size-4 shrink-0 text-accent-lift" />
        <p className="text-xs leading-[1.55] text-muted">
          Showup runs on <strong className="text-foreground">Stellar Testnet</strong>. The
          XLM here is test money — it can&apos;t be bought, sold or spent anywhere, and
          the faucet hands out as much as you need for free. Don&apos;t flake anyway.
        </p>
      </div>

      <Button onClick={onConnect} size="lg" fullWidth className="mt-5" loading={connecting}>
        <Wallet className="size-4" />
        Connect a wallet
      </Button>
      <p className="mt-3 text-center text-[12.5px] text-muted-3">
        No wallet yet? The next screen lists the ones that work on this device,
        including one that needs nothing installed.
      </p>
    </div>
  );
}

/**
 * Why the reserve button is off, and the way out of it, in the same panel.
 *
 * The faucet has always existed — inside the wallet menu, behind a chip in the
 * top bar. Someone who has just learned their account is empty has no reason to
 * look there, so it comes to them instead.
 */
function FundingNotice({ funding }: { funding: Funding }) {
  if (funding.kind !== "unfunded" && funding.kind !== "short") return null;

  return (
    <div className="rounded-xl border border-danger/40 bg-danger/5 p-3.5">
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {funding.kind === "unfunded"
              ? "Your account isn't on Testnet yet"
              : "Not enough test XLM"}
          </p>
          <p className="mt-1 text-xs leading-[1.55] text-muted">
            {funding.kind === "unfunded"
              ? "A Stellar account only exists once something funds it. The faucet creates yours and hands you 10,000 test XLM."
              : `Reserving needs about ${fromStroops(funding.need)} XLM — the ${fromStroops(
                  funding.need - BASE_RESERVE_STROOPS - FEE_HEADROOM_STROOPS,
                )} deposit, the 1 XLM Stellar locks in every account, and a little for fees. You hold ${fromStroops(
                  funding.have,
                )}.`}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <FaucetButton />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The four states a guest can be in                                          */
/* -------------------------------------------------------------------------- */

function Offer({
  deposit,
  refund,
  feeAllowance,
  funding,
  left,
  busy,
  onReserve,
}: {
  deposit: bigint;
  refund: bigint;
  feeAllowance: bigint;
  funding: Funding;
  left: number;
  busy: boolean;
  onReserve: () => void;
}) {
  const blocked = blocksReservation(funding);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-1.5 text-[13px] text-muted-2">Deposit to lock</div>
          <div className="font-mono text-[32px] leading-none text-accent-lift">
            {fromStroops(deposit)} XLM
          </div>
          <div className="mt-1.5 text-[13px] text-muted-2">
            Full refund the moment you check in
          </div>
        </div>
        <div className="text-right">
          <div className="mb-1.5 text-[13px] text-muted-2">Back to you on check-in</div>
          <div className="font-mono text-xl text-success">
            {fromStroops(refund)} XLM
          </div>
        </div>
      </div>

      {/* Asked before the wallet prompt, not after the transaction. An account
          that can't cover this fails on a contract error, which reads as a
          broken site to someone who has never used Stellar. */}
      {blocked && (
        <div className="mb-5">
          <FundingNotice funding={funding} />
        </div>
      )}

      <Button
        onClick={onReserve}
        size="lg"
        fullWidth
        disabled={left <= 0 || blocked || busy}
        loading={busy}
      >
        <Lock className="size-4" />
        {left <= 0 ? "Event is full" : "Lock deposit and reserve"}
      </Button>

      <p className="mt-3 text-center text-[12.5px] text-muted-3">
        {fromStroops(feeAllowance)} XLM of that refund is the organizer&apos;s, put up
        so attending costs you nothing in fees.
      </p>
    </div>
  );
}

function Holding({
  deposit,
  refund,
  left,
}: {
  deposit: bigint;
  refund: bigint;
  left: number;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="size-[7px] rounded-full bg-success" />
        <span className="text-[15px] text-success">
          You&apos;re on the list — deposit locked
        </span>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <MiniTile label="Locked" value={`${fromStroops(deposit)} XLM`} tone="accent" />
        <MiniTile label="On check-in" value={`${fromStroops(refund)} XLM`} tone="success" />
      </div>
      <p className="mt-4 text-sm text-muted">
        Check-in opens when the organizer starts it at the event.{" "}
        {left > 0 ? `${left} spots are still open.` : "Every spot is taken."}
      </p>
    </div>
  );
}

function CheckIn({
  refund,
  code,
  setCode,
  busy,
  onCheckIn,
}: {
  refund: bigint;
  code: string;
  setCode: (v: string) => void;
  busy: boolean;
  onCheckIn: () => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="pulse-dot size-[7px] rounded-full bg-accent" />
        <span className="text-[15px] text-accent-lift">
          Check-in is open — take your {fromStroops(refund)} XLM back
        </span>
      </div>

      <div className="rounded-xl border border-dashed border-border-hover bg-surface p-4">
        <Field label="Check-in code">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste the code the organizer shares"
            spellCheck={false}
            autoComplete="off"
            className="bg-surface-2"
          />
        </Field>
        <Button
          onClick={onCheckIn}
          size="lg"
          fullWidth
          className="mt-4"
          disabled={code.trim().length === 0 || busy}
          loading={busy}
        >
          <CheckCircle2 className="size-4" />
          I&apos;m here — check me in
        </Button>
      </div>
    </div>
  );
}

function Settled({
  deposit,
  refund,
  splits,
  finalized,
}: {
  deposit: bigint;
  refund: bigint;
  splits: boolean;
  finalized: boolean;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="size-[7px] rounded-full bg-success" />
        <span className="text-[15px] text-success">You showed up</span>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <MiniTile label="Was locked" value={`${fromStroops(deposit)} XLM`} />
        <MiniTile label="Refunded" value={`${fromStroops(refund)} XLM`} tone="success" />
      </div>
      <p className="mt-4 text-sm text-muted">
        {splits && !finalized
          ? "If anyone flakes, your share of their deposit arrives when the organizer finalizes."
          : "It's back in your wallet."}
      </p>
    </div>
  );
}

function MiniTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "success";
}) {
  const colour =
    tone === "accent"
      ? "text-accent-lift"
      : tone === "success"
        ? "text-success"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border-strong bg-surface p-3.5">
      <div className="mb-1.5 text-[12.5px] text-muted-2">{label}</div>
      <div className={`font-mono text-xl ${colour}`}>{value}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Organizer                                                                  */
/* -------------------------------------------------------------------------- */

function OrganizerPanel({
  id,
  phase,
  checkedIn,
  noShows,
  pool,
  busy,
  onFinalize,
  onOpenCheckin,
  onReopenRsvp,
}: {
  id: string;
  phase: EventState["phase"];
  checkedIn: number;
  noShows: number;
  pool: bigint;
  busy: boolean;
  onFinalize: () => void;
  onOpenCheckin: () => void;
  onReopenRsvp: () => void;
}) {
  const finalized = phase === "Finalized";
  const checkingIn = phase === "CheckingIn";
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    // localStorage only exists after hydration, so this genuinely cannot be read
    // during render without breaking the prerender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSecret(recallSecret(id));
  }, [id]);

  const invite = inviteUrl(id);
  const link = secret ? checkInUrl(id, secret) : null;

  return (
    <Panel title="You're the organizer" meta={finalized ? "Settled" : phase}>
      {/* The invite link is rebuilt from the address in the URL bar, so it is
          here on any device, in any browser, forever — nothing about it depends
          on having created the event in this browser. Unlike the check-in link
          below, which does. */}
      {!finalized && (
        <div className="border-b border-border pb-5">
          <div className="flex items-center gap-2">
            <Send className="size-4 shrink-0 text-muted" />
            <h4 className="font-display text-sm font-bold text-foreground">Invite link</h4>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            Send this to the people you want there. Opening it lets them reserve a spot
            with the deposit — it gives nothing else away.
          </p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <QrCode value={invite} label="QR code linking to this event" size={148} />
            <div className="min-w-0 flex-1">
              <CopyLink url={invite} label="Copy the invite link" />
            </div>
          </div>
        </div>
      )}

      {!finalized && !checkingIn && (
        <div className="border-b border-border py-5">
          <p className="text-sm text-muted">
            When everyone&apos;s there, start check-in. That closes reservations for
            good measure — nobody who was forwarded your link can grab a spot on the
            spot and take a cut of the no-shows&apos; deposits.
          </p>
          <Button
            onClick={onOpenCheckin}
            size="lg"
            fullWidth
            className="mt-4"
            disabled={busy}
            loading={busy}
          >
            <DoorOpen className="size-4" />
            Start check-in
          </Button>
        </div>
      )}

      {/* Shown from the moment the event exists, not only once check-in opens.
          The link is the organizer's only backup of a secret that otherwise
          lives in one browser, so hiding it until check-in was hiding it during
          exactly the window where losing it is still recoverable. */}
      {!finalized && (
        <div className="border-b border-border py-5">
          <div className="flex items-center gap-2">
            <Link2 className="size-4 shrink-0 text-muted" />
            <h4 className="font-display text-sm font-bold text-foreground">
              Check-in link
            </h4>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {checkingIn
              ? "Share it now. Anyone who opens it can check in with the wallet they reserved from."
              : "Keep this until the event starts. Anyone holding it can check in, whether they showed up or not."}
          </p>

          {link ? (
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
              {/* The QR earns its space once people are being checked in; before
                  that it is a picture of a link nobody should be scanning yet. */}
              {checkingIn && <QrCode value={link} label="QR code for checking in" size={148} />}
              <div className="min-w-0 flex-1">
                <CopyLink url={link} label="Copy the check-in link" />
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <ErrorNote>
                The check-in code for this event isn&apos;t in this browser. Only its
                hash is on-chain, so the code can&apos;t be recovered — it lives in the
                browser that created the event, or in a check-in link you already
                saved.
              </ErrorNote>
            </div>
          )}
        </div>
      )}

      {checkingIn && (
        <div className="border-b border-border py-5">
          <Button
            onClick={onReopenRsvp}
            variant="ghost"
            fullWidth
            disabled={busy}
            loading={busy}
          >
            <Undo2 className="size-4" />
            Reopen reservations
          </Button>
          <p className="mt-2 text-xs text-muted-3">
            Lets a latecomer reserve. Anyone who already checked in keeps their refund.
          </p>
        </div>
      )}

      <div className="pt-5">
        {finalized ? (
          <p className="text-sm text-muted">
            This event is finalized. {checkedIn} showed, {noShows} didn&apos;t.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Finalizing closes check-in for good and settles the{" "}
              <strong className="text-foreground">{fromStroops(pool)} XLM</strong> from{" "}
              {noShows} no-show{noShows === 1 ? "" : "s"}. Your unused fee pool comes
              back in the same transaction.
            </p>
            <Button
              onClick={onFinalize}
              variant="secondary"
              size="lg"
              fullWidth
              className="mt-4"
              disabled={busy}
              loading={busy}
            >
              <Flag className="size-4" />
              Finalize event
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={EXPLORER_TX(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-accent-soft hover:underline"
    >
      {shortAddr(hash, 6, 6)}
      <ExternalLink className="size-3" />
    </a>
  );
}
