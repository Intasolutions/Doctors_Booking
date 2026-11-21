"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "@/lib/api";
import { dayName, fmtDate } from "@/lib/format";
import type { DayInfo, DaySlots, Slot } from "@/lib/types";

import { Spinner } from "./ui";

function period(t: string) {
  const h = Number(t.slice(0, 2));
  return h < 12 ? "Morning" : h < 16 ? "Afternoon" : "Evening";
}

const TIP: Record<Slot["status"], string> = {
  free: "Available",
  booked: "Already booked",
  blocked: "Doctor unavailable",
  past: "Time has passed",
};

export function SlotPicker({
  slug,
  date,
  time,
  onDate,
  onTime,
}: {
  slug: string;
  date: string | null;
  time: string | null;
  onDate: (d: string) => void;
  onTime: (t: string | null) => void;
}) {
  const days = useQuery({ queryKey: ["days", slug], queryFn: () => api<DayInfo[]>(`/doctors/${slug}/days/`, { auth: false }) });
  const slots = useQuery({
    queryKey: ["slots", slug, date],
    queryFn: () => api<DaySlots>(`/doctors/${slug}/slots/`, { auth: false, params: { date: date! } }),
    enabled: !!date,
    refetchInterval: 30_000, // other patients are booking too
  });

  // Start on the first day that has a free slot.
  useEffect(() => {
    if (!date && days.data) {
      const first = days.data.find((d) => d.free > 0) || days.data[0];
      if (first) onDate(first.date);
    }
  }, [date, days.data, onDate]);

  // If the chosen time was taken meanwhile, clear it.
  useEffect(() => {
    if (time && slots.data && !slots.data.slots.some((s) => s.time === time && s.status === "free")) onTime(null);
  }, [slots.data, time, onTime]);

  if (days.isLoading) return <Spinner label="Loading free times…" />;
  if (days.isError) return <p className="text-sm text-red-700">Couldn&apos;t load this doctor&apos;s times. Refresh to try again.</p>;

  const groups: Record<string, Slot[]> = {};
  const upcoming = (slots.data?.slots || []).filter((s) => s.status !== "past");
  for (const s of upcoming) (groups[period(s.time)] ||= []).push(s);
  const anyFree = upcoming.some((s) => s.status === "free");

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <div className="min-w-0">
        <p className="label mb-2">Choose a day</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.data!.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => {
                onDate(d.date);
                onTime(null);
              }}
              aria-pressed={d.date === date}
              className={`min-w-22 shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                d.date === date ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-muted"
              }`}
            >
              <span className="block text-[13.5px] font-bold">{dayName(d.date)}</span>
              <span className="block text-xs tabular">{fmtDate(d.date)}</span>
              <span className="text-xs text-muted">{d.on_leave ? "On leave" : d.closed ? "Closed" : d.free ? `${d.free} free` : "Full"}</span>
            </button>
          ))}
        </div>
      </div>

      {slots.isLoading && <Spinner label="Loading times…" />}
      {slots.data && slots.data.on_leave && <p className="text-sm text-muted">The doctor is on leave this day. Pick another day.</p>}
      {slots.data && !slots.data.on_leave && slots.data.slots.length === 0 && (
        <p className="text-sm text-muted">No consultation hours on this day.</p>
      )}
      {Object.entries(groups).map(([label, items]) => (
        <div key={label} className="grid gap-2">
          <p className="label">{label}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
            {items.map((s) => (
              <button
                key={s.time}
                type="button"
                disabled={s.status !== "free"}
                title={TIP[s.status]}
                onClick={() => onTime(s.time)}
                aria-pressed={s.time === time}
                className={`tabular rounded-lg border px-1 py-2 text-[13px] font-semibold transition ${
                  s.time === time
                    ? "border-brand bg-brand text-white"
                    : s.status === "free"
                      ? "border-line bg-surface hover:border-brand"
                      : "border-transparent bg-canvas text-muted line-through opacity-70"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {slots.data && slots.data.slots.length > 0 && !anyFree && (
        <p className="text-sm text-muted">{upcoming.length ? "Every time on this day is taken." : "No more times today."} Try another day.</p>
      )}
    </div>
  );
}
