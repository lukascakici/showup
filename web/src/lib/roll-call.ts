/**
 * A roll call: connect a wallet, say you are in the room, nothing else.
 *
 * **This is not an event.** It touches no contract, locks no deposit and writes
 * nothing to Stellar. It exists for a face-to-face meetup where the point is to
 * get a room full of people past "connect a wallet" in one tap, and where
 * asking them to fund a Testnet account and sign a transaction would lose most
 * of them at the door.
 *
 * What that costs is proof. A roll call entry is **a wallet address somebody
 * typed into a form**, not evidence that its owner was anywhere. There is no
 * signature behind it, because the one wallet that could not provide one is
 * Albedo, which `/api/events/sync` already documents as the reason this project
 * derives everything it can from the chain instead of from claims. So these
 * numbers belong in a room, on a screen, for fun. They must never appear as
 * deliverable evidence, where every figure is expected to be openable on
 * Stellar Expert by someone who trusts none of us.
 *
 * Everything an entry stores is public by construction: a Stellar address and
 * the moment it arrived. No secret may ever be added here, for the same reason
 * the check-in secret never reaches Firestore.
 */

import { isValidAddress } from "./format";

export const ROLL_CALL_COLLECTION = "roll_calls";
export const HERE_SUBCOLLECTION = "here";

export type RollCall = {
  /**
   * The whole URL path: `showup.click/<slug>`.
   *
   * A roll call lives at the top level because it is printed on paper and read
   * off a wall by someone typing it into a phone, and every extra segment is
   * another thing to get wrong in a room with bad signal. The home page links
   * to it while the window is open, so the path is public rather than secret;
   * that costs nothing, because knowing it grants nothing worth having.
   */
  slug: string;
  title: string;
  where?: string;
  /**
   * The organizer's own poster, in `public/`.
   *
   * An event page without one falls back to the generated poster, which is
   * honest for something that has only an address and a name. A meetup that
   * printed lanyards has real artwork, and inventing a colourway next to it
   * would look like the page had not been told.
   *
   * `alt` carries what the poster says, because everything legible in it is
   * legible only to people who can see it.
   */
  banner?: { src: string; alt: string };
  /**
   * The line that greets somebody who has just scanned the code.
   *
   * It belongs to the roll call rather than to the component, because what you
   * say to a room is about that room. The next one is in another city, and a
   * greeting hardcoded in a modal would welcome it to this one.
   */
  greeting?: { title: string; line: string };
  /** Unix seconds, UTC. Outside this window the door refuses. */
  opensAt: number;
  closesAt: number;
};

/**
 * Paths that belong to the app and can never be a roll call.
 *
 * The route sits at `/[call]`, so it is the last thing Next tries, and every
 * static segment beats it. This list exists so a slug cannot be *added* that
 * shadows a real page: the page would keep winning and the roll call would
 * silently never load, which is a confusing half-hour at the wrong moment.
 */
const RESERVED = ["create", "e", "api", "icon.svg", "opengraph-image"];

/**
 * Every roll call there is, in code rather than in a database.
 *
 * One line to add one, nothing to administer, and no write path a stranger
 * could reach. An admin screen for a feature this small would be more surface
 * than feature.
 */
export const ROLL_CALLS: readonly RollCall[] = [
  {
    slug: "prohackathon_residency",
    title: "Pro Hackathon Grand Pera Edition",
    where: "Grand Pera, Beyoğlu, Istanbul",
    banner: {
      src: "/prohackathon_residency.jpg",
      alt: "Pro Hackathon, Grand Pera Edition. Rise In and Stellar, 19 to 20 September 2026, Grand Pera, Beyoğlu, Istanbul.",
    },
    greeting: {
      title: "Welcome to Istanbul!",
      line: "Connect a wallet and tap Join. That is the whole thing.",
    },
    // 19.09.2026 00:00 and 21.09.2026 00:00, both UTC+03:00: the two days the
    // meetup spans, with the close a day out so a late arrival on the 20th is
    // still let in.
    opensAt: 1_789_765_200,
    closesAt: 1_789_938_000,
  },
];

export function rollCallBySlug(slug: string): RollCall | null {
  if (RESERVED.includes(slug)) return null;
  return ROLL_CALLS.find((call) => call.slug === slug) ?? null;
}

/**
 * Whether the door is open.
 *
 * A closed roll call still shows who came, because the list is the point
 * afterwards. It just stops taking names, so a link that escapes the room
 * cannot keep collecting them for a week.
 */
export function isOpen(call: RollCall, now: number): boolean {
  return now >= call.opensAt && now < call.closesAt;
}

export type Entry = {
  address: string;
  /** ms since epoch, matching the rest of the index. */
  at: number;
};

/**
 * Newest first, and never trusting the order Firestore returned.
 *
 * The list is read straight after a write, so it has to be stable while the
 * clocks disagree: an entry with no timestamp sorts last rather than jumping to
 * the top and making somebody else's arrival look like their own.
 */
export function newestFirst(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** What the API will accept as a body. Anything else is a 400. */
export function readAddress(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const address = (body as { address?: unknown }).address;
  if (typeof address !== "string") return null;
  const trimmed = address.trim().toUpperCase();
  return isValidAddress(trimmed) ? trimmed : null;
}
