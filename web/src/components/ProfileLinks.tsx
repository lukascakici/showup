import { ArrowUpRight } from "lucide-react";
import { evmUrl, shortEvm, xUrl } from "@/lib/profile";

/**
 * The two links a wallet has claimed, rendered as claims.
 *
 * **There is deliberately no tick, no badge and no colour here.** A Stellar
 * signature proves the person editing holds this Stellar wallet; it says nothing
 * at all about the X account or the Ethereum address they typed. Anybody can
 * claim anybody's handle, and the only way this feature causes harm is by
 * implying otherwise inside our own chrome — so the heading says "says", the
 * links are plain, and nothing about them reads as endorsement.
 *
 * Renders nothing when both are unset, which is almost every wallet: an empty
 * section with two blank rows would suggest something is missing from a record
 * that is complete.
 */
export function ProfileLinks({ x, evm }: { x?: string | null; evm?: string | null }) {
  if (!x && !evm) return null;

  return (
    <div className="mt-6">
      <p className="text-xs text-muted-3">This wallet says</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        {x && (
          <Claim href={xUrl(x)} label={`@${x}`} title={`x.com/${x}`} />
        )}
        {evm && (
          // The full address in `title`, because the shortened form is for
          // reading and the whole thing is what somebody would want to compare.
          <Claim href={evmUrl(evm)} label={shortEvm(evm)} title={evm} mono />
        )}
      </div>
    </div>
  );
}

function Claim({
  href,
  label,
  title,
  mono = false,
}: {
  href: string;
  label: string;
  title: string;
  mono?: boolean;
}) {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noreferrer nofollow"
      className={`inline-flex items-center gap-1 text-sm text-foreground-2 underline decoration-border-hover underline-offset-4 transition-colors hover:decoration-foreground ${
        mono ? "font-mono text-[13px]" : ""
      }`}
    >
      {label}
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-muted-3" />
    </a>
  );
}
