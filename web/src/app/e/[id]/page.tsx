"use client";

import Link from "next/link";
import { use } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { EventDetail } from "@/components/EventDetail";
import { shortAddr } from "@/lib/format";

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

      <section>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Event</h1>
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-mono text-sm text-muted transition-colors hover:text-accent"
        >
          {shortAddr(id, 8, 8)}
          <ExternalLink className="size-3.5" />
        </a>
      </section>

      <EventDetail id={id} linkSecret={linkSecret} />
    </div>
  );
}
