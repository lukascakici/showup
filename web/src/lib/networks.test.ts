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
  parseNetworkId,
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
  // The state this ships in: Mainnet is configured but not deployed to, so it
  // is not a network anybody can be shown. When that changes, these two
  // assertions are the ones that should fail first and loudest.
  it("leaves out a network with no contracts deployed", () => {
    expect(network("mainnet").contracts).toBeNull();
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

describe("real money", () => {
  it("is Mainnet and only Mainnet", () => {
    expect(network("mainnet").isRealMoney).toBe(true);
    expect(network("testnet").isRealMoney).toBe(false);
  });
});
