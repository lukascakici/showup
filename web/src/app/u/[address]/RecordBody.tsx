import { CalendarCheck, HeartHandshake, UserX } from "lucide-react";
import { EXPLORER_ACCOUNT } from "@/lib/stellar";
import { formatMoment, shortAddr } from "@/lib/format";
import { Card, Chip, Panel, SectionLabel, Stat } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { RefreshRecord } from "@/components/RefreshRecord";
import { NameYourself } from "@/components/NameYourself";
import { Who } from "@/components/Who";
import { canVouch, hasRecord, loadRecord, reservations, turnout, type Record } from "@/lib/record";
import { toRecord } from "@/lib/record-index";
import { readIndexedRecordAdmin } from "@/lib/record-index.server";

/**
 * Read on the server so the numbers are in the HTML.
 *
 * A record is the thing somebody was sent this link to look at. Loading it
 * client-side would mean the page arrives, shows nothing, and then fills in —
 * and on a record that turns out to be empty, the empty state would flash after
 * a spinner as though something had failed.
 *
 * **Any mirror at all beats the chain here, however old it is.** A record is a
 * backward-looking thing; Firestore answers for it in one round trip that does not
 * depend on Soroban RPC being quick today, and `RefreshRecord` re-reads the
 * contract the moment the page is up. Gating the mirror on freshness — the first
 * version of this — meant a record nobody had looked at for a minute went back to
 * an RPC read on every view, which is the whole cost the mirror exists to remove.
 *
 * What makes serving a stale copy honest is not how stale it is but that the page
 * says so. `readAt` is rendered underneath, always, and the refresh lands within a
 * second or two.
 */
export async function RecordBody({ address }: { address: string }) {
  // Admin SDK, not the client one: see `record-index.server.ts`. The client
  // Firestore SDK fails silently in this runtime and returns "no document".
  const mirrored = await readIndexedRecordAdmin(address).catch(() => null);

  let record: Record;
  let readAt: number | null = null;
  if (mirrored) {
    record = toRecord(mirrored);
    readAt = mirrored.syncedAt;
  } else {
    // Nothing mirrored, so there is no copy to serve and the contract is the only
    // thing that can tell "never synced" from "no record". This is also the only
    // path that can fail, which is why it is the only one with a fallback.
    try {
      record = await loadRecord(address);
    } catch {
      return <Unreadable address={address} />;
    }
  }

  const known = hasRecord(record);
  const rate = turnout(record);

  return (
    <div className="mt-8">
      <SectionLabel>SHOW-UP RECORD</SectionLabel>
      {/* The name if this wallet has one, the address if not. `Who` renders the
          address first and swaps, so an unnamed wallet never shows a gap. */}
      <h1 className="mt-2 break-all font-display text-3xl tracking-tight text-foreground sm:text-4xl">
        <Who address={address} head={6} tail={6} />
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {known ? (
          canVouch(record) ? (
            <Chip tone="success" pill>
              Can vouch somebody in
            </Chip>
          ) : (
            <Chip tone="neutral" pill>
              Cannot vouch
            </Chip>
          )
        ) : (
          <Chip tone="neutral" pill>
            No record yet
          </Chip>
        )}
        <a
          href={EXPLORER_ACCOUNT(address)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-2 underline decoration-border-hover underline-offset-2 transition-colors hover:text-foreground-2"
        >
          Account on Stellar Expert
        </a>
      </div>

      {!known ? (
        <Newcomer />
      ) : (
        <>
          <Card className="mt-6">
            {/* No turnout column when there is nothing to divide. A placeholder
                where a percentage goes invites the eye to read it as a low score,
                and this wallet has no turnout rate rather than a bad one. */}
            <div className={`grid gap-4 ${rate === null ? "grid-cols-2" : "grid-cols-3"}`}>
              <Stat value={record.shows} label="showed up" tone="success" />
              <Stat value={record.noShows} label="didn't" />
              {rate !== null && (
                <Stat value={`${rate.toFixed(0)}%`} label="turnout" tone="accent" />
              )}
            </div>
            <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-2">
              {rate === null ? (
                <>
                  No reservations yet. This wallet is on the ledger for what it has
                  done around events rather than for attending one.
                </>
              ) : (
                <>
                  {reservations(record)} reservation
                  {reservations(record) === 1 ? "" : "s"} held, each one a deposit
                  locked in an event contract until it settled.
                </>
              )}
            </p>
          </Card>

          <Panel title="Vouching" meta="ON-CHAIN RULE" className="mt-4">
            <div className="grid grid-cols-2 gap-4">
              <Stat
                value={record.vouchesGiven}
                label={record.vouchesGiven === 1 ? "person vouched for" : "people vouched for"}
              />
              <Stat
                value={record.vouchesBroken}
                label={record.vouchesBroken === 1 ? "vouch broken" : "vouches broken"}
              />
            </div>
            <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-2">
              {canVouch(record) ? (
                <>
                  This wallet may put its own record behind somebody who has none.
                  The contract asks for at least one show and no broken vouches.
                </>
              ) : record.shows === 0 ? (
                <>
                  Vouching asks for at least one show first, so that a second wallet
                  cannot wave itself through.
                </>
              ) : (
                <>
                  A vouch that was broken closes vouching permanently, whatever the
                  attendance count says. It is not a threshold, which is what stops
                  anybody earning back the right to keep waving strangers in.
                </>
              )}
            </p>
          </Panel>

          {record.eventsOrganised > 0 && (
            <Card className="mt-4">
              <Stat value={record.eventsOrganised} label="events run to settlement" />
              <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-2">
                Counted at settlement rather than at creation: an event that was
                deployed and abandoned is not an event anybody ran.
              </p>
            </Card>
          )}
        </>
      )}

      <div className="mt-6">
        <CopyLink url={address} label="Wallet address" />
      </div>

      {/* Said plainly when the numbers above came out of the mirror rather than
          straight off the contract. A snapshot passed off as current is the one
          dishonest thing a record page can do. */}
      {readAt !== null && (
        <p className="mt-4 text-xs text-muted-3">
          Read from the chain {formatMoment(readAt)}. Refreshing.
        </p>
      )}

      <NameYourself address={address} />

      <RefreshRecord address={address} />
    </div>
  );
}

/**
 * A wallet the ledger has never written anything about.
 *
 * Every counter being zero proves this rather than suggesting it — no writer the
 * contract has can produce an all-zero record. So this says "nothing yet", which
 * is true, instead of five zeroes, which would read as a verdict.
 */
function Newcomer() {
  return (
    <Card className="mt-6">
      <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
        The ledger has never seen this wallet
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-foreground-2">
        Not zero shows. <em>No record at all.</em> Nothing has been written about
        this address, so there is nothing here to read either way.
      </p>
      <ul className="mt-5 space-y-3 border-t border-border pt-4 text-sm text-muted-2">
        <li className="flex gap-3">
          <CalendarCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <span>
            Checking in to an event writes the first line, in the same transaction
            that returns the deposit.
          </span>
        </li>
        <li className="flex gap-3">
          <UserX className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>
            Reserving and not turning up writes one too. The record is not a score
            that only goes up.
          </span>
        </li>
        <li className="flex gap-3">
          <HeartHandshake className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>
            Until then, a member with a record of their own can vouch this wallet
            into an event that asks for one.
          </span>
        </li>
      </ul>
    </Card>
  );
}

/**
 * The read failed.
 *
 * It must not fall back to an empty record. "We couldn't ask the chain" and
 * "this person has never shown up to anything" are opposite claims, and only one
 * of them is safe to guess at.
 */
function Unreadable({ address }: { address: string }) {
  return (
    <div className="mt-8">
      <SectionLabel>SHOW-UP RECORD</SectionLabel>
      <h1 className="mt-2 break-all font-display text-3xl tracking-tight text-foreground sm:text-4xl">
        {shortAddr(address, 6, 6)}
      </h1>
      <Card className="mt-6">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
          Couldn&apos;t read the ledger just now
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-2">
          Soroban Testnet didn&apos;t answer. This wallet&apos;s record is untouched:
          nothing on this page failed except the question, and reloading usually
          gets it.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-2">
          Showing zeroes here would have said this wallet has never shown up to
          anything, which is not what happened.
        </p>
      </Card>
    </div>
  );
}
