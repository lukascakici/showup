"use client";

/**
 * The organizer's check-in secrets.
 *
 * The chain only ever stores sha256(secret) — that's what makes holding the
 * secret proof of being at the event. The flip side is that the organizer's
 * browser holds the only copy, so clearing site data loses the ability to run
 * check-in for that event. The UI says so at the point it matters, and the
 * secret is also embedded in the check-in link, which is a second copy the
 * moment it's shared.
 */

const KEY = "showup:secrets";

type Store = Record<string, string>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

export function rememberSecret(eventId: string, secret: string): void {
  if (typeof window === "undefined") return;
  const store = read();
  store[eventId] = secret;
  window.localStorage.setItem(KEY, JSON.stringify(store));
}

export function recallSecret(eventId: string): string | null {
  return read()[eventId] ?? null;
}
