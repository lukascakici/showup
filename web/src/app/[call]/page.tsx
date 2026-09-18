import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { rollCallBySlug } from "@/lib/roll-call";
import { RollCall } from "@/components/RollCall";

/**
 * A roll call at the top level: `showup.click/prohackathon_residency`.
 *
 * This is the last route Next tries — every static segment (`/create`, `/e/…`,
 * `/api/…`) is matched first — so a one-segment path that is not a known roll
 * call falls straight through to the ordinary 404 rather than being swallowed
 * here.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ call: string }>;
}): Promise<Metadata> {
  const { call: slug } = await params;
  const call = rollCallBySlug(slug);
  if (!call) return {};

  return {
    title: call.title,
    description: "Connect a wallet and say you're here. No deposit, nothing signed.",
    // Unlisted is the only privacy a printed link has, and a search engine
    // indexing it would remove even that.
    robots: { index: false, follow: false },
  };
}

export default async function RollCallPage({ params }: { params: Promise<{ call: string }> }) {
  const { call: slug } = await params;
  const call = rollCallBySlug(slug);
  if (!call) notFound();

  return <RollCall call={call} />;
}
