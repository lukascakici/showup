/**
 * Showup logo lockup: a location pin with a clock inside — "be somewhere, on time".
 * Flat amber pin, dark clock face. No gradients, no glow.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        {/* Location pin */}
        <path
          d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z"
          fill="var(--accent)"
        />
        {/* Clock face inside the pin head */}
        <circle cx="12" cy="10" r="3.4" stroke="var(--accent-fg)" strokeWidth="1.4" />
        <path
          d="M12 10V8.1M12 10h1.9"
          stroke="var(--accent-fg)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* Below ~380px the wordmark, the Create tab and the wallet chip don't all
          fit on one line, and the chip is the one that gets pushed off. The pin
          on its own is still the home link, so this is the cheapest thing to
          drop. Above that width nothing changes. */}
      <span className="relative -top-[3px] hidden font-hand text-2xl font-bold leading-none text-accent min-[380px]:inline">
        showup
      </span>
    </span>
  );
}
