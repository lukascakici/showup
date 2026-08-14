"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, CalendarPlus } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { Button, Skeleton } from "./ui";
import { WalletMenu } from "./WalletMenu";
import { Logo } from "./Logo";

const TABS = [{ href: "/create", label: "Create", icon: CalendarPlus }];

export function TopBar() {
  const { status, openPicker } = useWallet();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      {/* `min-w-0` on the left, `shrink-0` on the right: the wallet chip is a
          fixed-width mono address, so without this the logo and the Create tab
          push it off the edge below ~340px instead of giving up room. */}
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          {/* The lockup is 24px tall, so the home link was a 24px target in a
              64px bar. It fills the bar's height now; nothing moves. */}
          <Link href="/" aria-label="Showup home" className="flex min-h-11 items-center">
            <Logo />
          </Link>
          {status === "connected" && (
            <nav className="flex items-center gap-1">
              {TABS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-surface-2 text-accent"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* Same width as the button it stands in for, so the header doesn't jump
            when the kit finally answers. The nav tab above is gated on
            "connected" too, so it simply appears rather than flickering. */}
        <div className="shrink-0">
          {status === "restoring" ? (
            <Skeleton className="h-11 w-36 rounded-xl" />
          ) : status === "connected" ? (
            <WalletMenu />
          ) : (
            <Button onClick={openPicker} loading={status === "connecting"}>
              <Wallet className="size-4" />
              Connect wallet
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
