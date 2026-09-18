"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Users, Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { usePolled } from "@/lib/polled";
import { formatMoment, shortAddr } from "@/lib/format";
import { newestFirst, type Entry, type RollCall as Call } from "@/lib/roll-call";
import { Button, Card, Skeleton } from "./ui";

type State =
  | { kind: "idle" }
  | { kind: "joining" }
  | { kind: "error"; message: string };

/**
 * One screen, one button, and nothing that opens a wallet prompt.
 *
 * The whole design goal is the time between scanning a printed code and being
 * on the list. Everything that would normally sit in that gap — funding a
 * Testnet account, signing, waiting for a ledger to close — is absent by
 * design, because this records a claim rather than settling anything.
 */
export function RollCall({ call }: { call: Call }) {
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
    <div className="flex flex-col gap-6">
      <section className="pt-4">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          {call.title}
        </h1>
        {call.where && <p className="mt-2 text-sm text-muted">{call.where}</p>}
      </section>

      <Card>
        {mine ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight">You&apos;re on the list</h2>
              <p className="mt-1 text-sm text-muted">
                Nothing left to do. No deposit was taken and nothing was signed — this is a
                roll call, not a reservation.
              </p>
            </div>
          </div>
        ) : !address ? (
          <>
            <h2 className="text-lg font-bold tracking-tight">Connect a wallet</h2>
            <p className="mt-1 text-sm text-muted">
              Your address is all this asks for. Nothing is signed, nothing is spent, and
              your wallet will not open a prompt.
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
            <h2 className="text-lg font-bold tracking-tight">This roll call has closed</h2>
            <p className="mt-1 text-sm text-muted">
              It stopped taking names after the meetup. Everyone who came is still below.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold tracking-tight">You&apos;re here</h2>
            <p className="mt-1 text-sm text-muted">
              Connected as <span className="font-mono">{shortAddr(address, 6, 6)}</span>. One
              tap and you&apos;re on the list.
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
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted" />
          <h2 className="text-sm font-bold tracking-tight">
            {entries === null ? "In the room" : `In the room — ${entries.length}`}
          </h2>
        </div>

        {entries === null ? (
          <div className="mt-4 flex flex-col gap-2" role="status" aria-label="Loading the list">
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
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="truncate font-mono">{shortAddr(entry.address, 6, 6)}</span>
                <span className="shrink-0 text-xs text-muted-2">
                  {entry.at ? formatMoment(entry.at) : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
