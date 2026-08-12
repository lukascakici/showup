"use client";

import Link from "next/link";
import { CheckCircle2, KeyRound } from "lucide-react";
import { checkInUrl, inviteUrl } from "@/lib/links";
import { ButtonLink, Card } from "./ui";
import { CopyLink } from "./CopyLink";
import { QrCode } from "./QrCode";

/**
 * What an organizer sees the moment their event exists.
 *
 * This screen replaced an immediate `router.push` to the event page. The old
 * behaviour created a contract, wrote a secret to localStorage and navigated
 * away without a word — so the one piece of information that cannot be
 * recovered was generated and hidden in the same instant.
 *
 * The two links are shown together and named for *when* they get used, because
 * they differ by one query parameter and mixing them up is the only way to
 * break the deposit mechanic: post the check-in link early and anyone can mark
 * themselves present without turning up.
 */
export function EventCreated({
  id,
  title,
  secret,
}: {
  id: string;
  title: string;
  secret: string;
}) {
  const invite = inviteUrl(id);
  const checkIn = checkInUrl(id, secret);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight">Your event is live</h2>
            <p className="mt-1 truncate text-sm text-muted">{title}</p>
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
            Invite link
          </h3>
          <p className="mt-1.5 text-sm text-muted">
            Send this to the people you want there. Opening it lets them reserve a
            spot with the deposit — it gives nothing else away, so it&apos;s safe to
            post anywhere.
          </p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <QrCode value={invite} label={`QR code linking to ${title}`} />
            <div className="min-w-0 flex-1">
              <CopyLink url={invite} label="Copy the invite link" />
              <ButtonLink href={`/e/${id}`} variant="secondary" fullWidth className="mt-3">
                Open event page
              </ButtonLink>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-muted" />
          <div className="min-w-0">
            <h3 className="text-base font-bold tracking-tight">
              Your check-in link — save it now
            </h3>
            <p className="mt-1.5 text-sm text-muted">
              The chain only ever stored a hash of this event&apos;s check-in code, so
              nobody — including us — can recover it. Right now the only copy lives in
              this browser. Clear your site data and you lose the ability to run
              check-in for this event.
            </p>
            <p className="mt-2 text-sm text-muted">
              Putting this link somewhere you trust is the backup. Don&apos;t share it
              until the event starts: anyone holding it can check in, whether they
              showed up or not.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <CopyLink url={checkIn} label="Copy the check-in link" />
        </div>
      </Card>

      <p className="text-center text-xs text-muted-2">
        Both links are on the event page too, whenever you need them again —{" "}
        <Link href={`/e/${id}`} className="underline transition-colors hover:text-foreground">
          {title || "your event"}
        </Link>
        .
      </p>
    </div>
  );
}
