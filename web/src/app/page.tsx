"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarPlus, Users } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { useEventList, spotsLeft, type ListedEvent } from "@/lib/events";
import { groupByDay } from "@/lib/schedule";
import { fromStroops } from "@/lib/contracts";
import { formatTime, formatWhen, shortAddr } from "@/lib/format";
import { Button, ButtonLink, Card, Skeleton } from "@/components/ui";

export default function Home() {
  const { address } = useWallet();
  const { data: list, loading, error, refreshing, refresh } = useEventList();
  const events = list?.events;

  // Recomputed only when the list changes, not on every poll tick — `Date.now()`
  // inside means the labels ("Today") stay correct across a page left open for
  // hours, since a new poll result is what a day boundary would have changed.
  const groups = useMemo(() => (events ? groupByDay(events) : []), [events]);

  return (
    <div className="flex flex-col gap-8">
      <section className="pt-4">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Put a deposit on
          <br />
          <span className="font-hand text-5xl text-accent sm:text-6xl">showing up.</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-muted">
          Reserve your spot with a refundable deposit and take it back by turning up.
          Flake, and it goes to the people who didn&apos;t.
        </p>
        <ButtonLink href="/create" size="lg" className="mt-6">
          <CalendarPlus className="size-4" />
          Create an event
        </ButtonLink>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight">Events</h2>

        {loading && !events && (
          <div className="mt-3 flex flex-col gap-3" role="status" aria-label="Loading events">
            <Skeleton className="h-[7.5rem] w-full" />
            <Skeleton className="h-[7.5rem] w-full" />
          </div>
        )}

        {/* The copy was already right and there was nothing to press. An empty
            list is the one screen where the next step is unambiguous. */}
        {events && events.length === 0 && (
          <Card className="mt-3 flex flex-col items-start gap-4">
            <p className="text-sm text-muted">
              No events yet. Create the first one — it&apos;ll live at its own address on
              Testnet.
            </p>
            <ButtonLink href="/create" variant="secondary" fullWidth>
              <CalendarPlus className="size-4" />
              Create an event
            </ButtonLink>
          </Card>
        )}

        {events && events.length > 0 && (
          <div className="mt-3 flex flex-col gap-6">
            {groups.map((group) => {
              // "Earlier" and "No date" span days; a dated group doesn't.
              const dated = /^\d{4}-/.test(group.key);
              return (
                <section key={group.key}>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                    {group.label}
                  </h3>
                  <ul className="mt-2 flex flex-col gap-3">
                    {group.events.map((e) => (
                      <li key={e.id}>
                        {/* Under a heading that already says the day, the row
                            only needs the clock. */}
                        <EventRow event={e} you={address} timeOnly={dated} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {list && list.unreadable.length > 0 && (
          <p className="mt-3 text-xs text-muted-2">
            {list.unreadable.length} {list.unreadable.length === 1 ? "event" : "events"} couldn&apos;t
            be read right now. They still exist on-chain — nothing was lost.
          </p>
        )}

        {error && !events && (
          <Card className="mt-3">
            <p className="text-sm text-danger">Couldn&apos;t load events.</p>
            <p className="mt-1 font-mono text-xs text-muted-2">{error}</p>
            <Button variant="secondary" onClick={() => void refresh()} loading={refreshing} className="mt-4">
              Try again
            </Button>
          </Card>
        )}

        {/* The case the old `error && !events` guard silently swallowed. Once one
            load has succeeded, `events` stays populated forever, so a network
            that dies afterwards left real-looking numbers frozen on screen with
            nothing to indicate they had stopped moving. */}
        {error && events && (
          <p className="mt-3 text-xs text-muted-2">
            These numbers stopped updating — the chain isn&apos;t answering right now.
            Nothing is wrong with the events themselves.
          </p>
        )}
      </section>
    </div>
  );
}

/** "3 minutes ago" for an index snapshot, so staleness is a number, not a vibe. */
function since(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function EventRow({
  event,
  you,
  timeOnly = false,
}: {
  event: ListedEvent;
  you: string | null;
  timeOnly?: boolean;
}) {
  const left = spotsLeft(event);
  const yours = !!you && event.organizer === you;

  return (
    <Link
      href={`/e/${event.id}`}
      className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* An event from before names existed still has to be openable, so it
              falls back to what it has always been shown as: its address. */}
          {event.title ? (
            <p className="truncate text-base font-bold tracking-tight text-foreground">
              {event.title}
            </p>
          ) : (
            <p className="truncate font-mono text-sm text-foreground">
              {shortAddr(event.id, 6, 6)}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {event.startsAt > 0 &&
              `${timeOnly ? formatTime(event.startsAt) : formatWhen(event.startsAt)} · `}
            {yours ? "Yours" : `by ${shortAddr(event.organizer)}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-bold tracking-tight">
            {fromStroops(event.deposit)}
            <span className="ml-1 text-xs font-medium text-muted">XLM</span>
          </div>
          <p className="text-xs text-muted-2">deposit</p>
        </div>
      </div>

      {/* Three stats on one nowrap line ran off the card on a phone as soon as
          the numbers reached two digits — "12 / 20 reserved" is the common case
          next week, not the edge case. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" />
          {event.reserved.length} / {event.capacity} reserved
        </span>
        <span>{event.checkedIn.length} showed</span>
        <span className="ml-auto font-medium text-foreground">
          {event.phase === "Finalized"
            ? "Closed"
            : event.phase === "CheckingIn"
              ? "Checking in"
              : left > 0
                ? `${left} spots left`
                : "Full"}
        </span>
      </div>

      {/* Say it plainly when the numbers above are a snapshot rather than the
          chain. Showing stale state silently is worse than showing nothing. */}
      {event.source === "index" && event.syncedAt !== undefined && (
        <p className="mt-2 text-xs text-muted-2">
          Couldn&apos;t reach this event just now — showing what we last saw{" "}
          {since(event.syncedAt)}.
        </p>
      )}
    </Link>
  );
}
