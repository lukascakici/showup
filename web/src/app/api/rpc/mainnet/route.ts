import { NextResponse } from "next/server";

/**
 * Soroban RPC for Mainnet, proxied so the provider key never reaches a browser.
 *
 * Testnet needs nothing like this: `soroban-testnet.stellar.org` is free and
 * keyless, so the URL can sit in the client bundle and be nobody's problem.
 * Mainnet has no SDF equivalent — every provider authenticates, and ours does it
 * with an API key **inside the URL**. Next.js only exposes `NEXT_PUBLIC_*` to the
 * browser, which is exactly the point: that URL cannot be one of them.
 *
 * It isn't a theoretical leak. The Firebase project id, a legitimately public
 * value, is sitting in a `/_next/static/chunks/*.js` on the live site right now —
 * that is what `NEXT_PUBLIC_` means, and a scraped RPC key would be drained or
 * rate-limited on our account, with the first symptom being the Mainnet site
 * unable to read the chain.
 *
 * Moving a credential one hop is not security on its own, so this is deliberately
 * **narrower than the upstream it fronts**:
 *
 * - **POST only**, and only the twelve methods the Stellar SDK actually emits. Our
 *   key cannot be borrowed as a general-purpose Stellar RPC.
 * - **A body ceiling**, because a proxy that forwards anything is a way to spend
 *   somebody else's quota by the megabyte.
 * - **No batching.** The JSON-RPC spec allows an array of calls in one request;
 *   allowing it here would mean one request costing a thousand upstream calls and
 *   make any per-request limit meaningless.
 * - **Nothing cached, nothing logged.** A request body carries a signed
 *   transaction envelope on its way to `sendTransaction`.
 *
 * What this does *not* do is stop someone calling this route directly — it is a
 * public path on a public site, as it has to be for the browser to use it. What it
 * buys is that the key stays ours: it can be rotated, throttled and attributed in
 * one place, rather than living in every visitor's cache forever.
 */

/** Server-only, and absent by design on a deployment that doesn't serve Mainnet. */
const UPSTREAM = process.env.MAINNET_RPC_URL;

/**
 * Exactly the methods `rpc.Server` can send, and nothing else.
 *
 * Taken from the SDK's own source rather than from the set we happen to call
 * today: a narrower list breaks the moment the SDK adds a call to an existing
 * code path, and it would break in production, on Mainnet, as a read failure.
 */
const ALLOWED = new Set([
  "getEvents",
  "getFeeStats",
  "getHealth",
  "getLatestLedger",
  "getLedgerEntries",
  "getLedgers",
  "getNetwork",
  "getTransaction",
  "getTransactions",
  "getVersionInfo",
  "sendTransaction",
  "simulateTransaction",
]);

/**
 * 512 KB. A `simulateTransaction` carrying a large contract call is the biggest
 * legitimate body here and is far under this; an upload would be far over, and
 * uploads do not go through a browser.
 */
const MAX_BODY_BYTES = 512 * 1024;

/** The upstream's own answers are the only thing a caller should be able to read. */
function rpcError(id: unknown, code: number, message: string, status: number) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

export async function POST(request: Request) {
  if (!UPSTREAM) {
    // The same shape as `/api/session` with no secret: refuse on absence rather
    // than fall through to something that looks like it worked. A deployment
    // without this configured is one that does not serve Mainnet, and
    // `networks.ts` already treats that as "Mainnet is not live".
    return rpcError(null, -32000, "Mainnet RPC is not configured on this deployment.", 503);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return rpcError(null, -32600, "Request too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return rpcError(null, -32700, "Parse error.", 400);
  }

  // A JSON-RPC batch is a bare array. Refused rather than unpacked: the point of
  // the method allowlist is a bounded cost per request, and a batch is unbounded.
  if (Array.isArray(body)) {
    return rpcError(null, -32600, "Batched requests are not accepted here.", 400);
  }

  const call = body as { id?: unknown; method?: unknown };
  if (typeof call?.method !== "string" || !ALLOWED.has(call.method)) {
    return rpcError(
      call?.id,
      -32601,
      // Named, so a genuine SDK upgrade that adds a method is diagnosable from
      // the response instead of looking like the network being down.
      `Method ${typeof call?.method === "string" ? call.method : "(none)"} is not proxied.`,
      400,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw,
      // Never cached: every method here is either a live read or a submission.
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    // The upstream URL must never appear in an error a caller can read — it is
    // the credential. This is the whole reason the message is written by hand.
    console.error("[rpc/mainnet] upstream failed:", e instanceof Error ? e.message : e);
    return rpcError(call.id, -32603, "Couldn't reach the Stellar network.", 502);
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
