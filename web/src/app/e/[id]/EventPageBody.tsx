"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EventDetail } from "@/components/EventDetail";
import { CHECK_IN_PARAM } from "@/lib/links";

/**
 * The client half of the event page.
 *
 * Split out so `page.tsx` can stay a server component and export
 * `generateMetadata` — a `"use client"` module cannot, which is why an invite
 * link previewed as a bare URL for the whole of weeks 1 to 3.
 */
export function EventPageBody({ id }: { id: string }) {
  const search = useSearchParams();
  const linkSecret = search.get(CHECK_IN_PARAM);

  return (
    <div className="flex flex-col gap-6">
      {/* The padding and the matching negative margin grow the hit area to a
          thumb's width without moving anything on the page. */}
      <Link
        href="/"
        className="-my-3 inline-flex w-fit items-center gap-1.5 py-3 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Events
      </Link>

      {/* The heading lives in EventDetail: it is the event's own name, and only
          the component that loads the event knows it. */}
      <EventDetail id={id} linkSecret={linkSecret} />
    </div>
  );
}
