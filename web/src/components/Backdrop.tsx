/**
 * The ambient silver field behind everything.
 *
 * Fixed rather than absolute, so the blobs stay put as the page scrolls instead
 * of being stretched down a long event list. Purely decorative, so it is hidden
 * from the accessibility tree and stops animating under reduced motion (see
 * globals.css).
 */
export function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
    </div>
  );
}
