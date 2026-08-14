import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none select-none";

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-6 text-base",
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary:
    "bg-surface-2 text-foreground border border-border-strong hover:border-muted",
  ghost: "text-foreground hover:bg-surface-2",
  danger: "bg-surface-2 text-danger border border-border-strong hover:border-danger",
};

function classesFor(variant: Variant, size: Size, fullWidth: boolean, extra: string) {
  return `${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={classesFor(variant, size, fullWidth, className)}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth = false,
  children,
  className = "",
  ...props
}: ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}) {
  return (
    <Link {...props} className={classesFor(variant, size, fullWidth, className)}>
      {children}
    </Link>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // p-6 on both sides costs 48px of a 390px phone — 12% of the viewport spent
    // on nothing, and the page already spends another 32px on its own gutters.
    <div
      className={`rounded-2xl border border-border bg-surface p-5 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A placeholder the shape of the thing that hasn't arrived.
 *
 * Only honest before the first result — once data exists, a skeleton would be
 * hiding numbers that are still true. `aria-hidden` because there is nothing
 * here to read out; the surrounding region carries the live announcement.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted-2">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * 16px text, and it has to stay 16px.
 *
 * iOS Safari zooms the page in whenever a focused input's font-size is under
 * 16px, and it does not zoom back out afterwards — so at `text-sm` every one of
 * these fields left the visitor on a page wider than their screen, panning
 * sideways to find the button they were about to press. The alternative fix is
 * `maximum-scale=1` on the viewport, which solves it by taking pinch-zoom away
 * from everyone; this one costs a 2px type bump.
 */
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-12 rounded-xl border border-border-strong bg-surface-2 px-4 text-base text-foreground placeholder:text-muted-2 outline-none focus:border-accent transition-colors ${
        props.className ?? ""
      }`}
    />
  );
}
