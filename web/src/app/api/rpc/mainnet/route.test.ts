import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The proxy that keeps the Mainnet RPC key off every visitor's machine.
 *
 * Worth testing rather than eyeballing because none of it can be exercised by
 * hand before Mainnet exists, and the thing it protects is a credential: the
 * failure is silent, it is discovered by someone else, and by then the key is in
 * browser caches that cannot be recalled.
 *
 * The route reads its upstream at module scope, so each test resets the module
 * registry and stubs the environment first. That is also what lets the
 * not-configured case be tested at all.
 */

const UPSTREAM = "https://provider.example/v1/SECRET-KEY-DO-NOT-LEAK";

async function post(body: unknown, { configured = true } = {}) {
  vi.resetModules();
  if (configured) vi.stubEnv("MAINNET_RPC_URL", UPSTREAM);
  else vi.stubEnv("MAINNET_RPC_URL", "");

  const { POST } = await import("./route");
  return POST(
    new Request("https://showup.click/api/rpc/mainnet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const call = (method: string) => ({ jsonrpc: "2.0", id: 1, method, params: {} });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the Mainnet RPC proxy", () => {
  it("forwards a method the SDK actually sends", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { sequence: 7 } }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", upstream);

    const res = await post(call("getLatestLedger"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: { sequence: 7 } });
    expect(upstream).toHaveBeenCalledOnce();
    expect(upstream.mock.calls[0][0]).toBe(UPSTREAM);
  });

  it("refuses a method nobody here sends, rather than passing it upstream", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const res = await post(call("getSomethingExpensive"));

    expect(res.status).toBe(400);
    // The point is the quota, not the status code: an unknown method must not
    // cost an upstream call at all.
    expect(upstream).not.toHaveBeenCalled();
  });

  // A batch is a bare array, and one request would otherwise be able to cost a
  // thousand upstream calls — which makes every other limit here decorative.
  it("refuses a batch", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const res = await post([call("getHealth"), call("getHealth"), call("getHealth")]);

    expect(res.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses a body past the ceiling before parsing it", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const res = await post("x".repeat(600 * 1024));

    expect(res.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("says so when the deployment has no Mainnet RPC, instead of looking healthy", async () => {
    const res = await post(call("getHealth"), { configured: false });
    expect(res.status).toBe(503);
  });

  /**
   * The test this file exists for.
   *
   * Every path out of the route is checked for the upstream URL, because the key
   * is *in* that URL — an error message that helpfully includes the endpoint it
   * failed to reach would publish the credential to the first person who sends a
   * malformed request.
   */
  it("never puts the upstream URL in anything a caller can read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error(`connect ECONNREFUSED ${UPSTREAM}`)),
    );

    // **Sequentially, and that is not a style choice.** `post` resets the module
    // registry so the route re-reads its environment, and five of those running
    // concurrently interleave: every request ends up answered by whichever module
    // instance won the race, which here meant five 503s and a test that passed
    // against a route that was leaking the key in its 502. Caught by injecting
    // the leak and watching this test stay green.
    // Thunks, so nothing starts until its turn — an array of already-called
    // `post(...)` would be exactly the concurrent version again, just written
    // to look sequential.
    const cases: Array<[string, () => Promise<Response>]> = [
      ["upstream threw, with the URL in its own message", () => post(call("getHealth"))],
      ["a method that isn't proxied", () => post(call("notAMethod"))],
      ["a body that isn't JSON", () => post("{not json")],
      ["a batch", () => post([call("getHealth")])],
      ["no Mainnet RPC configured", () => post(call("getHealth"), { configured: false })],
    ];

    for (const [what, run] of cases) {
      const text = await (await run()).text();
      expect(text, what).not.toContain("SECRET-KEY-DO-NOT-LEAK");
      expect(text, what).not.toContain("provider.example");
    }
  });

  it("does not let a response be cached anywhere", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" } })),
    );

    const res = await post(call("sendTransaction"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
