"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  DoorOpen,
  ExternalLink,
  Flag,
  Link2,
  Lock,
  Send,
  Undo2,
  Users,
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
import {
  attendanceOf,
  forfeitPool,
  spotsLeft,
  useActivity,
  useEvent,
  type EventState,
} from "@/lib/events";
import { formatWhen, shortAddr } from "@/lib/format";
import { checkInUrl, inviteUrl } from "@/lib/links";
import { Button, Card, Field, Input } from "./ui";
import { ActivityFeed } from "./ActivityFeed";
import { CopyLink } from "./CopyLink";
import { QrCode } from "./QrCode";

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
    return (
      <div className="flex flex-col gap-6">
        <EventHeader id={id} />
        <Card><p className="text-sm text-muted">Loading event…</p></Card>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="flex flex-col gap-6">
        <EventHeader id={id} />
        <Card>
          <h2 className="text-lg font-bold tracking-tight">Event not found</h2>
          <p className="mt-1 text-sm text-muted">
            {error ?? "No event lives at this address on Testnet."}
          </p>
        </Card>
      </div>
    );
  }

  const isOrganizer = !!address && address === event.organizer;
  const mine = attendanceOf(event, address);
  const left = spotsLeft(event);
  const refund = event.deposit + event.feeAllowance;
  const reserving = event.phase === "Reserving";
  const checkingIn = event.phase === "CheckingIn";
  const finalized = event.phase === "Finalized";

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

  const openCheckin = () =>
    run(async () => {
      const tx = await eventClient(id, signer).open_checkin();
      await tx.signAndSend();
    });

  const reopenRsvp = () =>
    run(async () => {
      const tx = await eventClient(id, signer).reopen_rsvp();
      await tx.signAndSend();
    });

  return (
    <div className="flex flex-col gap-6">
      <EventHeader id={id} title={event.title} startsAt={event.startsAt} />

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              {finalized ? "Event closed" : checkingIn ? "Check-in is open" : "Taking reservations"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {finalized
                ? "Deposits have been settled."
                : checkingIn
                  ? "Reservations are closed — everyone here can check in now."
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

      {address && reserving && mine === "none" && (
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

      {address && reserving && mine === "reserved" && (
        <Card>
          <h3 className="text-base font-bold tracking-tight">You&apos;re on the list</h3>
          <p className="mt-1 text-sm text-muted">
            {fromStroops(event.deposit)} XLM is locked. Check-in opens when the
            organizer starts it at the event — you&apos;ll take {fromStroops(refund)} XLM
            back then.
          </p>
        </Card>
      )}

      {address && checkingIn && mine === "none" && (
        <Card>
          <h3 className="text-base font-bold tracking-tight">Reservations are closed</h3>
          <p className="mt-1 text-sm text-muted">
            The organizer has started check-in, so no new spots can be taken. This is
            what stops someone who was sent the link from joining on the spot and
            taking a cut of the no-shows&apos; deposits.
          </p>
        </Card>
      )}

      {address && checkingIn && mine === "reserved" && (
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
            {event.policy.tag === "SplitAmongAttendees" && !finalized
              ? ". If anyone flakes, your share of their deposit arrives when the organizer finalizes."
              : "."}
          </p>
        </Card>
      )}

      {isOrganizer && (
        <OrganizerPanel
          id={id}
          phase={event.phase}
          checkedIn={event.checkedIn.length}
          noShows={event.reserved.length - event.checkedIn.length}
          pool={forfeitPool(event)}
          busy={action.kind === "busy"}
          onFinalize={finalize}
          onOpenCheckin={openCheckin}
          onReopenRsvp={reopenRsvp}
        />
      )}

      {action.kind === "error" && (
        <p className="rounded-xl border border-danger/40 bg-surface-2 p-3 text-sm text-danger">
          {action.message}
        </p>
      )}

      <ActivityFeed activity={activity ?? []} />
    </div>
  );
}

/**
 * What the event is, above what it technically is.
 *
 * The name and the date come off the chain like everything else on this page,
 * so they are exactly as trustworthy as the deposit. Events created before
 * either field existed have neither, and keep the heading they always had —
 * their address is still right there underneath, which is all they ever showed.
 */
function EventHeader({
  id,
  title,
  startsAt,
}: {
  id: string;
  title?: string;
  startsAt?: number;
}) {
  return (
    <section>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title || "Event"}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        {!!startsAt && <span>{formatWhen(startsAt)}</span>}
        <a
          href={EXPLORER_CONTRACT(id)}
          target="_blank"
          rel="noreferrer"
          title={id}
          className="inline-flex items-center gap-1 font-mono transition-colors hover:text-accent"
        >
          {shortAddr(id, 8, 8)}
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </section>
  );
}

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
    <Card>
      <h3 className="text-base font-bold tracking-tight">You&apos;re the organizer</h3>

      {/* The invite link is rebuilt from the address in the URL bar, so it is
          here on any device, in any browser, forever — nothing about it depends
          on having created the event in this browser. Unlike the check-in link
          below, which does. */}
      {!finalized && (
        <div className="mt-5 border-t border-border pt-5">
          <div className="flex items-center gap-2">
            <Send className="size-4 shrink-0 text-muted" />
            <h4 className="text-sm font-semibold text-foreground">Invite link</h4>
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
        <div className="mt-5 border-t border-border pt-5">
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
        <div className="mt-5 border-t border-border pt-5">
          <div className="flex items-center gap-2">
            <Link2 className="size-4 shrink-0 text-muted" />
            <h4 className="text-sm font-semibold text-foreground">Check-in link</h4>
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
            <p className="mt-4 rounded-xl border border-danger/40 bg-surface-2 p-3 text-sm text-danger">
              The check-in code for this event isn&apos;t in this browser. Only its hash
              is on-chain, so the code can&apos;t be recovered — it lives in the browser
              that created the event, or in a check-in link you already saved.
            </p>
          )}
        </div>
      )}

      {checkingIn && (
        <div className="mt-5 border-t border-border pt-5">
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
          <p className="mt-2 text-xs text-muted-2">
            Lets a latecomer reserve. Anyone who already checked in keeps their refund.
          </p>
        </div>
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
