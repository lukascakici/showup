"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getKit, type ISupportedWallet } from "./kit";
import { useNetwork } from "./network-context";
import type { NetworkId } from "./networks";
import { readWalletError } from "./wallet-errors";
import { track } from "./funnel";
import {
  createLocalWallet,
  forgetLocalWallet,
  loadLocalWallet,
  localWalletAllowed,
  signWith,
  type LocalWallet,
} from "./local-wallet";
import {
  fetchAccountState,
  errMessage,
  type AccountState,
  type SignFn,
} from "./stellar";

/**
 * `restoring` is the state the app was missing.
 *
 * The kit persists the chosen wallet and address and hands them back after an
 * async load, so on every page load there is a window where we genuinely do not
 * yet know whether anyone is connected. Without a name for it, that window was
 * indistinguishable from "disconnected" — `/create` rendered its full
 * "connect first" card and then swapped it out, and the top bar reflowed twice,
 * on every single load for a returning visitor.
 *
 * It resolves synchronously in practice: `kit.on(STATE_UPDATED)` installs a
 * signals effect that runs during subscription, so the answer arrives in the
 * same tick. The explicit fallback below is for the case where it doesn't.
 */
type WalletStatus = "restoring" | "idle" | "connecting" | "connected";

/**
 * What we know about the network the connected wallet is on.
 *
 * Only Freighter implements `getNetwork`; xBull, Albedo and Hana reject it. So
 * "unknown" is a real third state, and it must not be reported as wrong — we
 * simply can't tell for three of the four wallets.
 */
type NetworkState = { passphrase: string | null; known: boolean };

type WalletContextValue = {
  address: string | null;
  status: WalletStatus;
  walletName: string | null;
  /**
   * The signer is a key this browser generated, not a wallet app.
   *
   * Screens read this to say so. Nothing about a local wallet should be hidden —
   * it holds its own key, the person is responsible for backing it up, and a UI
   * that rendered it identically to Freighter would be the one dishonest thing
   * about the feature.
   */
  isLocal: boolean;
  /** Whether this network can have one at all. False on Mainnet, always. */
  localAllowed: boolean;
  /** Generate a key here and connect with it. Returns null where not allowed. */
  createLocal: () => LocalWallet | null;
  /** Delete the local key. Irreversible, and the funds go with it. */
  forgetLocal: () => void;
  wallets: ISupportedWallet[];
  walletsLoading: boolean;
  /** Ask every module again whether it is there — after installing one. */
  refreshWallets: () => Promise<void>;
  network: NetworkState;
  /** Ask the wallet again which network it is on — after switching it. */
  refreshNetwork: () => Promise<void>;
  wrongNetwork: boolean;
  error: string | null;
  balance: AccountState | null;
  balanceLoading: boolean;
  balanceError: string | null;
  refreshBalance: () => Promise<void>;
  pickerOpen: boolean;
  /** Open the wallet picker. Also warms the kit and the wallet list. */
  openPicker: () => void;
  closePicker: () => void;
  select: (walletId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sign: SignFn;
};

const WalletContext = createContext<WalletContextValue | null>(null);

/** Drop the kit's remembered wallet and address. Emits DISCONNECT, which resets us. */
async function forgetWallet(on: NetworkId): Promise<void> {
  const { kit } = await getKit(on);
  await kit.disconnect();
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const activeNetwork = useNetwork();
  // Prefixed `kit`, because the address and status this provider reports are no
  // longer the same thing as the kit's: a local key can stand in for both. The
  // derivation is below, and these two are only ever one input to it.
  const [kitAddress, setKitAddress] = useState<string | null>(null);
  const [kitStatus, setKitStatus] = useState<WalletStatus>("restoring");
  const [local, setLocal] = useState<LocalWallet | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [wallets, setWallets] = useState<ISupportedWallet[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [network, setNetwork] = useState<NetworkState>({ passphrase: null, known: false });
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<AccountState | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const localAllowed = localWalletAllowed(activeNetwork);

  /**
   * Which of the two signers is the one in use, and why in this order.
   *
   * The kit wins whenever it has an address or is mid-connection: picking a real
   * wallet is an explicit act and must take effect immediately, even if a local
   * key is sitting in storage. A local key is the fallback, which is exactly what
   * it is for — the person who got to the picker with nothing installed.
   *
   * Deriving it rather than storing a third "which one is active" flag is the
   * point: there is no state that can disagree with itself, and no way to end up
   * reporting an address that belongs to one signer while `sign` uses the other.
   *
   * The consequence to be aware of: disconnecting a real wallet while a local key
   * exists falls back to the local key rather than to nobody. That is why every
   * surface says which one it is holding.
   */
  const usingLocal = local !== null && kitAddress === null && kitStatus !== "connecting";
  const address = usingLocal ? local.publicKey : kitAddress;
  const status: WalletStatus = usingLocal ? "connected" : kitStatus;

  const refreshNetwork = useCallback(async () => {
    const { kit } = await getKit(activeNetwork.id);
    try {
      const net = await kit.getNetwork();
      setNetwork({ passphrase: net.networkPassphrase ?? null, known: true });
    } catch {
      setNetwork({ passphrase: null, known: false });
    }
  }, [activeNetwork.id]);

  const readWalletName = useCallback(async () => {
    const { kit } = await getKit(activeNetwork.id);
    try {
      setWalletName(kit.selectedModule.productName);
    } catch {
      setWalletName(null);
    }
  }, [activeNetwork.id]);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      // The network, explicitly. This used to call the one-argument version,
      // which read the default network's Horizon — and once Mainnet went live
      // that meant every Testnet balance was looked up on Mainnet, 404'd, and
      // was rendered as "Not funded yet" under a funded account.
      setBalance(await fetchAccountState(address, activeNetwork));
    } catch (e) {
      setBalanceError(errMessage(e) || "Couldn't load balance.");
    } finally {
      setBalanceLoading(false);
    }
  }, [address, activeNetwork]);

  // Load balance whenever a wallet becomes connected / the address changes.
  useEffect(() => {
    if (status === "connected" && address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      refreshBalance();
    } else {
      setBalance(null);
    }
  }, [status, address, refreshBalance]);

  // Restore a local key, if this browser made one for this network.
  //
  // Read in an effect rather than during render because `localStorage` does not
  // exist on the server, and a value read during render would disagree with the
  // prerendered HTML. The window before it lands is `restoring`, which is the
  // state that exists for precisely this — so a returning visitor with a local
  // key never sees "connect a wallet" flash first.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(loadLocalWallet(activeNetwork));
  }, [activeNetwork]);

  // The kit persists the address and the chosen wallet itself, so a returning
  // visitor is already connected by the time it finishes loading. Its
  // STATE_UPDATED event fires once on launch with whatever it restored, and again
  // whenever the account changes inside the wallet — which is what keeps the
  // address from going stale after an in-wallet switch.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    const unsubscribes: Array<() => void> = [];
    const track = (unsubscribe: () => void) => {
      if (cancelled) unsubscribe();
      else unsubscribes.push(unsubscribe);
    };

    (async () => {
      let kit, events;
      try {
        ({ kit, events } = await getKit(activeNetwork.id));
      } catch (e) {
        if (!cancelled) {
          setError(errMessage(e) || "Couldn't load wallet support.");
          // The question has an answer now — nobody is connected, and nobody is
          // going to be. Leaving this at `restoring` would spin forever.
          setKitStatus("idle");
        }
        return;
      }
      if (cancelled) return;

      // A wallet remembered from a build that offered more wallets than this one
      // leaves a selected id we can no longer resolve; every later call would
      // throw "Please set the wallet first". Clear it instead.
      try {
        void kit.selectedModule;
      } catch {
        await forgetWallet(activeNetwork.id);
      }

      // Set from inside the subscription, which the kit runs synchronously as a
      // signals effect — so by the time `kit.on` returns, this says whether the
      // question was answered at all.
      let answered = false;

      track(
        kit.on(events.STATE_UPDATED, (event) => {
          answered = true;
          const next = event.payload.address ?? null;
          setKitAddress(next);
          setKitStatus(next ? "connected" : "idle");
          if (next) {
            void refreshNetwork();
            void readWalletName();
          } else {
            setWalletName(null);
            setNetwork({ passphrase: null, known: false });
          }
        }),
      );

      // Nothing to restore, and the kit stayed quiet about it.
      if (!answered) setKitStatus("idle");

      track(
        kit.on(events.DISCONNECT, () => {
          setKitAddress(null);
          setKitStatus("idle");
          setWalletName(null);
          setNetwork({ passphrase: null, known: false });
          setBalance(null);
          setBalanceError(null);
        }),
      );
    })();

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [refreshNetwork, readWalletName, activeNetwork.id]);

  // Separated from `openPicker` so it can be asked again without reopening
  // anything: installing an extension doesn't notify the page it happened, so
  // whoever just installed one needs a way to say "look again" that doesn't
  // involve guessing that a reload is required.
  const refreshWallets = useCallback(async () => {
    setWalletsLoading(true);
    try {
      const { kit } = await getKit(activeNetwork.id);
      setWallets(await kit.refreshSupportedWallets());
    } catch (e) {
      setError(errMessage(e) || "Couldn't load the wallet list.");
    } finally {
      setWalletsLoading(false);
    }
  }, [activeNetwork.id]);

  const openPicker = useCallback(() => {
    setError(null);
    setPickerOpen(true);
    // Fetched as the picker opens rather than when a wallet is clicked: this
    // races every wallet's availability check against a one second timeout, and
    // spending that inside a click would cost the user's gesture — which xBull
    // and Albedo need in order to open their popup.
    void refreshWallets();
  }, [refreshWallets]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setError(null);
  }, []);

  const select = useCallback(async (walletId: string) => {
    setError(null);
    setKitStatus("connecting");
    try {
      const { kit } = await getKit(activeNetwork.id);
      kit.setWallet(walletId);
      // Goes to the wallet itself rather than reading the kit's memory, which is
      // the point here: this is the call that prompts the user.
      const { address: connected } = await kit.fetchAddress();
      if (!connected) throw new Error("The wallet didn't return an address.");
      // STATE_UPDATED will also land, but setting it here avoids a flash of idle.
      setKitAddress(connected);
      setKitStatus("connected");
      setPickerOpen(false);
      // Step two of the funnel, recorded here rather than wherever a wallet
      // happens to be needed: this is the one line in the app that knows a
      // connection just succeeded, as opposed to one already existing.
      track("wallet_connected", { address: connected });
    } catch (e) {
      setKitStatus("idle");
      const failure = readWalletError(e);
      // Backing out isn't a failure — leave the picker open and say nothing.
      setError(failure.message);
      // Whatever the kit remembered can't be resolved, so clear it rather than let
      // every later call fail the same way.
      if (failure.stale) await forgetWallet(activeNetwork.id);
    }
  }, [activeNetwork.id]);

  /**
   * Drops the kit's wallet. **Never touches the local key.**
   *
   * The two are deliberately not the same action. Disconnecting a wallet app is
   * reversible — reconnect and the account is still there. Deleting a local key
   * destroys the only copy of it, and whatever it holds. Putting both behind one
   * control labelled "Disconnect" would make a destructive action look routine,
   * so the local one is `forgetLocal` and the UI confirms it separately.
   */
  const disconnect = useCallback(async () => {
    setError(null);
    await forgetWallet(activeNetwork.id);
  }, [activeNetwork.id]);

  const createLocal = useCallback(() => {
    setError(null);
    const wallet = createLocalWallet(activeNetwork);
    if (!wallet) {
      // Only reachable by calling this where it isn't offered. Said plainly
      // rather than failing silently, because a button that does nothing is the
      // worst of the three possible behaviours.
      setError(`${activeNetwork.label} holds real money. Connect a wallet you control.`);
      return null;
    }
    setLocal(wallet);
    // The picker is deliberately left open: creating a wallet is the one moment
    // the recovery key can be shown, and closing the panel here would take that
    // screen away before it rendered. Whoever opened the picker closes it.
    // The same funnel step a real wallet records. It is the same fact — this
    // visitor now has a signer — and counting it differently would make the
    // drop-off report understate the path it exists to measure.
    track("wallet_connected", { address: wallet.publicKey });
    return wallet;
  }, [activeNetwork]);

  const forgetLocal = useCallback(() => {
    forgetLocalWallet(activeNetwork);
    setLocal(null);
    setBalance(null);
    setBalanceError(null);
  }, [activeNetwork]);

  // The kit throws on rejection rather than returning an error field, which is
  // exactly what the generated contract clients expect, so this passes straight
  // through with the network filled in. A local key signs in process and returns
  // the same shape, so no caller — `claimName`, `describeEvent`, every generated
  // contract client — knows or needs to know which one it got.
  const sign = useCallback<SignFn>(async (xdr, opts) => {
    if (usingLocal && local) return signWith(local, activeNetwork)(xdr, opts);
    const { kit } = await getKit(activeNetwork.id);
    return kit.signTransaction(xdr, {
      networkPassphrase: activeNetwork.passphrase,
      ...(address ? { address } : {}),
      ...opts,
    });
  }, [address, usingLocal, local, activeNetwork]);

  /**
   * A local key is always on the right network, and that is knowable rather than
   * assumed: it signs with whatever passphrase we hand it, and we hand it the
   * active one. Reporting it as `known` matters because the kit's answer outlives
   * the kit's connection — disconnect Freighter while it is on the wrong network
   * and the stale "wrong network" banner would otherwise follow the local wallet
   * around.
   */
  // Memoised because it is a fresh object literal on the local branch, and the
  // context value below depends on it — without this, every render would hand
  // every consumer a new context and re-render the whole app.
  const reportedNetwork = useMemo<NetworkState>(
    () =>
      usingLocal ? { passphrase: activeNetwork.passphrase, known: true } : network,
    [usingLocal, activeNetwork.passphrase, network],
  );

  const wrongNetwork =
    status === "connected" &&
    reportedNetwork.known &&
    reportedNetwork.passphrase !== activeNetwork.passphrase;

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      status,
      // Named, not blank. The top bar and the reserve card both show this, and
      // "the wallet with no name" is the one thing a signer must never be.
      walletName: usingLocal ? "In-app wallet" : walletName,
      isLocal: usingLocal,
      localAllowed,
      createLocal,
      forgetLocal,
      wallets,
      walletsLoading,
      refreshWallets,
      network: reportedNetwork,
      refreshNetwork,
      wrongNetwork,
      error,
      balance,
      balanceLoading,
      balanceError,
      refreshBalance,
      pickerOpen,
      openPicker,
      closePicker,
      select,
      disconnect,
      sign,
    }),
    [
      address,
      status,
      walletName,
      usingLocal,
      localAllowed,
      createLocal,
      forgetLocal,
      wallets,
      walletsLoading,
      refreshWallets,
      reportedNetwork,
      refreshNetwork,
      wrongNetwork,
      error,
      balance,
      balanceLoading,
      balanceError,
      refreshBalance,
      pickerOpen,
      openPicker,
      closePicker,
      select,
      disconnect,
      sign,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

