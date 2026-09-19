import { MARK_PATH, MARK_RING } from "@/lib/mark";

/**
 * Showup lockup: the ring mark, and the wordmark set in Jeko.
 *
 * The mark is a stroked circle and a single traced outline, so it takes
 * `currentColor` and stays crisp at any size — a 16px favicon and a 320px print
 * sheet are the same kilobyte of path. Nothing here is a raster.
 */

/** The ring and the S, on their own. Sized by the caller, coloured by inheritance. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 500 500"
      fill="none"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx={MARK_RING.cx}
        cy={MARK_RING.cy}
        r={MARK_RING.r}
        stroke="currentColor"
        strokeWidth={MARK_RING.width}
      />
      <path fill="currentColor" d={MARK_PATH} />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-[26px] shrink-0 text-accent" />
      {/* Below ~380px the wordmark, the Create tab and the wallet chip don't all
          fit on one line, and the chip is the one that gets pushed off. The mark
          on its own is still the home link, so this is the cheapest thing to
          drop. Above that width nothing changes. */}
      <span className="hidden font-display text-lg font-bold tracking-[-0.02em] text-foreground min-[380px]:inline">
        showup
      </span>
    </span>
  );
}
