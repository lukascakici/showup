import { describe, expect, it } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import {
  EXPLORER_ACCOUNT,
  EXPLORER_CONTRACT,
  EXPLORER_TX,
  defaultNetwork,
  isLive,
  liveNetworks,
  network,
  networkFromHostname,
  networkIdFromHostname,
  parseNetworkId,
  siteUrlFor,
} from "./networks";

describe("the native XLM contract address", () => {
  // Derived rather than written down, because it is a hash of the asset and the
  // network passphrase. These two values pin the derivation: if an SDK change
  // ever altered it, every deposit would be pointed at a contract that is not
  // XLM, and nothing else in the codebase would notice.
  it("is the known Testnet SAC", () => {
    expect(network("testnet").nativeSac).toBe(
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    );
  });

  it("is the known Mainnet SAC, which is a different address", () => {
    expect(network("mainnet").nativeSac).toBe(
      "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
    );
    expect(network("mainnet").nativeSac).not.toBe(network("testnet").nativeSac);
  });
});

describe("passphrases", () => {
  it("are the real ones, and not each other's", () => {
    expect(network("testnet").passphrase).toBe(Networks.TESTNET);
    expect(network("mainnet").passphrase).toBe(Networks.PUBLIC);
  });
});

describe("explorer links", () => {
  // stellar.expert's segment for the public network is "public". Writing
  // "mainnet" there produces a link that 404s, and it reads correctly.
  it("use `public` for Mainnet, not `mainnet`", () => {
    const main = network("mainnet");
    expect(EXPLORER_TX(main, "abc")).toBe("https://stellar.expert/explorer/public/tx/abc");
    expect(EXPLORER_ACCOUNT(main, "G1")).toBe(
      "https://stellar.expert/explorer/public/account/G1",
    );
    expect(EXPLORER_CONTRACT(main, "C1")).toBe(
      "https://stellar.expert/explorer/public/contract/C1",
    );
  });

  it("use `testnet` for Testnet", () => {
    expect(EXPLORER_TX(network("testnet"), "abc")).toBe(
      "https://stellar.expert/explorer/testnet/tx/abc",
    );
  });
});

describe("a faucet exists on exactly one network", () => {
  it("is Testnet's, and Mainnet has none", () => {
    expect(network("testnet").friendbotUrl).toBe("https://friendbot.stellar.org");
    expect(network("mainnet").friendbotUrl).toBeNull();
  });
});

describe("which networks can be served", () => {
  // **Mainnet is deployed as of 27.11.2026**, and this test caught the moment it
  // happened — it was written to assert `contracts === null` precisely so that
  // filling those addresses in could not be a silent change.
  it("knows the Mainnet contracts now that they exist", () => {
    expect(network("mainnet").contracts).not.toBeNull();
    expect(network("mainnet").contracts?.factoryId).toMatch(/^C[A-Z2-7]{55}$/);
  });

  // Deployed is not the same as live, and the gap is the whole point: a network
  // needs contracts **and** somewhere to ask about them. No RPC is configured
  // here, so Mainnet stays dark — which is also exactly what a deployment with
  // the addresses compiled in but the environment variables unset will do,
  // rather than offering a network whose every read would fail.
  it("still leaves out a deployed network with nowhere to ask", () => {
    expect(network("mainnet").sorobanRpcUrl).toBe("");
    expect(liveNetworks().map((n) => n.id)).toEqual(["testnet"]);
    expect(isLive("mainnet")).toBe(false);
    expect(isLive("testnet")).toBe(true);
  });

  it("defaults to the one live network", () => {
    expect(defaultNetwork().id).toBe("testnet");
  });

  it("gives every live network somewhere to ask", () => {
    for (const n of liveNetworks()) {
      expect(n.sorobanRpcUrl).not.toBe("");
      expect(n.contracts).not.toBeNull();
    }
  });
});

describe("parseNetworkId", () => {
  it("accepts the two it knows", () => {
    expect(parseNetworkId("testnet")).toBe("testnet");
    expect(parseNetworkId("mainnet")).toBe("mainnet");
  });

  it("refuses anything else rather than guessing", () => {
    // These arrive from a URL segment or a stored preference, so "close enough"
    // is how somebody ends up on the wrong network.
    expect(parseNetworkId("public")).toBeNull();
    expect(parseNetworkId("TESTNET")).toBeNull();
    expect(parseNetworkId("futurenet")).toBeNull();
    expect(parseNetworkId("")).toBeNull();
    expect(parseNetworkId(null)).toBeNull();
    expect(parseNetworkId(undefined)).toBeNull();
  });
});

describe("which network a hostname serves", () => {
  it("serves Mainnet on the production host, with or without www", () => {
    expect(networkIdFromHostname("showup.click")).toBe("mainnet");
    expect(networkIdFromHostname("www.showup.click")).toBe("mainnet");
  });

  it("is case- and port-insensitive, because a Host header is whatever was sent", () => {
    expect(networkIdFromHostname("Showup.Click")).toBe("mainnet");
    expect(networkIdFromHostname("showup.click:443")).toBe("mainnet");
    expect(networkIdFromHostname("  showup.click  ")).toBe("mainnet");
  });

  it("serves Testnet on everything else", () => {
    // Every one of these is a hostname this app will really be reached on, and
    // not one of them may be mistaken for the network that holds real money.
    for (const host of [
      "testnet.showup.click",
      "localhost",
      "localhost:3000",
      "127.0.0.1",
      "showup-git-main-lukascakicis-projects.vercel.app",
      "showup.vercel.app",
      "",
    ]) {
      expect(networkIdFromHostname(host)).toBe("testnet");
    }
  });

  it("does not treat a lookalike host as Mainnet", () => {
    // A subdomain, a suffix or a homoglyph domain must not inherit real money
    // just by containing the production hostname.
    for (const host of [
      "evil-showup.click",
      "showup.click.attacker.com",
      "showup.clickx",
      "notshowup.click",
      "api.showup.click",
    ]) {
      expect(networkIdFromHostname(host)).toBe("testnet");
    }
  });

  it("serves the live network when the hostname asks for one that is not", () => {
    // What makes the domain split shippable before Mainnet is deployed:
    // showup.click asks for Mainnet, Mainnet has no contracts, so it serves
    // Testnet — exactly what it serves today.
    expect(networkIdFromHostname("showup.click")).toBe("mainnet");
    expect(isLive("mainnet")).toBe(false);
    expect(networkFromHostname("showup.click").id).toBe("testnet");
    expect(networkFromHostname("testnet.showup.click").id).toBe("testnet");
  });
});

describe("where a link to a network points", () => {
  it("gives each network its own canonical host", () => {
    expect(siteUrlFor(network("mainnet"))).toBe("https://showup.click");
    expect(siteUrlFor(network("testnet"))).toBe("https://testnet.showup.click");
  });

  it("round-trips: a canonical host resolves back to its own network", () => {
    for (const id of ["mainnet", "testnet"] as const) {
      const host = new URL(siteUrlFor(network(id))).hostname;
      expect(networkIdFromHostname(host)).toBe(id);
    }
  });
});

describe("real money", () => {
  it("is Mainnet and only Mainnet", () => {
    expect(network("mainnet").isRealMoney).toBe(true);
    expect(network("testnet").isRealMoney).toBe(false);
  });
});
