"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Tag } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { claimName } from "@/lib/name-claim";
import { NAME_MAX_LENGTH, NAME_PROBLEMS, nameProblem } from "@/lib/names";
import { useName } from "./Who";
import { Button, ErrorNote, Field, Input, Panel } from "./ui";

type State = { kind: "idle" | "busy" | "done" } | { kind: "error"; message: string };

/**
 * Set the name on your own record, and only your own.
 *
 * Shown on `/u/<address>` when the connected wallet is the one being looked at.
 * There is no version of this for somebody else's page, which is the point: the
 * server refuses a claim without a signature from the address, and an interface
 * that offered the field anyway would be inviting an attempt it knows will fail.
 *
 * The wallet prompt is explained *before* it appears. A signature request with no
 * reason given is how people learn to approve things without reading them, and
 * this one genuinely is unusual: it is a transaction that will never be submitted.
 */
export function NameYourself({ address }: { address: string }) {
  const { address: connected, sign } = useWallet();
  const existing = useName(address);
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  if (connected !== address) return null;

  // `null` means untouched, so the field shows whatever name is already set
  // without needing an effect to seed it.
  const value = draft ?? existing ?? "";
  const clearing = value.trim().length === 0;
  const problem = clearing ? null : nameProblem(value);
  const unchanged = value === (existing ?? "");

  const save = async () => {
    setState({ kind: "busy" });
    try {
      await claimName(address, clearing ? "" : value, sign);
      setState({ kind: "done" });
      // The heading and every other reader of this name live in a server
      // component, so re-rendering it is a refresh rather than local state.
      router.refresh();
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Couldn't save that." });
    }
  };

  return (
    <Panel title="Your name on this record" meta="OPTIONAL" className="mt-4">
      <p className="text-sm leading-relaxed text-muted">
        A name is shown wherever this wallet appears, instead of its address.
        Nothing requires one: without it you reserve, check in and vouch exactly as
        before, and every screen shows the address it always did.
      </p>

      <div className="mt-4">
        <Field
          label="Name"
          hint={
            problem
              ? NAME_PROBLEMS[problem]
              : clearing && existing
                ? "Saving it empty removes your name and goes back to your address."
                : `${NAME_MAX_LENGTH} characters at most. Everyone can see it.`
          }
        >
          <Input
            value={value}
            onChange={(e) => {
              setDraft(e.target.value);
              setState({ kind: "idle" });
            }}
            placeholder="Leave blank to stay as an address"
            maxLength={NAME_MAX_LENGTH * 2}
            autoComplete="off"
          />
        </Field>
      </div>

      {state.kind === "done" ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-success">
          <Check className="size-4 shrink-0" />
          Saved.
        </p>
      ) : (
        <Button
          fullWidth
          className="mt-4"
          disabled={!!problem || unchanged}
          loading={state.kind === "busy"}
          onClick={() => void save()}
        >
          <Tag className="size-4" />
          {clearing && existing ? "Remove my name" : "Save name"}
        </Button>
      )}

      {state.kind === "error" && <ErrorNote>{state.message}</ErrorNote>}

      <p className="mt-4 text-xs leading-relaxed text-muted-2">
        Your wallet will ask you to sign. <strong className="text-foreground-2">Nothing is
        sent and no fee is paid</strong> — it is a transaction built only to be signed,
        which is how this proves you hold the wallet. Signing a message would have
        been simpler, and one of the four wallets Showup supports cannot do it.
      </p>
    </Panel>
  );
}
