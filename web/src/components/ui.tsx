import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none select-none";

const sizes = {
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-6 text-base",
} as const;

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary:
    "bg-surface-2 text-foreground border border-border-strong hover:border-muted",
  ghost: "text-foreground hover:bg-surface-2",
  danger: "bg-surface-2 text-danger border border-border-strong hover:border-danger",
};

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
  size?: keyof typeof sizes;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
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
    <div
      className={`rounded-2xl border border-border bg-surface p-6 ${className}`}
    >
      {children}
    </div>
  );
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

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-12 rounded-xl border border-border-strong bg-surface-2 px-4 text-sm text-foreground placeholder:text-muted-2 outline-none focus:border-accent transition-colors ${
        props.className ?? ""
      }`}
    />
  );
}
