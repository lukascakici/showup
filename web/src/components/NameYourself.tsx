"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Tag } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { claimName } from "@/lib/name-claim";
import { NAME_MAX_LENGTH, NAME_PROBLEMS, nameProblem } from "@/lib/names";
import {
  PROFILE_PROBLEMS,
  X_MAX_LENGTH,
  evmProblem,
  normalizeHandle,
  xProblem,
} from "@/lib/profile";
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
export function NameYourself({
  address,
  x: savedX = null,
  evm: savedEvm = null,
}: {
  address: string;
  x?: string | null;
  evm?: string | null;
}) {
  const { address: connected, sign } = useWallet();
  const existing = useName(address);
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);
  const [xDraft, setXDraft] = useState<string | null>(null);
  const [evmDraft, setEvmDraft] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  if (connected !== address) return null;

  // `null` means untouched, so the field shows whatever name is already set
  // without needing an effect to seed it.
  const value = draft ?? existing ?? "";
  const xValue = xDraft ?? savedX ?? "";
  const evmValue = evmDraft ?? savedEvm ?? "";
  const clearing = value.trim().length === 0;
  const problem = clearing ? null : nameProblem(value);
  const linkProblem = xProblem(xValue) ?? evmProblem(evmValue);
  const unchanged =
    value === (existing ?? "") &&
    normalizeHandle(xValue) === (savedX ?? "") &&
    evmValue.trim() === (savedEvm ?? "");

  const save = async () => {
    setState({ kind: "busy" });
    try {
      await claimName(address, clearing ? "" : value, sign, {
        x: normalizeHandle(xValue),
        evm: evmValue.trim(),
      });
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

      {/* Two links, on the same form and therefore the same signature. They are
          below the name rather than beside it because they are strictly
          optional-er: a name replaces the address everywhere, these only ever
          appear on this one page. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          label="X"
          hint={
            xProblem(xValue)
              ? PROFILE_PROBLEMS[xProblem(xValue)!]
              : "Shown as a link. Leave blank for none."
          }
        >
          <Input
            value={xValue}
            onChange={(e) => {
              setXDraft(e.target.value);
              setState({ kind: "idle" });
            }}
            placeholder="@handle"
            maxLength={X_MAX_LENGTH * 2}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Ethereum address"
          hint={
            evmProblem(evmValue)
              ? PROFILE_PROBLEMS[evmProblem(evmValue)!]
              : "Shown shortened. Leave blank for none."
          }
        >
          <Input
            value={evmValue}
            onChange={(e) => {
              setEvmDraft(e.target.value);
              setState({ kind: "idle" });
            }}
            placeholder="0x…"
            maxLength={64}
            autoComplete="off"
          />
        </Field>
      </div>

      {/* The sentence that keeps this honest. A Stellar signature proves you
          hold this Stellar wallet and nothing else — anybody can type anybody's
          handle — so the one thing this form must never imply is verification. */}
      <p className="mt-3 text-xs leading-relaxed text-muted-2">
        Both are shown as <strong className="text-foreground-2">claims, not
        verified</strong>: signing proves you hold this Stellar wallet, and says
        nothing about an X account or an Ethereum address.
      </p>

      {state.kind === "done" ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-success">
          <Check className="size-4 shrink-0" />
          Saved.
        </p>
      ) : (
        <Button
          fullWidth
          className="mt-4"
          disabled={!!problem || !!linkProblem || unchanged}
          loading={state.kind === "busy"}
          onClick={() => void save()}
        >
          <Tag className="size-4" />
          {clearing && existing ? "Remove my name" : "Save"}
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
