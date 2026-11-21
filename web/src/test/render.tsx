import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import { NetworkProvider } from "@/lib/network-context";
import type { NetworkId } from "@/lib/networks";

/**
 * `render`, with the network context the app always has in a browser.
 *
 * Any component that links to an explorer, names a network or reads a contract
 * calls `useNetwork()`, which throws without a provider above it — deliberately,
 * because the alternative is a component quietly falling back to a network
 * nobody chose. That is the right behaviour in the app and a nuisance in a test,
 * so this supplies the provider instead of each test spelling it out.
 *
 * It wraps rather than mocks on purpose: the real provider is what runs in the
 * browser, and a mocked hook would keep passing if the provider itself broke.
 *
 * Pass `network` to render a component as the other network sees it — which is
 * the only way to test a screen's Mainnet behaviour before Mainnet is deployed.
 */
export function render(
  ui: React.ReactElement,
  { network = "testnet", ...options }: RenderOptions & { network?: NetworkId } = {},
) {
  return rtlRender(ui, {
    wrapper: ({ children }) => <NetworkProvider id={network}>{children}</NetworkProvider>,
    ...options,
  });
}

// Everything else — `screen`, `waitFor`, `within`, `act` — unchanged. The
// explicit `render` above takes precedence over the one this re-exports.
export * from "@testing-library/react";
