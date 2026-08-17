import type { Metadata } from "next";
import { Suspense } from "react";
import { loadEvent } from "@/lib/chain";
import { eventPreview, FALLBACK_PREVIEW, OG_IMAGE_PATH, SITE_NAME } from "@/lib/og";
import { inviteUrl } from "@/lib/links";
import { EventPageBody } from "./EventPageBody";

/**
 * A link preview is worth having and never worth waiting for.
 *
 * `loadEvent` fans four RPC calls out at once, and Soroban Testnet is a public
 * endpoint that occasionally takes seconds. This read sits in front of the HTML
 * response, so a slow ledger would hold up the page for a guest who is going to
 * get the live version client-side anyway. Past the timeout the generic preview
 * ships and the page carries on loading as it always did.
 */
const PREVIEW_TIMEOUT_MS = 2_500;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("preview read timed out")), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const preview = await withTimeout(loadEvent(id), PREVIEW_TIMEOUT_MS)
    .then(eventPreview)
    .catch(() => FALLBACK_PREVIEW);

  return {
    title: preview.title,
    description: preview.description,
    // Canonical and `og:url` are the invite link, never the URL that was
    // actually fetched. A check-in link carries the secret in its query string,
    // and echoing that back into a shareable tag would put it one "copy link
    // address" away from the group chat it must never reach.
    alternates: { canonical: inviteUrl(id) },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: inviteUrl(id),
      title: preview.title,
      description: preview.description,
      images: [OG_IMAGE_PATH],
    },
    twitter: {
      card: "summary_large_image",
      title: preview.title,
      description: preview.description,
      images: [OG_IMAGE_PATH],
    },
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // `useSearchParams` suspends, and the boundary has to be here rather than
  // inside the client component: React needs it above the component that reads.
  return (
    <Suspense fallback={null}>
      <EventPageBody id={id} />
    </Suspense>
  );
}
