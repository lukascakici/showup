import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EXPLORER_ACCOUNT, EXPLORER_CONTRACT } from "@/lib/stellar";
import { REPUTATION_ID } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";
import { SITE_NAME } from "@/lib/og";
import { isAccountAddress } from "@/lib/record";
import { RecordBody } from "./RecordBody";

/**
 * A wallet's show-up record, as a page anyone can open.
 *
 * The ledger has been readable from the chain since the first engagement and
 * unreadable by a person for just as long. This is the other half of
 * Deliverable 2: the same numbers an event contract gates on, at a URL that can
 * be pasted into a group chat.
 *
 * Deliberately not called a profile. There is no name, no avatar and nothing
 * anybody typed — every figure on it was written by a contract, and the page is
 * worth exactly as much as that is.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const who = isAccountAddress(address) ? shortAddr(address, 6, 6) : "Unknown wallet";

  return {
    title: `${who} · show-up record`,
    description: `What the Showup reputation ledger has recorded for ${who} on Stellar Testnet.`,
    // No `og:image` and no Twitter card on purpose. A shareable preview of
    // somebody's attendance history is a thing you post *at* a person, and the
    // page is meant to be read by an organizer deciding on a reservation, not
    // circulated. The page itself is public; a card would make it promotional.
    robots: { index: false },
    other: { "og:site_name": SITE_NAME },
  };
}

export default async function RecordPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-2 transition-colors hover:text-foreground-2"
      >
        <ArrowLeft className="size-4" />
        All events
      </Link>

      {!isAccountAddress(address) ? (
        <NotAnAddress value={address} />
      ) : (
        <RecordBody address={address} />
      )}

      <p className="mt-10 border-t border-border pt-5 text-xs leading-relaxed text-muted-2">
        Every number on this page is read live from the{" "}
        <a
          href={EXPLORER_CONTRACT(REPUTATION_ID)}
          target="_blank"
          rel="noreferrer"
          className="text-foreground-2 underline decoration-border-hover underline-offset-2"
        >
          reputation contract
        </a>{" "}
        on Stellar Testnet. Nothing here was typed by anyone, and this site cannot
        write a single one of them: the contract only accepts changes from event
        contracts the factory itself deployed.
      </p>
    </main>
  );
}

/**
 * What a mistyped or truncated address gets.
 *
 * Not a 404. A 404 says "no such page", and the page exists — it is the address
 * that is wrong, which is a thing the reader can fix, so it says which part.
 */
function NotAnAddress({ value }: { value: string }) {
  return (
    <div className="mt-8">
      <h1 className="font-display text-3xl tracking-tight text-foreground">
        That is not a wallet address
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-foreground-2">
        A Stellar account address is 56 characters and starts with <code>G</code>.
        This one is {value.length} character{value.length === 1 ? "" : "s"} long
        {value.startsWith("C") ? " and starts with C, which is a contract, not a person" : ""}.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-2">
        If you copied it from Stellar Expert, take the whole address from the
        account page rather than the shortened one shown in a table.
      </p>
      {value.startsWith("C") && (
        <a
          href={EXPLORER_ACCOUNT(value)}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-block text-sm text-accent-lift underline decoration-accent/40 underline-offset-2"
        >
          Look it up on Stellar Expert instead
        </a>
      )}
    </div>
  );
}
