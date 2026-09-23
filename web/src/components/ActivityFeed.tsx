"use client";

import { CalendarPlus, CheckCircle2, DoorOpen, ExternalLink, Flag, Hand, Lock, UserCheck, Users } from "lucide-react";
import { activityId, type Activity } from "@/lib/events";
import { fromStroops } from "@/lib/contracts";
import { EXPLORER_TX } from "@/lib/stellar";
import { formatMoment, shortAddr, shortHash } from "@/lib/format";
import { Button, SectionLabel, Skeleton } from "./ui";

/**
 * Everything here is read back off the ledger — the contract's own events.
 *
 * `loading` and `error` are props rather than something the parent resolves
 * before rendering, because this component used to take only `activity` and
 * therefore printed **"Nothing yet."** for three unrelated situations: the feed
 * still loading, the event genuinely having no history, and the RPC failing
 * outright. The caller was discarding `useActivity`'s loading and error, but the
 * signature is what made discarding them the path of least resistance.
 */
export function ActivityFeed({
  activity,
  loading = false,
  error = null,
  truncated = false,
  onRetry,
}: {
  activity: Activity[];
  loading?: boolean;
  error?: string | null;
  /** The feed stopped early — history exists above what's shown. */
  truncated?: boolean;
  onRetry?: () => void;
}) {
  const empty = activity.length === 0;

  return (
    <div>
      <SectionLabel className="border-b border-border pb-3">ACTIVITY</SectionLabel>

      {loading && empty ? (
        <div className="mt-4 flex flex-col gap-3" role="status" aria-label="Loading activity">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-9 w-1/2" />
        </div>
      ) : error && empty ? (
        <div className="mt-4">
          <p className="text-sm text-danger">
            Couldn&apos;t read this contract&apos;s events just now. The event itself is
            fine — this is the history feed, not the money.
          </p>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry} className="mt-3">
              Try again
            </Button>
          )}
        </div>
      ) : empty ? (
        <p className="mt-4 text-sm text-muted-2">
          Nothing yet. Every reservation and check-in shows up here, straight from the
          contract&apos;s events on-chain.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {activity.map((a) => (
            <li key={activityId(a)} className="flex items-start gap-3 py-3.5">
              <Icon kind={a.kind} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground-2">{describe(a)}</p>
                {/* The hash, not the ledger number. Every one of these rows is a
                    piece of evidence someone has to be able to read off the
                    screen and check on Stellar Expert — a ledger number sends
                    them looking through a whole ledger for which transaction
                    was theirs. `title` carries the full 64 characters for
                    copying; the link carries them for opening. */}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <a
                    href={EXPLORER_TX(a.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    title={a.txHash}
                    className="inline-flex items-center gap-1 font-mono text-xs text-muted-2 transition-colors hover:text-accent-soft"
                  >
                    {shortHash(a.txHash)}
                    <ExternalLink className="size-3" />
                  </a>
                  {/* Rows outlive the day they happened on now that the archive
                      keeps them, and an undated one reads as though it just
                      happened. */}
                  {!!a.at && <span className="text-xs text-muted-2">{formatMoment(a.at)}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Said out loud rather than left as a short list: a feed that stopped
          early is indistinguishable from a quiet event unless it admits it. */}
      {!empty && truncated && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-2">
          Older activity isn&apos;t shown — this feed reaches back about a day, and
          Soroban RPC only keeps recent history. The contract&apos;s own state above
          is complete.
        </p>
      )}

      {!empty && error && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-2">
          Couldn&apos;t refresh just now, so this may be missing the last few moments.
        </p>
      )}
    </div>
  );
}

function Icon({ kind }: { kind: Activity["kind"] }) {
  const className = "mt-0.5 size-4 shrink-0";
  if (kind === "created") return <CalendarPlus className={`${className} text-muted`} />;
  if (kind === "reserved") return <Lock className={`${className} text-accent`} />;
  if (kind === "checked_in") return <CheckCircle2 className={`${className} text-success`} />;
  if (kind === "phase_changed") return <DoorOpen className={`${className} text-muted`} />;
  if (kind === "applied") return <Hand className={`${className} text-muted`} />;
  if (kind === "answered") return <UserCheck className={`${className} text-muted`} />;
  if (kind === "host_added" || kind === "host_removed") {
    return <Users className={`${className} text-muted`} />;
  }
  return <Flag className={`${className} text-muted`} />;
}

function describe(a: Activity): string {
  // The factory's own event, and the only row that is not the event contract
  // talking about itself. It is the bottom of any complete feed.
  if (a.kind === "created") {
    return `${shortAddr(a.organizer)} created this event`;
  }
  if (a.kind === "phase_changed") {
    return a.phase === "CheckingIn"
      ? "Check-in opened — reservations are closed"
      : "Reservations reopened";
  }
  if (a.kind === "reserved") {
    return `${shortAddr(a.guest)} reserved a spot — ${a.spotsLeft} left`;
  }
  if (a.kind === "checked_in") {
    return `${shortAddr(a.guest)} showed up and took ${fromStroops(a.refunded)} XLM back`;
  }
  if (a.kind === "applied") {
    return `${shortAddr(a.applicant)} asked to come`;
  }
  if (a.kind === "answered") {
    // Both answers, spelled out. An organizer who approves everybody and one who
    // is actually choosing publish the same event, and the only thing that tells
    // them apart is this word.
    return a.approved
      ? `${shortAddr(a.applicant)} was approved`
      : `${shortAddr(a.applicant)} was turned down`;
  }
  if (a.kind === "host_added") {
    return `${shortAddr(a.host)} can now run this event`;
  }
  if (a.kind === "host_removed") {
    return `${shortAddr(a.host)} can no longer run this event`;
  }
  const forfeited = fromStroops(a.forfeited);
  return `Finalized — ${a.showed} showed, ${a.noShows} didn't, ${forfeited} XLM forfeited`;
}
