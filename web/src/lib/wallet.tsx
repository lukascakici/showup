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
import { readWalletError } from "./wallet-errors";
import {
  NETWORK_PASSPHRASE,
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
async function forgetWallet(): Promise<void> {
  const { kit } = await getKit();
  await kit.disconnect();
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("restoring");
  const [walletName, setWalletName] = useState<string | null>(null);
  const [wallets, setWallets] = useState<ISupportedWallet[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [network, setNetwork] = useState<NetworkState>({ passphrase: null, known: false });
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<AccountState | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const refreshNetwork = useCallback(async () => {
    const { kit } = await getKit();
    try {
      const net = await kit.getNetwork();
      setNetwork({ passphrase: net.networkPassphrase ?? null, known: true });
    } catch {
      setNetwork({ passphrase: null, known: false });
    }
  }, []);

  const readWalletName = useCallback(async () => {
    const { kit } = await getKit();
    try {
      setWalletName(kit.selectedModule.productName);
    } catch {
      setWalletName(null);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      setBalance(await fetchAccountState(address));
    } catch (e) {
      setBalanceError(errMessage(e) || "Couldn't load balance.");
    } finally {
      setBalanceLoading(false);
    }
  }, [address]);

  // Load balance whenever a wallet becomes connected / the address changes.
  useEffect(() => {
    if (status === "connected" && address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      refreshBalance();
    } else {
      setBalance(null);
    }
  }, [status, address, refreshBalance]);

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
        ({ kit, events } = await getKit());
      } catch (e) {
        if (!cancelled) {
          setError(errMessage(e) || "Couldn't load wallet support.");
          // The question has an answer now — nobody is connected, and nobody is
          // going to be. Leaving this at `restoring` would spin forever.
          setStatus("idle");
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
        await forgetWallet();
      }

      // Set from inside the subscription, which the kit runs synchronously as a
      // signals effect — so by the time `kit.on` returns, this says whether the
      // question was answered at all.
      let answered = false;

      track(
        kit.on(events.STATE_UPDATED, (event) => {
          answered = true;
          const next = event.payload.address ?? null;
          setAddress(next);
          setStatus(next ? "connected" : "idle");
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
      if (!answered) setStatus("idle");

      track(
        kit.on(events.DISCONNECT, () => {
          setAddress(null);
          setStatus("idle");
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
  }, [refreshNetwork, readWalletName]);

  // Separated from `openPicker` so it can be asked again without reopening
  // anything: installing an extension doesn't notify the page it happened, so
  // whoever just installed one needs a way to say "look again" that doesn't
  // involve guessing that a reload is required.
  const refreshWallets = useCallback(async () => {
    setWalletsLoading(true);
    try {
      const { kit } = await getKit();
      setWallets(await kit.refreshSupportedWallets());
    } catch (e) {
      setError(errMessage(e) || "Couldn't load the wallet list.");
    } finally {
      setWalletsLoading(false);
    }
  }, []);

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
    setStatus("connecting");
    try {
      const { kit } = await getKit();
      kit.setWallet(walletId);
      // Goes to the wallet itself rather than reading the kit's memory, which is
      // the point here: this is the call that prompts the user.
      const { address: connected } = await kit.fetchAddress();
      if (!connected) throw new Error("The wallet didn't return an address.");
      // STATE_UPDATED will also land, but setting it here avoids a flash of idle.
      setAddress(connected);
      setStatus("connected");
      setPickerOpen(false);
    } catch (e) {
      setStatus("idle");
      const failure = readWalletError(e);
      // Backing out isn't a failure — leave the picker open and say nothing.
      setError(failure.message);
      // Whatever the kit remembered can't be resolved, so clear it rather than let
      // every later call fail the same way.
      if (failure.stale) await forgetWallet();
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    await forgetWallet();
  }, []);

  // The kit throws on rejection rather than returning an error field, which is
  // exactly what the generated contract clients expect, so this passes straight
  // through with the network filled in.
  const sign = useCallback<SignFn>(async (xdr, opts) => {
    const { kit } = await getKit();
    return kit.signTransaction(xdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
      ...(address ? { address } : {}),
      ...opts,
    });
  }, [address]);

  const wrongNetwork =
    status === "connected" && network.known && network.passphrase !== NETWORK_PASSPHRASE;

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      status,
      walletName,
      wallets,
      walletsLoading,
      refreshWallets,
      network,
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
      wallets,
      walletsLoading,
      refreshWallets,
      network,
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

export { NETWORK_PASSPHRASE };
