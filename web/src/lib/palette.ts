/**
 * Deterministic colour, derived from whatever a thing is already called.
 *
 * Events and guests have no avatars and never will — an address is all there is.
 * So the visuals are a function of the address itself: the same event wears the
 * same poster on every render and in every browser, two events don't quietly end
 * up looking alike by accident, and nothing has to be stored to keep it that way.
 */

/** FNV-1a. Small, stable, and no dependency. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The six event-poster colourways, in the order the design lays them out.
 *
 * All six are the same neutral, which means they cannot separate by hue the way
 * a coloured set would. They separate by where the light falls, how far it
 * travels before it dies, and how bright it starts — a polished face, a brushed
 * one, a nearly unlit one. Two events still never look alike; they just look
 * like the same material under different lighting, which is the point.
 */
const COLOURWAYS = [
  "radial-gradient(120% 90% at 20% 0%,#C9CBD2 0%,#4A4C52 45%,#151517 100%)",
  "radial-gradient(120% 90% at 80% 10%,#A8AAB2 0%,#3C4045 50%,#0F1113 100%)",
  "radial-gradient(110% 100% at 30% 100%,#B9BBC2 0%,#3A3C42 50%,#0E0E10 100%)",
  "radial-gradient(120% 100% at 70% 0%,#DCDEE3 0%,#55575E 50%,#161618 100%)",
  "radial-gradient(120% 90% at 25% 15%,#93959D 0%,#33353A 50%,#131315 100%)",
  "radial-gradient(110% 100% at 50% 100%,#6E7076 0%,#2A2B2F 50%,#131315 100%)",
];

export function colourwayFor(id: string): string {
  return COLOURWAYS[hash(id) % COLOURWAYS.length];
}

/** The quieter pairs the guest chips are filled with. */
const IDENTITIES = [
  ["#C9CBD2", "#4A4C52"],
  ["#A8AAB2", "#3C4045"],
  ["#DCDEE3", "#55575E"],
  ["#93959D", "#33353A"],
  ["#B9BBC2", "#42444A"],
  ["#7E8087", "#2E3034"],
];

export function identityFor(address: string): string {
  const [from, to] = IDENTITIES[hash(address) % IDENTITIES.length];
  return `linear-gradient(140deg,${from},${to})`;
}
