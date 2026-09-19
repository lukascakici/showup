import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl transition-colors disabled:opacity-40 disabled:pointer-events-none select-none";

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-sm font-medium",
  lg: "h-[52px] px-6 text-[15px] font-medium",
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary:
    "bg-surface-3 text-foreground border border-border-strong hover:border-border-hover",
  ghost: "text-muted hover:bg-surface-3 hover:text-foreground",
  danger:
    "bg-surface-3 text-danger border border-border-strong hover:border-danger",
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
      className={`rounded-2xl border border-border-strong bg-surface p-5 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A card with a labelled strip across the top. The strip is where the panel says
 * what it is and where its numbers come from — "Stellar · Soroban" on the
 * reservation panel is not decoration, it is the answer to "who holds this".
 */
export function Panel({
  title,
  meta,
  children,
  className = "",
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border-strong ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-strong bg-surface-3 px-5 py-3">
        <span className="text-sm text-foreground-2">{title}</span>
        {meta && <span className="font-mono text-xs text-muted-2">{meta}</span>}
      </div>
      <div className="bg-surface-2 px-5 py-5">{children}</div>
    </div>
  );
}

type ChipTone = "accent" | "neutral" | "success" | "danger";

const chipTones: Record<ChipTone, string> = {
  accent: "bg-accent/10 border-accent/30 text-accent-lift",
  neutral: "bg-surface-3 border-border-hover/60 text-[#a3a4ab]",
  success: "bg-success/10 border-success/25 text-success",
  danger: "bg-danger/10 border-danger/30 text-danger",
};

export function Chip({
  tone = "neutral",
  mono = false,
  pill = false,
  children,
  className = "",
}: {
  tone?: ChipTone;
  mono?: boolean;
  /** Fully rounded — for standing labels rather than an event's live status. */
  pill?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs ${
        pill ? "rounded-full" : "rounded-lg"
      } ${mono ? "font-mono" : ""} ${chipTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** The letterspaced rule that opens a section. Display face, quiet colour. */
export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`font-display text-[13px] tracking-[0.14em] text-muted-2 ${className}`}
    >
      {children}
    </div>
  );
}

/** A number and what it counts. Numbers are always mono, never the body face. */
export function Stat({
  value,
  label,
  tone = "default",
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: "default" | "accent" | "success";
}) {
  const colour =
    tone === "accent"
      ? "text-accent-soft"
      : tone === "success"
        ? "text-success"
        : "text-foreground";
  return (
    <div>
      <div className={`font-mono text-[26px] leading-none ${colour}`}>{value}</div>
      <div className="mt-1.5 text-xs text-muted-2">{label}</div>
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
  return (
    <div aria-hidden className={`animate-pulse rounded-lg bg-surface-3 ${className}`} />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted-2">{children}</span>;
}

/**
 * A labelled control.
 *
 * `group` exists because a `<label>` forwards clicks to the **first** labelable
 * control inside it, and a field whose first control isn't the input is a trap:
 * the spots row starts with a "−" button, so tapping the words "Maximum people"
 * decremented the count. Found by a component test, on a phone-sized control
 * nobody had thought to tap.
 *
 * With `group` the wrapper is a plain `div` and there is nothing to forward, so
 * the control inside must carry its own `aria-label`.
 */
export function Field({
  label,
  hint,
  error,
  group = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  group?: boolean;
  children: ReactNode;
}) {
  const Wrapper = group ? "div" : "label";
  return (
    <Wrapper className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted-3">{hint}</span>
      ) : null}
    </Wrapper>
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
      className={`h-12 rounded-xl border border-border-strong bg-surface px-4 text-base text-foreground placeholder:text-muted-3 outline-none focus:border-accent transition-colors ${
        props.className ?? ""
      }`}
    />
  );
}

/** Errors get a surface of their own so they cannot be mistaken for body copy. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
      {children}
    </p>
  );
}
