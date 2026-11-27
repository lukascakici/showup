"use client";

import { useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useNetwork } from "@/lib/network-context";
import {
  loadLocalWallet,
  secretFileBody,
  secretFileName,
} from "@/lib/local-wallet";
import { Button } from "./ui";

/**
 * The recovery key for an in-app wallet, and the only copy of it.
 *
 * ## Why this reads storage itself
 *
 * The secret is **not** in the wallet context and must not be. Every component
 * in the app consumes that context, so putting a private key on it would hand
 * the key to every screen that wanted a balance. This reads it from
 * `local-wallet.ts` at the moment somebody asks to see it, and holds it in this
 * component's state for as long as the panel is open.
 *
 * ## Hidden until asked for
 *
 * Not out of ceremony — this panel is reachable from the wallet menu, which
 * people open in front of other people and on shared screens. A key that is
 * visible by default is a key that gets shoulder-surfed, and the one above the
 * fold on a phone gets screenshotted by accident.
 *
 * ## Why the warning is phrased as it is
 *
 * "Showup never had a copy" is literally true and it is the part that changes
 * behaviour. "Back up your key" is advice anybody can defer; "nobody can send
 * you another one" is a fact about what happens if they do.
 */
export function LocalWalletKey({ compact = false }: { compact?: boolean }) {
  const network = useNetwork();
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reveal = () => {
    const wallet = loadLocalWallet(network);
    if (!wallet) {
      // Reachable if the key was cleared in another tab between this panel
      // rendering and the button being pressed. Said rather than left blank.
      setProblem("This browser no longer has a key stored for this network.");
      return;
    }
    setProblem(null);
    setSecret(wallet.secret);
  };

  const hide = () => {
    setSecret(null);
    setCopied(false);
    setCopyFailed(false);
  };

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard rejects on an insecure origin or a denied permission. The
      // key is already on screen, so the fallback is simply to say so — the text
      // below is selectable.
      setCopyFailed(true);
    }
  };

  /**
   * Download as a plain text file, built in the browser.
   *
   * A blob URL rather than a link to anything: the secret never leaves this tab,
   * which is the claim the warning makes and this is what makes it true.
   */
  const download = () => {
    const wallet = loadLocalWallet(network);
    if (!wallet) {
      setProblem("This browser no longer has a key stored for this network.");
      return;
    }
    try {
      const blob = new Blob([secretFileBody(wallet)], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = secretFileName(wallet.publicKey);
      link.click();
      // Released on the next tick rather than immediately: revoking before the
      // browser has started reading the blob cancels the download in Safari.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setProblem("Couldn’t build the file. Copy the key instead.");
    }
  };

  return (
    <div>
      {!compact && (
        <div className="flex gap-3 rounded-xl border border-border bg-surface-2 p-4">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-soft" />
          <div className="text-xs leading-relaxed text-foreground-2">
            <p className="font-medium text-foreground">
              This key lives in this browser and nowhere else.
            </p>
            <p className="mt-1.5 text-muted">
              Showup never had a copy of it and cannot send you another. Clear your
              browser data and the wallet — and anything it holds — is gone.
            </p>
          </div>
        </div>
      )}

      {secret === null ? (
        <Button
          variant="secondary"
          fullWidth
          className={compact ? "" : "mt-3"}
          onClick={reveal}
        >
          <Eye className="size-4" />
          Show recovery key
        </Button>
      ) : (
        <div className={compact ? "" : "mt-3"}>
          {/* `select-all` so one tap selects the whole thing where the clipboard
              is unavailable, and `break-all` because a 56-character string with
              no spaces in it will otherwise push the panel off a phone. */}
          <code className="block select-all break-all rounded-xl border border-border-strong bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {secret}
          </code>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => void copy()}>
              {copied ? (
                <Check className="size-4 text-success" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="secondary" fullWidth onClick={download}>
              <Download className="size-4" />
              Save file
            </Button>
          </div>
          <button
            onClick={hide}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            <EyeOff className="size-3.5" />
            Hide it again
          </button>
        </div>
      )}

      {copyFailed && (
        <p className="mt-2 text-xs text-muted">
          Couldn’t reach the clipboard. Select the key above, or save the file.
        </p>
      )}
      {problem && <p className="mt-2 text-xs text-danger">{problem}</p>}
    </div>
  );
}
