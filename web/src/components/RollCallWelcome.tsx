"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { RollCall } from "@/lib/roll-call";
import { Button } from "./ui";

/** No subscription: nothing outside this component changes the answer. */
const noChanges = () => () => {};

/** Rendered as nothing on the server, so the client is free to read storage. */
const serverSnapshot = () => true;

const key = (slug: string) => `showup.welcome.${slug}`;

/**
 * Whether this browser has already been greeted.
 *
 * Wrapped because `localStorage` is not merely empty in a locked-down browser,
 * it throws on access. Losing the record means being welcomed twice, which is
 * the correct way for this to fail.
 */
function greeted(slug: string): boolean {
  try {
    return localStorage.getItem(key(slug)) !== null;
  } catch {
    return false;
  }
}

function remember(slug: string) {
  try {
    localStorage.setItem(key(slug), "1");
  } catch {
    // Nothing to do. The visitor sees the greeting again next time, and the
    // greeting is a greeting.
  }
}

/**
 * The first thing somebody sees after scanning the code on the wall.
 *
 * They have just walked in, so this says hello before it says anything about
 * wallets. It is a real modal rather than a banner because the point is that it
 * is the only thing on screen for a second: the page behind it is a list of
 * addresses, which is not a welcome.
 *
 * Shown once per browser. Somebody who opens the page again to see who else has
 * arrived is no longer arriving, and greeting them a second time would say the
 * page had not noticed.
 */
export function RollCallWelcome({ call }: { call: RollCall }) {
  // The server snapshot is `true`, so the server renders nothing and the browser
  // decides. Reading storage during render would put a greeting in the HTML for
  // somebody who has already dismissed it, then snatch it away on hydration.
  const seen = useSyncExternalStore(noChanges, () => greeted(call.slug), serverSnapshot);
  const [dismissed, setDismissed] = useState(false);

  const open = !!call.greeting && !seen && !dismissed;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        remember(call.slug);
        setDismissed(true);
      }
    };
    document.addEventListener("keydown", onKey);
    // Keep the list behind from scrolling under the panel.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, call.slug]);

  if (!open || !call.greeting) return null;

  const close = () => {
    remember(call.slug);
    setDismissed(true);
  };

  return (
    <div
      // Anywhere outside the panel dismisses it. A greeting nobody can get past
      // is not a greeting, and the only instruction on screen is one word on a
      // button somebody may already be tapping around.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="welcome-scrim fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roll-call-welcome-title"
    >
      <div className="welcome-panel w-full max-w-sm rounded-2xl border border-border-strong bg-surface p-6 shadow-2xl shadow-black/60">
        <h2
          id="roll-call-welcome-title"
          className="font-display text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-balance"
        >
          {call.greeting.title}
        </h2>
        <p className="mt-2 text-sm text-muted-2">{call.title}</p>
        <p className="mt-4 text-[15px] leading-[1.6] text-muted text-pretty">
          {call.greeting.line}
        </p>
        {/* One way out, and it is the size of a thumb: somebody is holding a
            phone in a crowded room with one hand. `autoFocus` moves the keyboard
            into the dialog, which is the only thing standing between a screen
            reader and the list of addresses behind it. */}
        <Button autoFocus onClick={close} size="lg" fullWidth className="mt-6">
          Let&apos;s go
        </Button>
      </div>
    </div>
  );
}
