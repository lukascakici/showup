"use client";

import Link from "next/link";
import { CalendarPlus, Users } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { useEventList, spotsLeft, type EventState } from "@/lib/events";
import { fromStroops } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";
import { ButtonLink, Card } from "@/components/ui";

export default function Home() {
  const { address } = useWallet();
  const { data: events, loading, error } = useEventList();

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

        {loading && !events && <p className="mt-3 text-sm text-muted">Loading events…</p>}

        {events && events.length === 0 && (
          <Card className="mt-3">
            <p className="text-sm text-muted">
              No events yet. Create the first one — it&apos;ll live at its own address on
              Testnet.
            </p>
          </Card>
        )}

        {events && events.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {events
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id}>
                  <EventRow event={e} you={address} />
                </li>
              ))}
          </ul>
        )}

        {error && !events && (
          <p className="mt-3 text-sm text-danger">Couldn&apos;t load events: {error}</p>
        )}
      </section>
    </div>
  );
}

function EventRow({ event, you }: { event: EventState; you: string | null }) {
  const left = spotsLeft(event);
  const yours = !!you && event.organizer === you;

  return (
    <Link
      href={`/e/${event.id}`}
      className="block rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-foreground">{shortAddr(event.id, 6, 6)}</p>
          <p className="mt-1 text-xs text-muted">
            {yours ? "Yours" : `by ${shortAddr(event.organizer)}`}
          </p>
        </div>
        <div className="text-right">
          <div className="font-bold tracking-tight">
            {fromStroops(event.deposit)}
            <span className="ml-1 text-xs font-medium text-muted">XLM</span>
          </div>
          <p className="text-xs text-muted-2">deposit</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" />
          {event.reserved.length} / {event.capacity} reserved
        </span>
        <span>{event.checkedIn.length} showed</span>
        <span className="ml-auto font-medium text-foreground">
          {event.finalized ? "Closed" : left > 0 ? `${left} spots left` : "Full"}
        </span>
      </div>
    </Link>
  );
}
