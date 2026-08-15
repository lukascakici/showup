/**
 * `window.matchMedia`, which jsdom does not implement at all.
 *
 * Two components ask it real questions — `WalletPicker` picks which install
 * advice is true from `(pointer: coarse)`, and `GridTrail` opts out of its
 * animation on the same query — so without this they throw on render rather
 * than answering "no". A stub that always returns false would only ever test
 * the desktop half, and the phone half is the one next week depends on.
 */
let matching = new Set<string>();

export function setMediaMatches(...queries: string[]): void {
  matching = new Set(queries);
}

export function resetMediaMatches(): void {
  matching = new Set();
}

export function installMatchMedia(): void {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: matching.has(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
