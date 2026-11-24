"use client";

import Link from "next/link";
import { formatMoment } from "@/lib/format";
import { Who } from "./Who";
import type { EventDescription as Description } from "@/lib/event-description";

/**
 * The event in its organizer's own words.
 *
 * **Deliberately outside the reservation panel.** Everything in that panel — the
 * deposit, the capacity, who may reserve, where a forfeit goes — was read off a
 * contract and is true whoever reads it. This is the one thing on the page that
 * somebody typed, so it does not share a border with any of that. A reader who
 * cannot tell which half of a page is enforced has been told something false by
 * the layout.
 *
 * It is attributed for the same reason, and the attribution links to the
 * author's own record: the question a description raises is "who is telling me
 * this", and this app can answer it with a page full of their attendance.
 *
 * Rendered as text, never as markup. `whitespace-pre-wrap` keeps the line breaks
 * people type for lists of what to bring, which is most of what was asked for,
 * and keeps everything else inert — a link in a description would be a phishing
 * surface on a page where somebody is about to sign a transaction.
 */
export function EventDescription({ description }: { description: Description | null }) {
  if (!description) return null;

  const edited = (description.history?.length ?? 0) > 0;

  return (
    <section className="mt-6" aria-label="About this event">
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground-2">
        {description.body}
      </p>

      <p className="mt-3 text-[13px] text-muted-2">
        Described by{" "}
        <Link
          href={`/u/${description.authoredBy}`}
          className="underline decoration-border-hover underline-offset-2 transition-colors hover:text-foreground-2"
        >
          <Who address={description.authoredBy} />
        </Link>
        {/* Said only when it is true, and said plainly. A description rewritten
            after somebody reserved is a changed offer against an unchanged
            contract — the contract cannot be edited and this can, so the page
            owes the reader that difference. */}
        {edited ? ` · edited ${formatMoment(description.updatedAt)}` : ""}
      </p>
    </section>
  );
}
