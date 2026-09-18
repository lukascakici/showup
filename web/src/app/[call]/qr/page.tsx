import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { rollCallBySlug } from "@/lib/roll-call";
import { SITE_URL } from "@/lib/links";
import { QrCode } from "@/components/QrCode";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The sheet that gets printed and taped to a wall.
 *
 * The URL is written out underneath the code in full, at a size somebody can
 * read across a room, because the code is the fast path and not the only one:
 * a camera that will not focus, a phone with no scanner, a person standing too
 * far back. Typing it has to stay possible, which is also why the slug is one
 * segment at the top level rather than buried under a prefix.
 */
export default async function RollCallQrPage({
  params,
}: {
  params: Promise<{ call: string }>;
}) {
  const { call: slug } = await params;
  const call = rollCallBySlug(slug);
  if (!call) notFound();

  const url = `${SITE_URL}/${call.slug}`;

  return (
    <div className="flex flex-col items-center gap-8 py-8 text-center">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{call.title}</h1>
        <p className="mt-2 text-sm text-muted">Scan to say you&apos;re here</p>
      </div>

      <QrCode value={url} size={320} label={`Roll call for ${call.title}`} />

      <p className="break-all font-mono text-lg sm:text-xl">{url}</p>

      <p className="max-w-sm text-sm text-muted">
        Connect a wallet, tap Join. No deposit, nothing to sign, no transaction.
      </p>
    </div>
  );
}
