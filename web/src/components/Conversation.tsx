"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { forgetSession, openSession, storedSession, watchSession } from "@/lib/session";
import { MESSAGE_MAX_LENGTH, messageProblem, MESSAGE_PROBLEMS, type Message } from "@/lib/messages";
import { formatMoment } from "@/lib/format";
import { usePolled } from "@/lib/polled";
import { Button, ErrorNote, Panel, Skeleton } from "./ui";
import { Identicon } from "./Identicon";
import { Who } from "./Who";

/** Nothing on the server, so the browser is free to read storage. */
const noServerSession = () => null;

type Thread = { messages: Message[]; isHost: boolean };

/**
 * The thread for one event, for the people holding a spot in it.
 *
 * Membership is not decided here. Every request carries a wallet session and the
 * server checks it against the **contract's** reserved and checked-in lists, so this
 * component can be wrong about who belongs without that mattering — which is the
 * only safe way to build a members-only surface. What it has to get right is saying
 * so honestly when it is refused: "this is for the people holding a spot" and "we
 * couldn't check the guest list" are different sentences, and flattening them would
 * tell some people they were turned away when they were not.
 *
 * Opening it costs one wallet prompt, explained before it happens. After that the
 * session lasts for the tab.
 *
 * The token is read through `useSyncExternalStore` rather than an effect, so the
 * server renders nothing and the browser decides — the same shape `RollCallWelcome`
 * uses, and the reason there is no state to synchronise on mount.
 */
export function Conversation({ id, canTakePart }: { id: string; canTakePart: boolean }) {
  const { address, sign } = useWallet();

  // Watched, not sampled: `openSession` and `forgetSession` both notify, so there
  // is exactly one copy of the token and an expiry cannot leave a dead one behind.
  const token = useSyncExternalStore(
    watchSession,
    () => (address ? storedSession(address) : null),
    noServerSession,
  );
  const [opening, setOpening] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // Captured for the loader, which runs outside the render that checked it.
  const who = address ?? "";

  const load = useCallback(async (): Promise<Thread | null> => {
    if (!token) return null;
    const response = await fetch(`/api/events/${id}/messages`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      // The token expired under us. Clearing it here, in the loader, turns the
      // panel back into its "open it" state — which is something the reader can
      // act on — rather than leaving it retrying a request that cannot succeed.
      forgetSession(who);
      throw new Error("That session has expired. Open it again to read along.");
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Couldn't load the conversation.");
    }
    return (await response.json()) as Thread;
  }, [id, token, who]);

  const { data: thread, error, refresh } = usePolled(load, 10_000);

  if (!canTakePart || !address) return null;

  const open = async (fresh = false) => {
    setOpening(true);
    setRefused(null);
    try {
      await openSession(address, sign, { fresh });
    } catch (e) {
      setRefused(e instanceof Error ? e.message : "Couldn't open the conversation.");
    } finally {
      setOpening(false);
    }
  };

  const problem = draft.trim().length === 0 ? null : messageProblem(draft);

  const send = async () => {
    if (!token) return;
    setSending(true);
    setRefused(null);
    try {
      const response = await fetch(`/api/events/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: draft }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setRefused(body.error ?? "Couldn't send that.");
        return;
      }
      setDraft("");
      await refresh();
    } finally {
      setSending(false);
    }
  };

  const remove = async (messageId: string) => {
    if (!token) return;
    await fetch(`/api/events/${id}/messages?message=${messageId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    await refresh();
  };

  const isHost = thread?.isHost ?? false;

  return (
    <Panel
      title="Conversation"
      meta={isHost ? "YOU HOST THIS" : "GUESTS AND HOSTS"}
      className="mt-8"
    >
      {!token ? (
        <>
          <p className="text-sm leading-relaxed text-muted">
            A thread for the people who have a spot here. Opening it asks your wallet
            for one signature so the server knows which wallet is writing.{" "}
            <strong className="font-medium text-foreground-2">
              Nothing is sent and no fee is paid
            </strong>{" "}
            — it is a transaction built only to be signed.
          </p>
          {refused && <ErrorNote>{refused}</ErrorNote>}
          <Button
            variant="secondary"
            fullWidth
            className="mt-4"
            loading={opening}
            onClick={() => void open()}
          >
            <MessageSquare className="size-4" />
            Open the conversation
          </Button>
        </>
      ) : error && !thread ? (
        <>
          {/* The server's own words, because it distinguishes "you aren't in this
              event" from "we couldn't check", and only one of those is about the
              reader. */}
          <ErrorNote>{error}</ErrorNote>
          <Button variant="ghost" fullWidth className="mt-4" onClick={() => void open(true)}>
            Sign in again
          </Button>
        </>
      ) : !thread ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading the conversation">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : (
        <>
          {thread.messages.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing yet. Whoever is bringing the ball probably wants to say so.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {thread.messages.map((m) => (
                <li key={m.id} className="flex gap-3 py-3 first:pt-0">
                  <Identicon address={m.from} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Who address={m.from} className="text-sm text-foreground-2" />
                      <span className="text-xs text-muted-3">{formatMoment(m.at)}</span>
                    </div>
                    {/* `whitespace-pre-wrap` because people write lists of what to
                        bring, and `break-words` because they also paste links. */}
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                      {m.body}
                    </p>
                  </div>
                  {(isHost || m.from === address) && (
                    <button
                      onClick={() => void remove(m.id)}
                      aria-label="Delete this message"
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-3 transition-colors hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 border-t border-border pt-5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Say something to the people coming"
              rows={2}
              maxLength={MESSAGE_MAX_LENGTH * 2}
              aria-label="Your message"
              className="w-full resize-y rounded-xl border border-border-strong bg-surface px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-3 focus:border-accent"
            />
            {problem && <p className="mt-2 text-xs text-muted-2">{MESSAGE_PROBLEMS[problem]}</p>}
            {refused && <ErrorNote>{refused}</ErrorNote>}
            <Button
              fullWidth
              className="mt-3"
              disabled={!!problem || draft.trim().length === 0}
              loading={sending}
              onClick={() => void send()}
            >
              <Send className="size-4" />
              Send
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-muted-2">
              Everyone with a spot here can read this, and a host can remove anything
              on their own event. There are no direct messages.
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}
