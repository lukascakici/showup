"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Info } from "lucide-react";
import {
  FEE_ALLOWANCE_STROOPS,
  NATIVE_SAC,
  factory,
  friendlyContractError,
  fromStroops,
  generateSecret,
  hashSecret,
  toStroops,
  type ForfeitPolicy,
} from "@/lib/contracts";
import { useSigner } from "@/lib/signer";
import { rememberSecret } from "@/lib/secrets";
import { Button, Card, Field, Input } from "./ui";

type State = { kind: "idle" } | { kind: "creating" } | { kind: "error"; message: string };

const POLICIES: { value: ForfeitPolicy["tag"]; label: string; hint: string }[] = [
  {
    value: "SplitAmongAttendees",
    label: "Split among people who show",
    hint: "No-shows' deposits are shared out between everyone who checked in.",
  },
  {
    value: "ToOrganizer",
    label: "Comes to me",
    hint: "No-shows' deposits go to you when you finalize the event.",
  },
];

export function CreateEvent() {
  const router = useRouter();
  const signer = useSigner();
  const [deposit, setDeposit] = useState("10");
  const [capacity, setCapacity] = useState("10");
  const [policy, setPolicy] = useState<ForfeitPolicy["tag"]>("SplitAmongAttendees");
  const [state, setState] = useState<State>({ kind: "idle" });

  const depositError =
    deposit.length > 0 && !/^\d+(\.\d{1,7})?$/.test(deposit.trim())
      ? "Enter an amount with at most 7 decimals."
      : null;
  const capacityError =
    capacity.length > 0 && !/^[1-9]\d*$/.test(capacity.trim())
      ? "Enter a whole number of spots."
      : null;

  const capacityNum = /^[1-9]\d*$/.test(capacity.trim()) ? Number(capacity.trim()) : 0;
  const poolStroops = FEE_ALLOWANCE_STROOPS * BigInt(capacityNum || 0);

  const canCreate =
    !!signer.publicKey &&
    !depositError &&
    !capacityError &&
    deposit.trim().length > 0 &&
    capacityNum > 0 &&
    state.kind !== "creating";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer.publicKey || !canCreate) return;
    setState({ kind: "creating" });
    try {
      const secret = generateSecret();
      const codeHash = await hashSecret(secret);

      const tx = await factory(signer).create_event({
        organizer: signer.publicKey,
        token: NATIVE_SAC,
        deposit: toStroops(deposit),
        fee_allowance: FEE_ALLOWANCE_STROOPS,
        capacity: capacityNum,
        code_hash: codeHash,
        policy: { tag: policy, values: undefined } as ForfeitPolicy,
      });
      const sent = await tx.signAndSend();
      const eventId = sent.result.unwrap();

      // The chain only ever sees sha256(secret); the organizer holds the only
      // copy of the secret itself, so it has to survive this navigation.
      rememberSecret(eventId, secret);
      router.push(`/e/${eventId}`);
    } catch (err) {
      setState({ kind: "error", message: friendlyContractError(err) });
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-bold tracking-tight">New event</h2>
      <p className="mt-1 text-sm text-muted">
        Set the deposit and how many people can reserve a spot.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <Field label="Deposit per person (XLM)" error={depositError}>
          <Input
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            placeholder="10"
            inputMode="decimal"
          />
        </Field>

        <Field label="Maximum people" error={capacityError}>
          <Input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="10"
            inputMode="numeric"
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            If someone doesn&apos;t show
          </legend>
          {POLICIES.map((p) => (
            <label
              key={p.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                policy === p.value
                  ? "border-accent bg-surface-2"
                  : "border-border-strong hover:border-muted"
              }`}
            >
              <input
                type="radio"
                name="policy"
                value={p.value}
                checked={policy === p.value}
                onChange={() => setPolicy(p.value)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-semibold text-foreground">{p.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{p.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-2 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" />
          <p className="text-xs text-muted">
            You&apos;ll fund <strong className="text-foreground">{fromStroops(poolStroops)} XLM</strong>{" "}
            now — {fromStroops(FEE_ALLOWANCE_STROOPS)} XLM per spot — so nobody pays to
            attend: each guest gets that back on top of their deposit when they check in.
            Whatever isn&apos;t used comes back to you when you finalize.
          </p>
        </div>

        <Button type="submit" size="lg" fullWidth disabled={!canCreate} loading={state.kind === "creating"}>
          <CalendarPlus className="size-4" />
          {state.kind === "creating" ? "Creating…" : "Create event"}
        </Button>
      </form>

      {state.kind === "error" && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-surface-2 p-3 text-sm text-danger">
          {state.message}
        </p>
      )}
    </Card>
  );
}
