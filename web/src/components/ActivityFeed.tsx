"use client";

import { CheckCircle2, ExternalLink, Flag, Lock } from "lucide-react";
import type { Activity } from "@/lib/events";
import { fromStroops } from "@/lib/contracts";
import { EXPLORER_TX } from "@/lib/stellar";
import { shortAddr } from "@/lib/format";
import { Card } from "./ui";

/** Everything here is read back off the ledger — the contract's own events. */
export function ActivityFeed({ activity }: { activity: Activity[] }) {
  return (
    <Card>
      <h3 className="text-base font-bold tracking-tight">Activity</h3>
      <p className="mt-1 text-sm text-muted">Straight from the contract&apos;s events on-chain.</p>

      {activity.length === 0 ? (
        <p className="mt-4 text-sm text-muted-2">Nothing yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {activity.map((a) => (
            <li key={`${a.txHash}-${a.kind}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <Icon kind={a.kind} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{describe(a)}</p>
                <a
                  href={EXPLORER_TX(a.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-muted transition-colors hover:text-accent"
                >
                  ledger {a.ledger}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Icon({ kind }: { kind: Activity["kind"] }) {
  const className = "mt-0.5 size-4 shrink-0";
  if (kind === "reserved") return <Lock className={`${className} text-muted`} />;
  if (kind === "checked_in") return <CheckCircle2 className={`${className} text-accent`} />;
  return <Flag className={`${className} text-muted`} />;
}

function describe(a: Activity): string {
  if (a.kind === "reserved") {
    return `${shortAddr(a.guest)} reserved a spot — ${a.spotsLeft} left`;
  }
  if (a.kind === "checked_in") {
    return `${shortAddr(a.guest)} showed up and took ${fromStroops(a.refunded)} XLM back`;
  }
  const forfeited = fromStroops(a.forfeited);
  return `Finalized — ${a.showed} showed, ${a.noShows} didn't, ${forfeited} XLM forfeited`;
}
