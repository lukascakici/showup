"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { Button, Skeleton } from "./ui";
import { WalletMenu } from "./WalletMenu";
import { Logo } from "./Logo";

export function TopBar() {
  const { status, openPicker } = useWallet();
  const pathname = usePathname();
  const onEvents = pathname === "/" || pathname.startsWith("/e/");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-[rgba(10,10,12,0.82)] backdrop-blur-[16px]">
      {/* `min-w-0` on the left of the row and `shrink-0` on the wallet: the chip
          is a fixed-width mono address, so without this the lockup and the
          Create tab push it off the edge below ~340px instead of giving up
          room. */}
      <div className="mx-auto flex max-w-[1120px] items-center gap-4 px-5 py-3.5 sm:gap-7 sm:px-7">
        {/* The lockup is 26px tall, so the home link was a 26px target in a 57px
            bar. It fills the bar's height now; nothing moves. */}
        <Link
          href="/"
          aria-label="Showup home"
          className="mr-1 flex min-h-11 min-w-0 items-center"
        >
          <Logo />
        </Link>

        <nav className="hidden items-center gap-5 text-[14.5px] text-muted sm:flex">
          <NavItem href="/" label="Events" active={onEvents} />
        </nav>

        <div className="flex-1" />

        <Clock />

        <Link
          href="/create"
          aria-current={pathname === "/create" ? "page" : undefined}
          className={`shrink-0 text-sm transition-colors ${
            pathname === "/create"
              ? "text-accent-soft"
              : "text-foreground hover:text-accent-soft"
          }`}
        >
          <span className="hidden sm:inline">Create event</span>
          <span className="sm:hidden">Create</span>
        </Link>

        {/* Same height and roughly the same width as the button it stands in
            for, so the bar doesn't jump when the kit finally answers whether a
            wallet was already connected. */}
        <div className="shrink-0">
          {status === "restoring" ? (
            <Skeleton className="h-11 w-28 rounded-xl sm:w-36" />
          ) : status === "connected" ? (
            <WalletMenu />
          ) : (
            <Button onClick={openPicker} loading={status === "connecting"}>
              <Wallet className="size-4" />
              <span className="hidden sm:inline">Connect wallet</span>
              <span className="sm:hidden">Connect</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function NavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 py-1 transition-colors ${
        active ? "text-foreground" : "hover:text-foreground"
      }`}
    >
      {label}
      {active && <span className="size-[5px] rounded-full bg-accent" />}
    </Link>
  );
}

/**
 * The reader's own clock, with the offset spelled out.
 *
 * Every time on this site is rendered in the browser's zone, and an event in
 * another city is exactly when that stops being obvious — so the bar says which
 * zone it has been doing the arithmetic in. Mounted-only, because the server has
 * no idea what time it is where you are.
 */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const offset = -now.getTimezoneOffset() / 60;
  const zone = `GMT${offset >= 0 ? "+" : "−"}${Number.isInteger(offset) ? Math.abs(offset) : Math.abs(offset).toFixed(1)}`;
  const time = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <span className="hidden font-mono text-[13.5px] text-muted lg:block">
      {time} {zone}
    </span>
  );
}
