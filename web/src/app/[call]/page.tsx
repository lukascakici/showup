import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { rollCallBySlug } from "@/lib/roll-call";
import { RollCall } from "@/components/RollCall";
import { RollCallWelcome } from "@/components/RollCallWelcome";

/**
 * A roll call at the top level: `showup.click/prohackathon_residency`.
 *
 * This is the last route Next tries. Every static segment (`/create`, `/e/…`,
 * `/api/…`) is matched first, so a one-segment path that is not a known roll
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
    // Linked from the home page while it is open, and still kept out of search:
    // this is one afternoon in one room, and the page outlives it by years. A
    // dated roll call surfacing in results long afterwards is noise, and the
    // list of who turned up is nobody's search result.
    robots: { index: false, follow: false },
  };
}

export default async function RollCallPage({ params }: { params: Promise<{ call: string }> }) {
  const { call: slug } = await params;
  const call = rollCallBySlug(slug);
  if (!call) notFound();

  return (
    <>
      <RollCallWelcome call={call} />
      <RollCall call={call} />
    </>
  );
}
