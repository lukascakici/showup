"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet";
import {
  attendanceOf,
  spotsLeft,
  useEventList,
  type ListedEvent,
} from "@/lib/events";
import { fromStroops } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";
import { CalendarPlus } from "lucide-react";
import { Button, ButtonLink, Card, Chip, SectionLabel, Skeleton } from "@/components/ui";
import { DepositFlowArt } from "@/components/DepositFlow";
import { EventPoster } from "@/components/EventPoster";
import { LiveRollCall } from "@/components/LiveRollCall";

type Tab = "upcoming" | "past";

export default function Home() {
  const { address } = useWallet();
  const { data: list, loading, error, refreshing, refresh } = useEventList();
  const events = list?.events;
  const [tab, setTab] = useState<Tab>("upcoming");

  const stats = useMemo(() => summarise(events), [events]);
  const shown = useMemo(() => partition(events, tab), [events, tab]);

  return (
    <div>
      <Hero stats={stats} />

      <LiveRollCall />

      <div className="mb-8 flex items-center justify-between gap-4">
        <h2 className="font-display text-[30px] font-bold tracking-[-0.025em]">
          Events
        </h2>
        <div className="flex rounded-[10px] border border-border-strong bg-surface p-[3px]">
          <Segment active={tab === "upcoming"} onClick={() => setTab("upcoming")}>
            Upcoming
          </Segment>
          <Segment active={tab === "past"} onClick={() => setTab("past")}>
            Past
          </Segment>
        </div>
      </div>

      {loading && !events && (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading events">
          <Skeleton className="h-[9.5rem] w-full" />
          <Skeleton className="h-[9.5rem] w-full" />
        </div>
      )}

      {/* An empty list is the one screen where the next step is unambiguous, so
          it carries the button rather than describing it. */}
      {events && shown.length === 0 && (
        <Card className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted">
            {events.length === 0
              ? "No events yet. Create the first one — it'll live at its own address on Testnet."
              : tab === "upcoming"
                ? "Nothing coming up. Every event here has already been settled."
                : "Nothing has been settled yet."}
          </p>
          {events.length === 0 && (
            <ButtonLink href="/create" variant="secondary">
              <CalendarPlus className="size-4" />
              Create an event
            </ButtonLink>
          )}
        </Card>
      )}

      {shown.length > 0 && (
        <div className="flex flex-col gap-6 md:grid md:grid-cols-[132px_1fr] md:gap-x-6 md:gap-y-0">
          {shown.map((e) => (
            <EventRow key={e.id} event={e} you={address} />
          ))}
        </div>
      )}

      {list && list.unreadable.length > 0 && (
        <p className="mt-4 text-xs text-muted-3">
          {list.unreadable.length}{" "}
          {list.unreadable.length === 1 ? "event" : "events"} couldn&apos;t be read
          right now. They still exist on-chain — nothing was lost.
        </p>
      )}

      {error && !events && (
        <Card className="mt-4">
          <p className="text-sm text-danger">Couldn&apos;t load events.</p>
          <p className="mt-1 font-mono text-xs text-muted-2">{error}</p>
          <Button
            variant="secondary"
            onClick={() => void refresh()}
            loading={refreshing}
            className="mt-4"
          >
            Try again
          </Button>
        </Card>
      )}

      {/* The case a bare `error && !events` guard swallows. Once one load has
          succeeded `events` stays populated forever, so a network that dies
          afterwards leaves real-looking numbers frozen on screen with nothing
          to say they had stopped moving. */}
      {error && events && (
        <p className="mt-4 text-xs text-muted-2">
          These numbers stopped updating — the chain isn&apos;t answering right now.
          Nothing is wrong with the events themselves.
        </p>
      )}

      <HowItWorks />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

type Summary = {
  reserved: number;
  showed: number;
  rate: number | null;
};

/**
 * The one question this product exists to answer, counted off the chain.
 *
 * Not a dashboard. Every other figure available here (events created, wallets
 * seen, XLM currently held) is a number about us, and on Testnet all of them
 * are small enough to be noise. The claim being made is that a deposit pulls
 * the number of people who turn up towards the number who said they would, and
 * that gap is the only thing worth putting at the top of the page.
 *
 * Counted over **finalised events only**, because those are the ones that are
 * over. An event still checking in has no-shows who might yet walk through the
 * door, and scoring them now would publish an outcome the chain has not
 * reached and the page would have to take back.
 */
export function summarise(events: ListedEvent[] | undefined): Summary {
  const empty: Summary = { reserved: 0, showed: 0, rate: null };
  if (!events || events.length === 0) return empty;

  let reserved = 0;
  let showed = 0;

  for (const e of events) {
    if (e.phase !== "Finalized") continue;
    reserved += e.reserved.length;
    showed += e.checkedIn.length;
  }

  return { reserved, showed, rate: reserved > 0 ? (showed / reserved) * 100 : null };
}

function Hero({ stats }: { stats: Summary }) {
  return (
    <div className="mb-13 rounded-[20px] border border-border-strong bg-[linear-gradient(150deg,#1D1D20_0%,#141416_60%)] p-8 sm:p-[34px]">
      <div className="flex flex-wrap items-start gap-10">
        <div className="min-w-[min(340px,100%)] flex-1">
          <span className="mb-[18px] inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs tracking-[0.02em] text-accent-lift">
            Deposit-backed attendance on Stellar
          </span>
          <h1 className="font-display text-[38px] font-bold leading-[1.1] tracking-[-0.03em] text-balance">
            Put a price on
            <br />
            showing up.
          </h1>
          <p className="mt-3.5 max-w-[520px] text-[15.5px] leading-[1.6] text-[#9a9ba1] text-pretty">
            Reserve your spot with a refundable deposit and take it back by turning
            up. Flake, and it goes to the people who didn&apos;t.
          </p>
        </div>

        <Turnout stats={stats} />
      </div>
    </div>
  );
}

/**
 * What a deposit is worth, per hundred people who said they were coming.
 *
 * Two bars, and they are not the same kind of number. The lower one is measured:
 * it is every reservation this contract has settled, counted off the chain. The
 * upper one is an assumption about events that ask for nothing, carried here
 * because the product's claim is a comparison and a comparison needs two sides.
 *
 * It is drawn as the weaker of the two on purpose. An assumption rendered in the
 * same ink as a measurement is the most common way a landing page lies, and the
 * difference between "we counted this" and "this is the usual" has to survive
 * being looked at for one second by somebody who will never read a footnote.
 */

/**
 * Turnout for an event that asks for nothing up front.
 *
 * A rule of thumb from how free RSVPs behave, not a figure anybody measured
 * here, and it is labelled as such everywhere it is shown. Deliberately a round
 * number: a decimal would dress an assumption up as a finding.
 */
const ASSUMED_FREE_TURNOUT = 50;

function Turnout({ stats }: { stats: Summary }) {
  // Before anything has settled there is nothing to compare the assumption
  // against, and a lone bar for an event type we do not run would be an advert
  // for a claim with no evidence under it.
  if (stats.rate === null) {
    return (
      <div className="min-w-[min(300px,100%)] flex-1 pt-1.5">
        <SectionLabel>WITH A DEPOSIT, AND WITHOUT</SectionLabel>
        <p className="mt-3 max-w-[340px] text-sm text-muted">
          No event has settled yet. The moment one does, its real turnout lands here,
          counted off the chain rather than typed in.
        </p>
      </div>
    );
  }

  const gained = Math.round(stats.rate - ASSUMED_FREE_TURNOUT);

  return (
    <div className="min-w-[min(320px,100%)] flex-1 pt-1.5">
      <SectionLabel>WITH A DEPOSIT, AND WITHOUT</SectionLabel>

      <div className="mt-5 flex max-w-[380px] flex-col gap-5">
        <Bar
          title="Free RSVP"
          value={ASSUMED_FREE_TURNOUT}
          reading={`~${ASSUMED_FREE_TURNOUT}%`}
          note="typical, not measured here"
          measured={false}
        />
        <Bar
          title="With a deposit"
          value={stats.rate}
          reading={`${stats.rate.toFixed(1)}%`}
          note={`measured on-chain · ${stats.showed} of ${stats.reserved}`}
          measured
        />
      </div>

      {gained > 0 && (
        <p className="mt-5 max-w-[380px] text-sm leading-[1.6] text-muted text-pretty">
          Per 100 people who reserve, that is about{" "}
          <span className="text-foreground-2">{gained} more</span> of them in the room.
        </p>
      )}
    </div>
  );
}

/**
 * `measured` is the whole point of this component rather than a styling flag:
 * it decides both the ink and the wording, so a bar cannot end up looking
 * counted while saying it was assumed.
 */
function Bar({
  title,
  value,
  reading,
  note,
  measured,
}: {
  title: string;
  value: number;
  reading: string;
  note: string;
  measured: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className={`text-sm ${measured ? "text-foreground" : "text-muted-2"}`}>
          {title}
        </span>
        <span
          className={`font-mono text-[19px] leading-none ${
            measured ? "text-success" : "text-muted-2"
          }`}
        >
          {reading}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="img"
        aria-label={`${title}: ${reading}, ${note}`}
      >
        <div
          className={`h-full rounded-full ${measured ? "bg-success" : "bg-border-hover"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="mt-1.5 text-xs text-muted-3">{note}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Event list                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Upcoming or past.
 *
 * Finalised means settled, whatever the clock says, so it is past even if the
 * organizer set the date next month. Otherwise the boundary is the calendar day,
 * not the clock: an event that started two hours ago is still on tonight, and
 * filing it away as history while people are standing in the room is worse than
 * leaving it a few hours too long.
 *
 * Events with no date are left off both tabs. `starts_at` predates exactly one
 * event on the factory — the bring-up event Deliverable 2's evidence points at —
 * and a nameless, dateless row is noise to everyone except the one reviewer who
 * reaches it through the README's link, which still works. Nothing new can land
 * here: the create form refuses to submit without a date.
 */
function partition(events: ListedEvent[] | undefined, tab: Tab): ListedEvent[] {
  if (!events) return [];
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const startOfToday = midnight.getTime();
  const isPast = (e: ListedEvent) =>
    e.phase === "Finalized" || e.startsAt * 1000 < startOfToday;

  const picked = events.filter(
    (e) => e.startsAt > 0 && (tab === "past" ? isPast(e) : !isPast(e)),
  );
  // Soonest first when looking forward, most recent first when looking back.
  return picked.sort((a, b) =>
    tab === "past" ? b.startsAt - a.startsAt : a.startsAt - b.startsAt,
  );
}

function formatDayLabel(startsAt: number): { day: string; weekday: string } {
  if (!startsAt) return { day: "No date", weekday: "—" };
  const d = new Date(startsAt * 1000);
  return {
    day: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
  };
}

function formatTime(startsAt: number): string | null {
  if (!startsAt) return null;
  return new Date(startsAt * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

function EventRow({ event, you }: { event: ListedEvent; you: string | null }) {
  const left = spotsLeft(event);
  const yours = !!you && event.organizer === you;
  const mine = attendanceOf(event, you);
  const { day, weekday } = formatDayLabel(event.startsAt);
  const time = formatTime(event.startsAt);
  const checkingIn = event.phase === "CheckingIn";
  const finalized = event.phase === "Finalized";

  return (
    <>
      <div className="pt-0.5">
        <div className="font-display text-[16.5px] font-medium">{day}</div>
        <div className="mt-0.5 text-[13.5px] text-muted-2">{weekday}</div>
      </div>

      <Link
        href={`/e/${event.id}`}
        className="group relative mb-0 flex gap-5 rounded-2xl border border-border-strong bg-surface p-5 transition-colors hover:border-border-hover hover:bg-surface-3 md:mb-[22px]"
      >
        {/* The bead on the timeline, sitting in the gutter between the two columns. */}
        <span
          aria-hidden
          className={`absolute -left-[25px] top-[26px] hidden size-[9px] rounded-full shadow-[0_0_0_4px_var(--background)] md:block ${
            checkingIn ? "bg-accent" : "bg-border-hover"
          }`}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex items-center gap-2.5">
            {checkingIn && (
              <>
                <span className="pulse-dot size-1.5 rounded-full bg-accent" />
                {/* accent-soft rather than the accent itself: at 12.5px the
                    darker violet lands under 4.5:1 on this surface. */}
                <span className="text-[12.5px] font-medium tracking-[0.06em] text-accent-soft">
                  CHECK-IN OPEN
                </span>
              </>
            )}
            {time && (
              <span className="font-mono text-[13.5px] text-[#7e7f86]">{time}</span>
            )}
          </div>

          {/* An event from before names existed still has to be openable, so it
              falls back to what it has always been shown as: its address. */}
          <div className="mb-3 truncate font-display text-[21px] font-medium tracking-[-0.015em]">
            {event.title || (
              <span className="font-mono text-base">{shortAddr(event.id, 6, 6)}</span>
            )}
          </div>

          <div className="mb-4 text-sm text-muted">
            {yours ? "Yours" : `by ${shortAddr(event.organizer)}`}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Chip tone="accent" mono>
              {fromStroops(event.deposit)} XLM deposit
            </Chip>
            {mine === "checked-in" ? (
              <Chip tone="success">You showed up</Chip>
            ) : mine === "reserved" ? (
              <Chip tone="success">You&apos;re in</Chip>
            ) : finalized ? (
              <Chip>Closed</Chip>
            ) : checkingIn ? (
              <Chip tone="accent">Checking in</Chip>
            ) : left > 0 ? (
              <Chip>{left} spots left</Chip>
            ) : (
              <Chip>Full</Chip>
            )}
            <span className="text-[13px] text-muted-2">
              {event.reserved.length} reserved · {event.checkedIn.length} showed
            </span>
          </div>

          {/* Say it plainly when the numbers above are a snapshot rather than the
              chain. Showing stale state silently is worse than showing nothing. */}
          {event.source === "index" && event.syncedAt !== undefined && (
            <p className="mt-3 text-xs text-muted-3">
              Couldn&apos;t reach this event just now — showing what we last saw{" "}
              {since(event.syncedAt)}.
            </p>
          )}
        </div>

        <EventPoster
          id={event.id}
          title={event.title}
          startsAt={event.startsAt}
          className="hidden sm:flex"
        />
      </Link>
    </>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[7px] px-4 py-1.5 text-[13.5px] transition-colors ${
        active ? "bg-surface-4 text-foreground" : "text-[#7e7f86] hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* How it works                                                               */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    n: "01",
    title: "Reserve",
    body: "The event's deposit is locked out of your wallet the moment you take a spot.",
  },
  {
    n: "02",
    title: "It's held on-chain",
    body: "The XLM sits in the event's own Soroban contract — not with the organizer.",
  },
  {
    n: "03",
    title: "Check in",
    body: "Enter the code the organizer hands out at the door. The deposit comes back in the same transaction.",
  },
  {
    n: "04",
    title: "Take your share",
    body: "No-shows' deposits stay in the pool, and go to whoever the event said they would.",
    accent: true,
  },
];

function HowItWorks() {
  return (
    <div className="mt-18 border-t border-border pt-11">
      <SectionLabel className="mb-6">HOW THE DEPOSIT WORKS</SectionLabel>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            // A third of a second between cards. Long enough that the four read
            // as a sequence rather than a flicker, short enough that the whole
            // row still belongs to one movement.
            style={{ "--beat": `${i * 0.35}s` } as React.CSSProperties}
            className="flow-scene rounded-[14px] border border-border bg-surface-2 p-5 transition-colors hover:border-border-strong"
          >
            <div className="mb-4 flex h-11 items-center">
              <DepositFlowArt step={i} />
            </div>
            <div
              className={`mb-2 font-mono text-xs ${s.accent ? "text-success" : "text-accent"}`}
            >
              {s.n}
            </div>
            <div className="mb-2 font-display text-base">{s.title}</div>
            <div className="text-[13.5px] leading-[1.55] text-muted">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
