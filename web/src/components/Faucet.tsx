"use client";

import { useState } from "react";
import { Droplets } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { fundWithFriendbot, errMessage } from "@/lib/stellar";
import { Button } from "./ui";

/**
 * Three tones, because two collapsed a real failure into an FYI.
 *
 * "Already funded" and "the faucet is down" were both rendered in the same muted
 * grey, so an exception looked like a note. `info` is the benign one; `error` is
 * the one that means the next step won't work.
 */
type FaucetMsg = { tone: "ok" | "info" | "error"; text: string } | null;

const TONE = {
  ok: "text-accent",
  info: "text-muted",
  error: "text-danger",
} as const;

/**
 * The faucet, wherever someone needs it.
 *
 * It used to exist only inside the wallet menu, behind a chip in the top bar —
 * two taps and a guess away from the person who needs it, which is someone who
 * has just been told their reservation can't go through. It is a component now
 * so the reserve card can put it directly under the sentence explaining why.
 */
export function FaucetButton({
  size = "md",
  label = "Request test XLM",
}: {
  size?: "md" | "lg";
  label?: string;
}) {
  const { address, refreshBalance } = useWallet();
  const [funding, setFunding] = useState(false);
  const [message, setMessage] = useState<FaucetMsg>(null);

  if (!address) return null;

  const request = async () => {
    setFunding(true);
    setMessage(null);
    try {
      const result = await fundWithFriendbot(address);
      await refreshBalance();
      setMessage(
        result === "funded"
          ? { tone: "ok", text: "Funded — 10,000 test XLM added." }
          : {
              tone: "info",
              // Not a workaround anyone can guess at: Friendbot creates an
              // account, it doesn't top one up. Saying so is the difference
              // between a dead end and knowing to ask the organizer.
              text:
                "Friendbot only funds an account once, and this one already exists. " +
                "Ask the organizer to send you some, or use a fresh account.",
            },
      );
    } catch (e) {
      setMessage({ tone: "error", text: errMessage(e) || "Faucet request failed." });
    } finally {
      setFunding(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size={size} fullWidth onClick={request} loading={funding}>
        <Droplets className="size-4" />
        {label}
      </Button>
      {message && <p className={`mt-2 text-xs ${TONE[message.tone]}`}>{message.text}</p>}
    </>
  );
}
