import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EXPLORER_CONTRACT } from "@/lib/stellar";
import { FACTORY_ID, REPUTATION_ID } from "@/lib/contracts";
import { SITE_NAME } from "@/lib/og";
import { SectionLabel } from "@/components/ui";

/**
 * What the admin key can and cannot do, in plain words, on the live site.
 *
 * This is here rather than only in the repository on purpose. Somebody deciding
 * whether to lock a deposit is deciding how much to trust whoever runs this, and
 * sending them to a README to find out is the same as not answering. It is also
 * what an audit-readiness review asks for first: centralised trust assumptions,
 * stated plainly by the people who hold them.
 *
 * Every claim on this page is checkable against the chain, and the ones that
 * matter most are checkable without a wallet, an account or our permission.
 */
export const metadata: Metadata = {
  title: "What we can and cannot do",
  description:
    "Showup's upgrade policy and trust assumptions: what the admin key can change, what nobody can change, and what an attacker would get.",
  other: { "og:site_name": SITE_NAME },
};

function Link_({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground-2 underline decoration-border-hover underline-offset-2"
    >
      {children}
    </a>
  );
}

export default function TrustPage() {
  return (
    <main className="mx-auto w-full max-w-2xl">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-2 transition-colors hover:text-foreground-2"
      >
        <ArrowLeft className="size-4" />
        All events
      </Link>

      <div className="mt-8">
        <SectionLabel>TRUST AND UPGRADES</SectionLabel>
        <h1 className="mt-2 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
          What we can and cannot do
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-foreground-2">
          Showup asks people to lock a deposit. That is only reasonable if it is
          clear who can touch it, so this page says so — including the parts that
          are a limit on us.
        </p>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight text-foreground">
          An event that exists cannot be changed by anyone, including us
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          Each event is its own contract, deployed when the organiser creates it.
          That contract has <span className="font-mono text-sm">no upgrade</span>{" "}
          function at all — not one we are choosing not to call, one that was
          never written. The deposit amount, the capacity, who may reserve and
          where forfeited deposits go are fixed when the event is created, and
          there is no key anywhere that can rewrite them afterwards.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          So the rules you agreed to when you locked money are the rules that
          settle it. This is the single most important thing on this page.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight text-foreground">
          What the admin key can change
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          There is an admin. It governs the{" "}
          <Link_ href={EXPLORER_CONTRACT(FACTORY_ID)}>event factory</Link_> and
          the{" "}
          <Link_ href={EXPLORER_CONTRACT(REPUTATION_ID)}>reputation ledger</Link_>
          . Its powers are about <em>future</em> events — events nobody has
          committed money to yet. It is not one key: every one of the powers
          below needs two signatures out of three.
        </p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-border-strong">
          <div className="border-b border-border-strong bg-surface-3 px-5 py-3 text-sm text-foreground-2">
            The admin, acting with two of its three signatures
          </div>
          <div className="divide-y divide-border bg-surface-2">
            <div className="px-5 py-4">
              <div className="text-sm text-foreground">Can</div>
              <ul className="mt-2 space-y-2 text-[15px] leading-relaxed text-foreground-2">
                <li>
                  Change which version of the event contract <em>new</em> events
                  are created from.
                </li>
                <li>Point new events at a different reputation ledger.</li>
                <li>
                  Replace the factory&apos;s or the ledger&apos;s own code, keeping
                  their addresses and their history.
                </li>
                <li>Hand the role to another address.</li>
              </ul>
            </div>
            <div className="px-5 py-4">
              <div className="text-sm text-foreground">Cannot</div>
              <ul className="mt-2 space-y-2 text-[15px] leading-relaxed text-foreground-2">
                <li>
                  Touch an event that already exists, in any way — including one
                  created a minute ago.
                </li>
                <li>Move, freeze, or redirect a deposit anybody has locked.</li>
                <li>Mark somebody as having attended, or as having missed.</li>
                <li>Lower or erase a show-up record. The counters only go up.</li>
                <li>Take a fee. There is no fee, and no code to collect one.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight text-foreground">
          Why we kept the ability to upgrade instead of locking it away
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          A common answer to &ldquo;who can change this?&rdquo; is a time-lock:
          changes are announced and take effect days later. We did not build one,
          and the reason is specific rather than convenient.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          A time-lock protects money that is already committed from a rule change.
          Here, money that is already committed is{" "}
          <em>already out of reach</em> — the event holding it has no upgrade
          path. The only thing the admin key can change is what future events do,
          and nobody has put anything into those yet. A delay would be protecting
          against a risk the architecture has already closed, and we would rather
          say that than perform it.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight text-foreground">
          If one admin key were stolen
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          Nothing would happen. The admin is not a key — it is an account that
          requires <strong className="text-foreground">two signatures out of
          three</strong>, and the three keys are not kept together. A single
          stolen key cannot change what future events run, cannot move the
          reputation ledger, cannot upgrade anything, and cannot even add itself
          weight: the threshold that governs changing the signer list is two as
          well.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          You do not have to take our word for any of that. An account&apos;s
          signers and thresholds are public, so{" "}
          <a
            className="underline decoration-foreground-3 underline-offset-4 hover:decoration-foreground"
            href="https://stellar.expert/explorer/testnet/account/GBWMYPV6274EVO3MVQMEQWGRSEFGE7ZSEJSNWYGMBV4WF7OQLEAF5QQF"
            target="_blank"
            rel="noreferrer"
          >
            the admin account
          </a>{" "}
          states its own rules on the chain.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          If two were stolen, whoever held them could make future events run code
          of their choosing. What they still could not do is reach a single
          deposit already locked, or alter a single record already written. Every
          event standing at that moment would go on settling under the rules it
          was born with.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          Handing the role on takes two transactions signed by two different
          parties — a proposal, and an acceptance only the incoming address can
          send. A wrong address therefore cannot complete a handover, and cannot
          strand the contracts by being nominated.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight text-foreground">
          If a check-in code were stolen
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          Someone holding an event&apos;s check-in secret could check themselves
          in without attending — but only if they had already reserved a spot and
          locked the deposit for it, and only while the organiser has check-in
          open. They would get their own deposit back and take a share of the
          forfeits. They cannot check anybody else in, and they cannot take
          anybody else&apos;s deposit.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          The secret itself never touches the chain until a guest reveals it by
          checking in: the contract stores only its hash.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight text-foreground">
          The list is short, and that is the point
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          Two entries is the whole threat model, because there is very little to
          steal. We hold no deposits — the event contract does. We hold no keys of
          yours. We run no funded account that pays anybody&apos;s fees, and no
          service of ours sits in the path of your transaction: every call is
          signed by your own wallet and goes straight to the network. If this
          website were switched off tomorrow, every deposit would still be
          reclaimable and every record still readable, directly from the
          contracts.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl tracking-tight text-foreground">
          If the organiser disappears
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          Opening check-in and settling an event both need the organiser&apos;s
          signature, so an organiser who walks away used to be able to leave a
          deposit locked with nobody able to release it.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground-2">
          They cannot any more. Forty-eight hours after an event&apos;s start
          time, anyone holding a reserved spot can withdraw their own deposit,
          authorised by themselves and needing no one. It returns only the
          caller&apos;s deposit, so it can never become a way to empty an event,
          and it leaves the guest&apos;s attendance record untouched — recovering
          your own money is neither turning up nor failing to.
        </p>
      </section>

      <p className="mt-12 border-t border-border pt-5 text-xs leading-relaxed text-muted-2">
        Everything here is checkable. The contracts are{" "}
        <Link_ href="https://github.com/lukascakici/showup">
          open source
        </Link_>
        , their addresses are published, and every claim about what a contract
        can do is a function that is either in its interface or is not — readable
        from the chain by a stranger with no wallet and no account.
      </p>
    </main>
  );
}
