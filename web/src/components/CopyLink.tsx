"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type State = "idle" | "copied" | "failed";

/**
 * A link, shown in full and copyable in one tap.
 *
 * Two things this fixes over the version that used to live inline in
 * EventDetail. The copy button was a bare 16px icon — under half the 44px a
 * thumb needs, on what is the organizer's most important action. And
 * `navigator.clipboard.writeText` was called unguarded: it rejects on an
 * insecure origin or a denied permission, and the button simply did nothing,
 * silently, which reads as a broken app rather than a blocked API.
 *
 * When it can't copy it says so and leaves the link selectable, because the
 * fallback is the user's own hands and they need to know that's now the plan.
 */
export function CopyLink({ url, label }: { url: string; label: string }) {
  const [state, setState] = useState<State>("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 rounded-xl border border-border-strong bg-surface-2 pl-3">
        <code className="min-w-0 flex-1 select-all truncate font-mono text-xs text-foreground">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={label}
          className="flex size-11 shrink-0 items-center justify-center rounded-r-xl text-muted transition-colors hover:text-foreground"
        >
          {state === "copied" ? (
            <Check className="size-4 text-accent" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
      {state === "failed" && (
        <p className="text-xs text-danger">
          Couldn&apos;t reach the clipboard. Select the link above and copy it.
        </p>
      )}
    </div>
  );
}
