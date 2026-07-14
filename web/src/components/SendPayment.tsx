"use client";

import { useState } from "react";
import { Send, ExternalLink, CheckCircle2, Copy, Check } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { sendPayment, friendlyTxError, EXPLORER_TX } from "@/lib/stellar";
import { isValidAddress, isValidAmount, shortAddr } from "@/lib/format";
import { Button, Card, Field, Input } from "./ui";

type TxState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success"; hash: string }
  | { kind: "error"; message: string };

export function SendPayment() {
  const { address, sign, refreshBalance } = useWallet();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  const toError =
    to.length > 0 && !isValidAddress(to) ? "Enter a valid Stellar address (G…)." : null;
  const amountError =
    amount.length > 0 && !isValidAmount(amount) ? "Enter a positive amount." : null;
  const canSend =
    !!address && isValidAddress(to) && isValidAmount(amount) && tx.kind !== "sending";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !canSend) return;
    setTx({ kind: "sending" });
    try {
      const hash = await sendPayment({
        from: address,
        to: to.trim(),
        amount: amount.trim(),
        sign,
      });
      setTx({ kind: "success", hash });
      setTo("");
      setAmount("");
      refreshBalance();
    } catch (err) {
      setTx({ kind: "error", message: friendlyTxError(err) });
    }
  };

  const copyHash = async (hash: string) => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <h2 className="text-lg font-bold tracking-tight">Send XLM</h2>
      <p className="mt-1 text-sm text-muted">
        Move a deposit to any Testnet address.
      </p>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <Field label="Recipient address" error={toError}>
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="G…"
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        <Field label="Amount (XLM)" error={amountError}>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
        </Field>

        <Button type="submit" size="lg" fullWidth disabled={!canSend} loading={tx.kind === "sending"}>
          <Send className="size-4" />
          {tx.kind === "sending" ? "Sending…" : "Send payment"}
        </Button>
      </form>

      {tx.kind === "success" && (
        <div className="mt-5 rounded-xl border border-accent/40 bg-surface-2 p-4">
          <div className="flex items-center gap-2 text-accent">
            <CheckCircle2 className="size-5" />
            <span className="font-semibold">Payment sent</span>
          </div>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Transaction hash
            </span>
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs text-foreground">
                {shortAddr(tx.hash, 10, 10)}
              </code>
              <button
                onClick={() => copyHash(tx.hash)}
                className="text-muted hover:text-foreground transition-colors"
                aria-label="Copy transaction hash"
              >
                {copied ? (
                  <Check className="size-3.5 text-accent" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>
            <a
              href={EXPLORER_TX(tx.hash)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-accent hover:underline"
            >
              View on Explorer
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>
      )}

      {tx.kind === "error" && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-surface-2 p-3 text-sm text-danger">
          {tx.message}
        </p>
      )}
    </Card>
  );
}
