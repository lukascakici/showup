"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Flag,
  Link2,
  Lock,
  Users,
} from "lucide-react";
import {
  event as eventClient,
  friendlyContractError,
  fromStroops,
  secretToBuffer,
} from "@/lib/contracts";
import { EXPLORER_TX } from "@/lib/stellar";
import { useSigner } from "@/lib/signer";
import { useWallet } from "@/lib/wallet";
import { recallSecret, rememberSecret } from "@/lib/secrets";
import { attendanceOf, forfeitPool, spotsLeft, useActivity, useEvent } from "@/lib/events";
import { shortAddr } from "@/lib/format";
import { Button, Card, Field, Input } from "./ui";
import { ActivityFeed } from "./ActivityFeed";

type Action = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string };

export function EventDetail({ id, linkSecret }: { id: string; linkSecret: string | null }) {
  const { address } = useWallet();
  const signer = useSigner();
  const { data: event, error, loading, refresh } = useEvent(id);
  const { data: activity, refresh: refreshActivity } = useActivity(id);
  const [action, setAction] = useState<Action>({ kind: "idle" });
  // A guest arriving through the organizer's link shouldn't have to type
  // anything — the secret is already in the URL. Derive rather than seed state,
  // so a link opened after mount still fills the field.
  const [typedCode, setTypedCode] = useState<string | null>(null);
  const code = typedCode ?? linkSecret ?? "";
  const setCode = setTypedCode;

  const after = useCallback(async () => {
    await Promise.all([refresh(), refreshActivity()]);
    setAction({ kind: "idle" });
  }, [refresh, refreshActivity]);

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
    return <Card><p className="text-sm text-muted">Loading event…</p></Card>;
  }
  if (!event) {
    return (
      <Card>
        <h2 className="text-lg font-bold tracking-tight">Event not found</h2>
        <p className="mt-1 text-sm text-muted">
          {error ?? "No event lives at this address on Testnet."}
        </p>
      </Card>
    );
  }

  const isOrganizer = !!address && address === event.organizer;
  const mine = attendanceOf(event, address);
  const left = spotsLeft(event);
  const refund = event.deposit + event.feeAllowance;

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
      if (isOrganizer) rememberSecret(id, code.trim());
    });

  const finalize = () =>
    run(async () => {
      const tx = await eventClient(id, signer).finalize();
      await tx.signAndSend();
    });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              {event.finalized ? "Event closed" : "Event open"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {event.finalized
                ? "Deposits have been settled."
                : `${left} of ${event.capacity} spots left.`}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-tight">
              {fromStroops(event.deposit)}
              <span className="ml-1 text-sm font-medium text-muted">XLM</span>
            </div>
            <p className="text-xs text-muted-2">deposit per person</p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-5 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Reserved</dt>
            <dd className="mt-1 inline-flex items-center gap-1.5 font-semibold">
              <Users className="size-4 text-muted" />
              {event.reserved.length} / {event.capacity}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Checked in</dt>
            <dd className="mt-1 font-semibold">{event.checkedIn.length}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">If you show</dt>
            <dd className="mt-1 font-semibold text-accent">{fromStroops(refund)} XLM back</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">No-shows&apos; deposits</dt>
            <dd className="mt-1 font-semibold">
              {event.policy.tag === "SplitAmongAttendees" ? "Split among attendees" : "To organizer"}
            </dd>
          </div>
        </dl>
      </Card>

      {!address && (
        <Card>
          <p className="text-sm text-muted">Connect your wallet to reserve a spot.</p>
        </Card>
      )}

      {address && !event.finalized && mine === "none" && (
        <Card>
          <h3 className="text-base font-bold tracking-tight">Reserve your spot</h3>
          <p className="mt-1 text-sm text-muted">
            {fromStroops(event.deposit)} XLM is locked in the contract until you check in
            at the event. Show up and you get {fromStroops(refund)} XLM back — your
            deposit plus {fromStroops(event.feeAllowance)} XLM the organizer put up to
            cover your fees.
          </p>
          <Button
            onClick={rsvp}
            size="lg"
            fullWidth
            className="mt-4"
            disabled={left <= 0 || action.kind === "busy"}
            loading={action.kind === "busy"}
          >
            <Lock className="size-4" />
            {left <= 0 ? "Event is full" : `Reserve for ${fromStroops(event.deposit)} XLM`}
          </Button>
        </Card>
      )}

      {address && !event.finalized && mine === "reserved" && (
        <Card>
          <h3 className="text-base font-bold tracking-tight">You&apos;re on the list</h3>
          <p className="mt-1 text-sm text-muted">
            Enter the code the organizer shares at the event — or just open their
            check-in link — to take your {fromStroops(refund)} XLM back.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Check-in code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste the code"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
            <Button
              onClick={checkIn}
              size="lg"
              fullWidth
              disabled={code.trim().length === 0 || action.kind === "busy"}
              loading={action.kind === "busy"}
            >
              <CheckCircle2 className="size-4" />
              I&apos;m here — check me in
            </Button>
          </div>
        </Card>
      )}

      {address && mine === "checked-in" && (
        <Card className="border-accent/40">
          <div className="flex items-center gap-2 text-accent">
            <CheckCircle2 className="size-5" />
            <span className="font-semibold">You showed up</span>
          </div>
          <p className="mt-2 text-sm text-muted">
            {fromStroops(refund)} XLM is back in your wallet
            {event.policy.tag === "SplitAmongAttendees" && !event.finalized
              ? ". If anyone flakes, your share of their deposit arrives when the organizer finalizes."
              : "."}
          </p>
        </Card>
      )}

      {isOrganizer && <OrganizerPanel
        id={id}
        finalized={event.finalized}
        checkedIn={event.checkedIn.length}
        noShows={event.reserved.length - event.checkedIn.length}
        pool={forfeitPool(event)}
        busy={action.kind === "busy"}
        onFinalize={finalize}
      />}

      {action.kind === "error" && (
        <p className="rounded-xl border border-danger/40 bg-surface-2 p-3 text-sm text-danger">
          {action.message}
        </p>
      )}

      <ActivityFeed activity={activity ?? []} />
    </div>
  );
}

function OrganizerPanel({
  id,
  finalized,
  checkedIn,
  noShows,
  pool,
  busy,
  onFinalize,
}: {
  id: string;
  finalized: boolean;
  checkedIn: number;
  noShows: number;
  pool: bigint;
  busy: boolean;
  onFinalize: () => void;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // localStorage only exists after hydration, so this genuinely cannot be read
    // during render without breaking the prerender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSecret(recallSecret(id));
  }, [id]);

  const link = secret ? `${window.location.origin}/e/${id}?c=${encodeURIComponent(secret)}` : null;

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <h3 className="text-base font-bold tracking-tight">You&apos;re the organizer</h3>

      {!finalized && (
        <>
          <p className="mt-1 text-sm text-muted">
            Share this link at the event. Anyone who opens it can check in with the
            wallet they reserved from.
          </p>
          {link ? (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface-2 p-3">
                <Link2 className="size-4 shrink-0 text-muted" />
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{link}</code>
                <button
                  onClick={copy}
                  className="shrink-0 text-muted transition-colors hover:text-foreground"
                  aria-label="Copy check-in link"
                >
                  {copied ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-2">
                Anyone holding this link can check in, so share it at the event rather
                than before it.
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-danger/40 bg-surface-2 p-3 text-sm text-danger">
              The check-in code for this event isn&apos;t in this browser. Only its hash
              is on-chain, so the code can&apos;t be recovered — it lives in the browser
              that created the event, or in a check-in link you already shared.
            </p>
          )}
        </>
      )}

      <div className="mt-5 border-t border-border pt-5">
        {finalized ? (
          <p className="text-sm text-muted">
            This event is finalized. {checkedIn} showed, {noShows} didn&apos;t.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Finalizing closes check-in for good and settles the{" "}
              <strong className="text-foreground">{fromStroops(pool)} XLM</strong> from{" "}
              {noShows} no-show{noShows === 1 ? "" : "s"}. Your unused fee pool comes back
              in the same transaction.
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
    </Card>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={EXPLORER_TX(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-accent hover:underline"
    >
      {shortAddr(hash, 6, 6)}
      <ExternalLink className="size-3" />
    </a>
  );
}
