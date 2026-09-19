import { identityFor } from "@/lib/palette";

/** One guest, as a coloured chip derived from their address. */
export function Identicon({
  address,
  className = "",
}: {
  address: string;
  className?: string;
}) {
  return (
    <span
      title={address}
      className={`block size-[30px] shrink-0 rounded-full border-2 border-background ${className}`}
      style={{ background: identityFor(address) }}
    />
  );
}

/**
 * The overlapping row of guests, with the overflow counted rather than drawn.
 * Shows nothing at all when nobody has reserved — an empty row of placeholder
 * circles would imply people who aren't there.
 */
export function AvatarStack({
  addresses,
  max = 4,
}: {
  addresses: string[];
  max?: number;
}) {
  if (addresses.length === 0) return null;
  const shown = addresses.slice(0, max);
  const rest = addresses.length - shown.length;

  return (
    <div className="flex">
      {shown.map((a, i) => (
        <Identicon key={a} address={a} className={i > 0 ? "-ml-[9px]" : ""} />
      ))}
      {rest > 0 && (
        <span className="-ml-[9px] flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-background bg-surface-3 font-mono text-[10.5px] text-[#a3a4ab]">
          +{rest}
        </span>
      )}
    </div>
  );
}
