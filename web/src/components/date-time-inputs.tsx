"use client";

import { useState } from "react";

import { fmtDate, fmtTime } from "@/lib/format";

/** Turns typed digits into dd/mm/yyyy as you type. */
function mask(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("/");
}

function toISO(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Date field that always reads and writes dd/mm/yyyy, whatever the computer's
 * language settings. `value` and `onChange` use ISO dates (2026-11-23), or ""
 * while the field is empty or incomplete.
 */
export function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  required,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(() => (value ? fmtDate(value) : ""));
  const iso = toISO(text);
  const tooEarly = iso && min && iso < min;
  const tooLate = iso && max && iso > max;
  const error =
    text.length === 10 && !iso
      ? "That date doesn't exist. Use dd/mm/yyyy."
      : tooEarly
        ? `Choose ${fmtDate(min!)} or later.`
        : tooLate
          ? `Choose ${fmtDate(max!)} or earlier.`
          : "";
  return (
    <div className="grid gap-1">
      <input
        id={id}
        className={`input tabular ${error ? "border-red-400" : ""} ${className}`}
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        required={required}
        value={text}
        aria-invalid={!!error}
        onChange={(e) => {
          const next = mask(e.target.value);
          setText(next);
          const v = toISO(next);
          onChange(v && !(min && v < min) && !(max && v > max) ? v : "");
        }}
      />
      {error && <span className="text-xs font-medium text-red-700">{error}</span>}
    </div>
  );
}

/** Time picker in 12-hour clock (5:00 PM, 5:15 PM…). Value is "HH:MM". */
export function TimeSelect({ id, value, onChange, step = 15, className = "" }: { id: string; value: string; onChange: (v: string) => void; step?: number; className?: string }) {
  const options: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) options.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  if (value && !options.includes(value)) options.push(value);
  options.sort();
  return (
    <select id={id} className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((t) => (
        <option key={t} value={t}>
          {fmtTime(t)}
        </option>
      ))}
    </select>
  );
}
