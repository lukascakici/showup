"use client";

import Link from "next/link";
import { use } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EventDetail } from "@/components/EventDetail";

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const linkSecret = search.get("c");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
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
