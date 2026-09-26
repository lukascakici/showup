"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { useSigner } from "@/lib/signer";
import { friendlyContractError, reputation } from "@/lib/contracts";
import { Button, ErrorNote, Panel } from "./ui";

type State = { kind: "idle" | "busy" | "done" } | { kind: "error"; message: string };

/**
 * Pay to keep somebody's record readable.
 *
 * `renew` on the reputation contract takes no auth and no admin — the one entry
 * point on this project that anybody at all may call about somebody else. This
 * button exists to make that real rather than merely true: a record that only its
 * owner could renew would still be a record held at our sufferance, since the
 * owner is exactly the person who has stopped interacting once it starts to
 * matter.
 *
 * Soroban rents state. An entry nobody touches is archived — not deleted, and
 * never lost, but unreadable until somebody pays to bring it back. Every write
 * already extends what it wrote, so a record survives while its owner keeps
 * attending things and begins expiring the moment they stop.
 *
 * Shown only for a record that exists. Renewing an unwritten one is a deliberate
 * no-op in the contract, so the button would take a fee and a signature and
 * change nothing, which is worse than not offering it.
 */
export function KeepAlive({ member, known }: { member: string; known: boolean }) {
  const { address, openPicker } = useWallet();
  const signer = useSigner();
  const [state, setState] = useState<State>({ kind: "idle" });

  if (!known) return null;

  const renew = async () => {
    setState({ kind: "busy" });
    try {
      const tx = await reputation(signer).renew({ member });
      await tx.signAndSend();
      setState({ kind: "done" });
    } catch (err) {
      setState({ kind: "error", message: friendlyContractError(err) });
    }
  };

  const mine = address === member;

  return (
    <Panel title="Keep this record readable" meta="ANYONE MAY PAY" className="mt-4">
      <p className="text-sm leading-relaxed text-foreground-2">
        Stellar charges rent on stored data. This record is extended every time it
        changes, so it stays readable while this wallet keeps turning up, and starts
        running down when it stops.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-2">
        {mine
          ? "You can extend your own lease, and so can anybody else. The contract asks for no signature from the record's owner, so a reputation is never something you can be locked out of keeping."
          : "You don't have to be this wallet, or an admin, to pay for that. A friend or an organizer who wants to admit them next month can do it, which is what keeps the record from depending on us."}
      </p>

      {state.kind === "done" ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-success">
          <Check className="size-4 shrink-0" />
          Lease extended. Nothing else about the record changed: <code>renew</code>{" "}
          has no way to write a number.
        </p>
      ) : address ? (
        <Button
          variant="secondary"
          fullWidth
          className="mt-5"
          loading={state.kind === "busy"}
          onClick={() => void renew()}
        >
          Extend the lease
        </Button>
      ) : (
        <Button variant="secondary" fullWidth className="mt-5" onClick={openPicker}>
          Connect a wallet to extend it
        </Button>
      )}

      {state.kind === "error" && <ErrorNote>{state.message}</ErrorNote>}

      <p className="mt-4 text-xs leading-relaxed text-muted-2">
        If the lease is already healthy this costs a fee and extends nothing:
        Stellar only lengthens an entry that has fallen below its threshold, so
        there is no way to burn XLM re-extending a record that is fine.
      </p>
    </Panel>
  );
}
