"use client";

import { LoaderCircle } from "lucide-react";

import { hueFor, initials } from "@/lib/format";
import type { ApptStatus } from "@/lib/types";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "secondary", size = "md", loading, className = "", children, disabled, ...rest }: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-2.5 py-1.5 text-[13px]", md: "px-4 py-2 text-sm" };
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "border border-line bg-surface text-ink hover:border-muted",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
    ghost: "text-muted hover:bg-canvas hover:text-ink",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const h = hueFor(name);
  const s = { sm: "size-10 rounded-xl text-sm", md: "size-13 rounded-2xl text-base", lg: "size-18 rounded-2xl text-2xl" }[size];
  return (
    <div
      className={`grid shrink-0 place-items-center font-display font-extrabold ${s}`}
      style={{ background: `hsl(${h} 45% 90%)`, color: `hsl(${h} 55% 24%)` }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

const STATUS_STYLE: Record<ApptStatus, string> = {
  confirmed: "bg-blue-50 text-blue-700",
  checked_in: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  no_show: "bg-red-50 text-red-700",
  cancelled: "bg-red-50 text-red-700",
};

export function StatusPill({ status, label }: { status: ApptStatus; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function SourceTag({ source, label }: { source: string; label: string }) {
  const color = source === "whatsapp" ? "border-emerald-600 text-emerald-700" : source === "app" ? "border-blue-600 text-blue-700" : "border-line text-muted";
  return <span className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
      {children}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {children}
    </div>
  );
}

export function Field({ label, htmlFor, error, children, hint }: { label: string; htmlFor?: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${
            o.value === value ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
