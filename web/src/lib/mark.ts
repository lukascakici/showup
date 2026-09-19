/**
 * The Showup mark, as geometry rather than a picture.
 *
 * A stroked circle and one traced outline, on a 500×500 grid. Kept here because
 * three places draw it and only two of them are React: the lockup in the top
 * bar, and the link-preview card, which is rendered by Satori on a server and
 * therefore needs the whole thing as a string it can inline.
 *
 * The third is `app/icon.svg`, the favicon. That one is a static file and cannot
 * import anything, so it carries its own copy of both shapes. Change this, change
 * that.
 */

/** The S, as a single closed outline. */
export const MARK_PATH =
  "M360.7 116L360.6 181L289.8 182L276.7 184L270.1 186L270 187L265.2 189L259.4 195L255.5 201L254.5 206L253.4 207L253.8 212L252.1 213L252.1 220L253.8 221L253.5 226L254.6 227L255.6 232L263.2 241L272.3 246L278.2 248L285 249L359 250L360.4 251L360.7 262L359.2 263L359.7 268L358.4 269L358.5 272L357.5 273L356.5 278L354.5 281L354.5 283L352.6 285L346.7 295L336.8 305L334.3 306L332.8 308L328 310L327.8 311L323.9 313L314.4 316L308.7 317L250.2 318L249.5 319L249.8 328L248.3 329L248.6 333L247.3 334L247.6 338L246.6 339L245.6 344L240.3 354L236.1 359L234.6 362L225.9 371L220.1 374L219.6 375L217.2 376L217 377L207.9 381L192.2 384L139.7 384L139.2 371L139.5 318L216.3 317L224.5 315L232.2 311L240.5 303L244.3 295L246.1 284L244.5 271L240.5 263L234.3 257L224.6 252L214.8 250L139.4 249L139.5 237L140.8 229L143.7 220L147.8 212L155.2 202L163.6 194L174.6 187L185.4 183L191.6 182L250.1 181L252.7 164L255 157L258.6 149L264.7 140L274.4 130L282.7 124L292.7 119L303.4 116Z";

/** The ring the S sits inside. */
export const MARK_RING = { cx: 250, cy: 250, r: 230, width: 14 } as const;

/**
 * The whole mark as a data URI, for renderers that take an image and not a
 * component. Satori draws `<img>` reliably and inline `<svg>` less so, which is
 * the only reason this exists.
 */
export function markDataUri(colour: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">` +
    `<circle cx="${MARK_RING.cx}" cy="${MARK_RING.cy}" r="${MARK_RING.r}" fill="none" stroke="${colour}" stroke-width="${MARK_RING.width}"/>` +
    `<path fill="${colour}" d="${MARK_PATH}"/>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
