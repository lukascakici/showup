import { colourwayFor } from "@/lib/palette";

/**
 * The little poster that stands in for an event.
 *
 * Nothing here is invented: the wording is the event's own title and start date,
 * and the colourway comes from the contract address. Events made before titles
 * existed get their address rather than a made-up name.
 */

/** The two words that fit. Punctuation goes, the words themselves never do. */
function posterWords(title: string): string[] {
  const words = title
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  return words.slice(0, 2).map((w) => w.toLocaleUpperCase("tr"));
}

/** The date, in the poster's own voice: "12 AUG". */
function posterKicker(startsAt: number, fallback: string): string {
  if (!startsAt) return fallback;
  const d = new Date(startsAt * 1000);
  if (Number.isNaN(d.getTime())) return fallback;
  return d
    .toLocaleDateString("en-US", { day: "numeric", month: "short" })
    .toUpperCase();
}

/**
 * A long word in a narrow poster either overflows or gets cut in half. Neither is
 * acceptable for something carrying the event's name, so the type gives way.
 */
function fitted(words: string[], max: number): number {
  const longest = words.reduce((n, w) => Math.max(n, w.length), 0);
  if (longest <= 7) return max;
  if (longest <= 9) return Math.round(max * 0.82);
  if (longest <= 12) return Math.round(max * 0.66);
  return Math.round(max * 0.52);
}

export function EventPoster({
  id,
  title,
  startsAt,
  size = "sm",
  className = "",
}: {
  id: string;
  title: string;
  startsAt: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  const words = posterWords(title);
  const big = size === "lg";
  // With no title there is nothing to letter the poster with, so the address
  // takes the headline slot and the kicker says what it is.
  const untitled = words.length === 0;
  const lines = untitled ? [id.slice(0, 4), id.slice(-4)] : words;
  const kicker = posterKicker(startsAt, untitled ? "CONTRACT" : "TESTNET");
  const fontSize = fitted(lines, big ? 38 : 19);

  return (
    <div
      className={`flex flex-col justify-end overflow-hidden ${
        big
          ? "aspect-square rounded-[18px] p-6"
          : "size-[132px] shrink-0 rounded-xl p-3"
      } ${className}`}
      style={{ background: colourwayFor(id) }}
    >
      <div
        className="font-display text-white/60"
        style={{
          fontSize: big ? 12 : 10,
          letterSpacing: big ? "0.18em" : "0.16em",
          marginBottom: big ? 8 : 0,
        }}
      >
        {kicker}
      </div>
      <div
        className={`font-bold text-white ${untitled ? "font-mono" : "font-display"}`}
        style={{
          fontSize,
          lineHeight: big ? 1.02 : 1.05,
          letterSpacing: big ? "-0.02em" : undefined,
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
