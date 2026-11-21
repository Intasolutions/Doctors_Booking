"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import { hueFor, initials } from "@/lib/format";
import type { ApptStatus } from "@/lib/types";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "dangerSolid" | "ghost";
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
    dangerSolid: "bg-red-600 text-white hover:bg-red-700",
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
  confirmed: "bg-brand-soft text-brand-dark",
  checked_in: "bg-amber-50 text-amber-700",
  completed: "bg-accent-soft text-accent-dark",
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
  const color = source === "whatsapp" ? "border-accent text-accent-dark" : source === "app" ? "border-brand text-brand" : "border-line text-muted";
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

/** A centred dialog that becomes a bottom sheet on phones. Closes on Escape or a click outside. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    // Escape closes the dialog wherever the focus is; the first field is ready to type into.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    const first = box.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea");
    (first ?? box.current)?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`grid max-h-[92vh] w-full gap-4 overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-muted hover:bg-canvas hover:text-ink" aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** On/off switch. Shows its state in words for screen readers. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-line"
      }`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5.5" : "translate-x-0.5"}`} />
    </button>
  );
}

const TAG: Record<string, string> = {
  active: "bg-accent-soft text-accent-dark",
  inactive: "bg-amber-50 text-amber-800",
  deleted: "bg-red-50 text-red-700",
};
const TAG_LABEL: Record<string, string> = { active: "Active", inactive: "Inactive", deleted: "Deleted" };

export function StatusTag({ status }: { status: "active" | "inactive" | "deleted" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TAG[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {TAG_LABEL[status]}
    </span>
  );
}

/** Grey placeholder blocks shown while a list loads. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card grid animate-pulse gap-3 p-4">
          <div className="h-4 w-1/3 rounded bg-canvas" />
          <div className="h-3 w-2/3 rounded bg-canvas" />
          <div className="h-3 w-1/2 rounded bg-canvas" />
        </div>
      ))}
    </div>
  );
}
