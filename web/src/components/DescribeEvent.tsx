"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { describeEvent } from "@/lib/describe-event";
import {
  DESCRIPTION_PROBLEMS,
  MAX_DESCRIPTION_LENGTH,
  descriptionProblem,
  type EventDescription,
} from "@/lib/event-description";
import { Button, ErrorNote, Field, Panel } from "./ui";

type State = { kind: "idle" | "busy" | "done" } | { kind: "error"; message: string };

/**
 * Describe your own event, in your own words.
 *
 * Rendered only when the connected wallet is one of the event's hosts — and that
 * list comes from the chain, by way of the event the page already loaded. There
 * is no version of this for a guest: the server refuses a write from anybody not
 * on the host list, and offering the field anyway would be inviting an attempt
 * it already knows will fail. The same shape as `NameYourself`, for the same
 * reason.
 *
 * The wallet prompt is explained *before* it appears. A signature request with
 * no reason given is how people learn to approve things without reading them,
 * and this one is genuinely unusual: a transaction that will never be submitted.
 */
export function DescribeEvent({
  eventId,
  hosts,
  description,
}: {
  eventId: string;
  hosts: string[];
  description: EventDescription | null;
}) {
  const { address, sign } = useWallet();
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  if (!address || !hosts.includes(address)) return null;

  // `null` means untouched, so the field shows what is already saved without an
  // effect to seed it.
  const value = draft ?? description?.body ?? "";
  const clearing = value.trim().length === 0;
  const problem = clearing ? null : descriptionProblem(value);
  const unchanged = value === (description?.body ?? "");

  const save = async () => {
    setState({ kind: "busy" });
    try {
      await describeEvent(eventId, address, clearing ? "" : value, sign);
      setState({ kind: "done" });
      // What the guest reads is rendered on the server, so showing the new text
      // is a refresh rather than local state — the same reason `NameYourself`
      // refreshes.
      router.refresh();
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Couldn't save that.",
      });
    }
  };

  return (
    <Panel title="Describe this event" meta="HOSTS ONLY" className="mt-8">
      <p className="text-sm leading-relaxed text-muted">
        Whatever a guest needs to know that the contract does not say: where the
        door is, what to bring, who it is for. It appears under the title, and it
        is shown as your words with your name on it.
      </p>

      <div className="mt-4">
        <Field
          label="Description"
          hint={
            problem
              ? DESCRIPTION_PROBLEMS[problem]
              : clearing && description
                ? "Saving it empty removes the description."
                : `${value.trim().length} of ${MAX_DESCRIPTION_LENGTH} characters. Everyone can see it.`
          }
        >
          <textarea
            value={value}
            onChange={(e) => {
              setDraft(e.target.value);
              setState({ kind: "idle" });
            }}
            rows={6}
            placeholder="Kapı arkada. Krampon getir."
            // Past the limit rather than at it: a hard stop mid-word reads as a
            // broken keyboard, while the hint above counts up and the button
            // refuses. `descriptionProblem` is the thing that decides.
            maxLength={MAX_DESCRIPTION_LENGTH * 2}
            // 16px, like every other input here: anything smaller makes iOS zoom
            // the page on focus and leave it zoomed.
            className="w-full resize-y rounded-xl border border-border-strong bg-surface-2 px-3.5 py-3 text-base leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-3 focus:border-border-hover"
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
          <Pencil className="size-4" />
          {clearing && description ? "Remove the description" : "Save description"}
        </Button>
      )}

      {state.kind === "error" && <ErrorNote>{state.message}</ErrorNote>}

      <p className="mt-4 text-xs leading-relaxed text-muted-2">
        Your wallet will ask you to sign.{" "}
        <strong className="text-foreground-2">Nothing is sent and no fee is paid</strong>{" "}
        — it is a transaction built only to be signed, which is how this proves you
        hold a host&apos;s wallet. Signing a message would have been simpler, and one
        of the four wallets Showup supports cannot do it.
      </p>
    </Panel>
  );
}
