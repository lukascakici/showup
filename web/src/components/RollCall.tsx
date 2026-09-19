"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, MapPin, Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { usePolled } from "@/lib/polled";
import { formatMoment, shortAddr } from "@/lib/format";
import { newestFirst, type Entry, type RollCall as Call } from "@/lib/roll-call";
import { AvatarStack, Identicon } from "./Identicon";
import { Button, Card, Chip, Panel, Skeleton } from "./ui";

type State =
  | { kind: "idle" }
  | { kind: "joining" }
  | { kind: "error"; message: string };

/**
 * One screen, one button, and nothing that opens a wallet prompt.
 *
 * The whole design goal is the time between scanning a printed code and being
 * on the list. Everything that would normally sit in that gap, from funding a
 * Testnet account to signing to waiting for a ledger to close, is absent by
 * design, because this records a claim rather than settling anything.
 *
 * Laid out exactly like `/e/<id>`: poster and who is here down the left, the
 * name and the one available action down the right. Somebody arriving from the
 * home page should not be able to tell they have crossed into a different kind
 * of page, because as far as they are concerned they have not.
 */
export function RollCall({ call, post }: { call: Call; post?: ReactNode }) {
  const { address, status, openPicker } = useWallet();
  const [state, setState] = useState<State>({ kind: "idle" });

  const load = useCallback(async () => {
    const response = await fetch(`/api/here/${call.slug}`, { cache: "no-store" });
    if (!response.ok) throw new Error("couldn't read the list");
    const body = (await response.json()) as { open: boolean; entries: Entry[] };
    return { open: body.open, entries: newestFirst(body.entries) };
  }, [call.slug]);

  // The same polling every other screen here uses, so a dropped tick on a room's
  // bad wifi leaves the last list on screen instead of blanking it. Ten seconds
  // because this is watched on a wall while people arrive.
  const { data, refresh } = usePolled(load, 10_000);
  // `null` only until the very first read lands, which is the one moment a
  // skeleton is honest here.
  const entries = data?.entries ?? null;
  const open = data?.open ?? true;

  const mine = !!address && !!entries?.some((e) => e.address === address);

  const join = async () => {
    if (!address) return;
    setState({ kind: "joining" });
    try {
      const response = await fetch(`/api/here/${call.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "that didn't go through");
      }
      await refresh();
      setState({ kind: "idle" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "that didn't go through" });
    }
  };

  return (
    <div>
      {/* The padding and the matching negative margin grow the hit area to a
          thumb's width without moving anything on the page. */}
      <Link
        href="/"
        className="-mt-3 mb-4 inline-flex w-fit items-center gap-1.5 py-3 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Events
      </Link>

      <div className="grid items-start gap-10 lg:grid-cols-[340px_1fr] lg:gap-12">
        {/* ---------------------------------------------------------------- */}
        {/* What this is, and who is already in the room.                     */}
        {/* ---------------------------------------------------------------- */}
        <aside className="lg:sticky lg:top-24">
          {call.banner && (
            <Image
              src={call.banner.src}
              alt={call.banner.alt}
              width={640}
              height={386}
              priority
              className="mb-6 w-full rounded-2xl border border-border-strong"
            />
          )}

          <div className="border-b border-border pb-5">
            <div className="mb-3 text-[12.5px] text-muted-2">
              {entries === null
                ? "Who is here"
                : `${entries.length} ${entries.length === 1 ? "person" : "people"} here`}
            </div>
            {entries === null ? (
              <Skeleton className="h-[30px] w-28" />
            ) : entries.length > 0 ? (
              <AvatarStack addresses={entries.map((e) => e.address)} />
            ) : (
              <p className="text-[13px] text-muted-3">Nobody yet.</p>
            )}
          </div>

          {/* The event page carries "Stellar Testnet" here because that is where
              its deposits are. Nothing of this one is on a chain, and the chips
              say the true version of the same thing. */}
          <div className="flex flex-wrap gap-2.5 pt-[18px]">
            <Chip pill>No deposit</Chip>
            <Chip pill>Nothing to sign</Chip>
          </div>
        </aside>

        {/* ---------------------------------------------------------------- */}
        {/* The meetup, and the one thing you can do about it.                */}
        {/* ---------------------------------------------------------------- */}
        <div className="min-w-0">
          <h1 className="font-display text-[34px] font-bold leading-[1.06] tracking-[-0.03em] text-balance sm:text-[44px]">
            {call.title}
          </h1>

          <div className="mt-6 flex flex-col gap-4">
            <WhenTile call={call} />
            {call.where && (
              <Tile icon={<MapPin className="size-5" />}>
                <div className="text-base font-medium">{call.where}</div>
                <div className="mt-0.5 text-sm text-muted">In person</div>
              </Tile>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-6">
            <Panel title="You're here" meta={open ? "Taking names" : "Closed"}>
              {mine ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold tracking-tight">
                      You&apos;re on the list
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Nothing left to do. No deposit was taken and nothing was signed.
                    </p>
                  </div>
                </div>
              ) : !address ? (
                <>
                  <h2 className="font-display text-lg font-bold tracking-tight">
                    Connect a wallet
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Your address is all this asks for. Nothing is signed, nothing is
                    spent, and your wallet will not open a prompt.
                  </p>
                  <Button
                    onClick={openPicker}
                    loading={status === "connecting"}
                    fullWidth
                    className="mt-4"
                  >
                    <Wallet className="size-4" />
                    Connect wallet
                  </Button>
                </>
              ) : !open ? (
                <>
                  <h2 className="font-display text-lg font-bold tracking-tight">
                    This has closed
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    It stopped taking names after the meetup. Everyone who came is still
                    below.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-display text-lg font-bold tracking-tight">
                    One tap and you&apos;re in
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Connected as{" "}
                    <span className="font-mono">{shortAddr(address, 6, 6)}</span>.
                  </p>
                  <Button
                    onClick={() => void join()}
                    loading={state.kind === "joining"}
                    fullWidth
                    className="mt-4"
                  >
                    Join
                  </Button>
                  {state.kind === "error" && (
                    <p className="mt-3 text-sm text-danger">{state.message}</p>
                  )}
                </>
              )}
            </Panel>

            {post}

            <Card>
              <h2 className="font-display text-sm font-bold tracking-tight">
                {entries === null ? "In the room" : `In the room · ${entries.length}`}
              </h2>

              {entries === null ? (
                <div
                  className="mt-4 flex flex-col gap-2"
                  role="status"
                  aria-label="Loading the list"
                >
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : entries.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Nobody yet. Be the first.</p>
              ) : (
                <ul className="mt-4 flex flex-col divide-y divide-border">
                  {entries.map((entry) => (
                    <li
                      key={entry.address}
                      className="flex items-center gap-3 py-2.5 text-sm"
                    >
                      <Identicon address={entry.address} />
                      <span className="min-w-0 flex-1 truncate font-mono">
                        {shortAddr(entry.address, 6, 6)}
                      </span>
                      <span className="shrink-0 text-xs text-muted-2">
                        {entry.at ? formatMoment(entry.at) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The date block, in the shape the event page uses.
 *
 * Deliberately a copy rather than an import: the event page's version lives in
 * a module that pulls in the whole chain client, and this page's entire promise
 * is that it loads on a hotel wifi in a doorway. Sharing it means moving it into
 * `ui`, which is a refactor of a file currently being edited elsewhere.
 */
function WhenTile({ call }: { call: Call }) {
  const from = new Date(call.opensAt * 1000);
  // `closesAt` is the first moment it is over, so the last day people can turn
  // up is the day before it. Showing the boundary itself would advertise a day
  // the door is already shut.
  const to = new Date((call.closesAt - 1) * 1000);
  const month = from.toLocaleDateString(undefined, { month: "short" }).toUpperCase();

  // Both days spelled out in full rather than collapsed to a range. A range
  // needs the month on one side only, and which side that is depends on the
  // visitor's locale: written by hand it came out as "19 and September 20" on
  // an en-US machine. `formatRange` knows the answer and joins with a dash,
  // which is the one bit of punctuation this project has ruled out.
  const full = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const sameDay = from.toDateString() === to.toDateString();
  const span = sameDay ? full(from) : `${full(from)} and ${full(to)}`;

  return (
    <div className="flex items-center gap-4">
      <div className="w-12 shrink-0 overflow-hidden rounded-[10px] border border-border-strong bg-surface text-center">
        <div className="bg-surface-3 py-[3px] text-[10px] tracking-[0.1em] text-muted">
          {month}
        </div>
        <div className="py-[5px] font-display text-[19px]">{from.getDate()}</div>
      </div>
      <div className="min-w-0">
        <div className="text-base font-medium">{span}</div>
        <div className="mt-0.5 text-sm text-muted">
          <CalendarClock className="mr-1.5 inline size-3.5 align-[-2px]" />
          Names close{" "}
          {new Date(call.closesAt * 1000).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
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
