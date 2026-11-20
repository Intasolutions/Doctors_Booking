"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { usePortal } from "@/components/portal";
import { Button, ErrorNote, Field, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtTime, WEEKDAYS } from "@/lib/format";
import type { Leave, Schedule, TimeBlock } from "@/lib/types";

type Span = { start: string; end: string };

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function HoursEditor() {
  const { slug, params } = usePortal();
  const q = useQuery({ queryKey: ["schedule", slug], queryFn: () => api<Schedule>("/doctor/schedule/", { params }) });
  if (q.isLoading || !q.data) return <Spinner />;
  return <HoursForm key={`${slug}:${q.dataUpdatedAt}`} initial={q.data} />;
}

function HoursForm({ initial }: { initial: Schedule }) {
  const { slug, params } = usePortal();
  const qc = useQueryClient();
  const [days, setDays] = useState<Span[][]>(() => {
    const next: Span[][] = Array.from({ length: 7 }, () => []);
    for (const s of initial.sessions) next[s.weekday].push({ start: s.start, end: s.end });
    return next;
  });
  const [slot, setSlot] = useState(initial.slot_minutes);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api<Schedule>("/doctor/schedule/", {
        method: "PUT",
        params,
        body: { slot_minutes: slot, sessions: days.flatMap((spans, weekday) => spans.map((s) => ({ weekday, ...s }))) },
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["doctor-day", slug] });
    },
  });

  const update = (i: number, fn: (s: Span[]) => Span[]) => {
    setSaved(false);
    setDays((d) => d.map((x, j) => (j === i ? fn(x) : x)));
  };

  return (
    <div className="card grid gap-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Weekly consultation hours</h2>
        <p className="text-sm text-muted">Patients can book only inside these hours. Existing bookings stay as they are.</p>
      </div>
      <div className="grid gap-2">
        {WEEKDAYS.map((name, i) => (
          <div key={name} className="grid items-start gap-2 border-b border-line pb-2 last:border-0 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <p className="pt-2 text-sm font-semibold">{name}</p>
            <div className="grid gap-2">
              {days[i].length === 0 && <p className="pt-2 text-sm text-muted">Closed</p>}
              {days[i].map((s, k) => (
                <div key={k} className="flex flex-wrap items-center gap-2">
                  <input type="time" aria-label={`${name} session ${k + 1} start`} className="input w-32" value={s.start} onChange={(e) => update(i, (x) => x.map((y, m) => (m === k ? { ...y, start: e.target.value } : y)))} />
                  <span className="text-muted">to</span>
                  <input type="time" aria-label={`${name} session ${k + 1} end`} className="input w-32" value={s.end} onChange={(e) => update(i, (x) => x.map((y, m) => (m === k ? { ...y, end: e.target.value } : y)))} />
                  <Button size="sm" variant="ghost" aria-label="Remove session" onClick={() => update(i, (x) => x.filter((_, m) => m !== k))}>
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
              <button className="inline-flex items-center gap-1 justify-self-start text-[13px] font-semibold text-brand" onClick={() => update(i, (x) => [...x, x.length ? { start: "17:00", end: "20:00" } : { start: "09:00", end: "12:00" }])}>
                <Plus className="size-3.5" aria-hidden /> Add session
              </button>
            </div>
          </div>
        ))}
      </div>
      <Field label="Time per patient" htmlFor="slot">
        <select id="slot" className="input w-48" value={slot} onChange={(e) => (setSlot(Number(e.target.value)), setSaved(false))}>
          {[5, 10, 15, 20, 30, 45, 60].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </Field>
      <ErrorNote>{save.error?.message}</ErrorNote>
      <div className="flex items-center gap-3">
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Save hours
        </Button>
        {saved && <span className="text-sm font-semibold text-emerald-700">Saved. Patients see the new times now.</span>}
      </div>
    </div>
  );
}

function Blocks() {
  const { slug, params } = usePortal();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["blocks", slug], queryFn: () => api<TimeBlock[]>("/doctor/blocks/", { params }) });
  const [f, setF] = useState({ date: todayISO(), start: "18:00", end: "19:00", reason: "" });
  const [note, setNote] = useState("");
  const done = () => {
    qc.invalidateQueries({ queryKey: ["blocks", slug] });
    qc.invalidateQueries({ queryKey: ["doctor-day", slug] });
  };
  const add = useMutation({
    mutationFn: () => api<{ cancelled: string[] }>("/doctor/blocks/", { method: "POST", params, body: f }),
    onSuccess: (r) => {
      setNote(r.cancelled.length ? `${r.cancelled.length} booking(s) cancelled. Those patients were told on WhatsApp and offered new times.` : "Blocked. No bookings were affected.");
      done();
    },
  });
  const del = useMutation({ mutationFn: (id: number) => api(`/doctor/blocks/${id}/`, { method: "DELETE", params }), onSuccess: done });
  return (
    <div className="card grid gap-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Block time</h2>
        <p className="text-sm text-muted">For an emergency, a surgery or a personal errand. Booked patients in that time are told on WhatsApp.</p>
      </div>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setNote("");
          add.mutate();
        }}
      >
        <Field label="Day" htmlFor="bd">
          <input id="bd" type="date" className="input" min={todayISO()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        </Field>
        <Field label="From" htmlFor="bf">
          <input id="bf" type="time" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required />
        </Field>
        <Field label="To" htmlFor="bt">
          <input id="bt" type="time" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} required />
        </Field>
        <Button type="submit" loading={add.isPending}>
          Block
        </Button>
      </form>
      <ErrorNote>{add.error?.message}</ErrorNote>
      {note && <p className="text-sm font-semibold text-emerald-700">{note}</p>}
      <div className="grid">
        {q.data?.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
            <span>
              {fmtDate(b.date)} · {fmtTime(b.start)} – {fmtTime(b.end)}
            </span>
            <Button size="sm" variant="ghost" onClick={() => del.mutate(b.id)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Leaves() {
  const { slug, params } = usePortal();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["leaves", slug], queryFn: () => api<Leave[]>("/doctor/leaves/", { params }) });
  const [date, setDate] = useState(todayISO(1));
  const [note, setNote] = useState("");
  const done = () => {
    qc.invalidateQueries({ queryKey: ["leaves", slug] });
    qc.invalidateQueries({ queryKey: ["doctor-day", slug] });
  };
  const add = useMutation({
    mutationFn: () => api<{ cancelled: string[] }>("/doctor/leaves/", { method: "POST", params, body: { date } }),
    onSuccess: (r) => {
      setNote(r.cancelled.length ? `${r.cancelled.length} booking(s) cancelled. Those patients were told on WhatsApp.` : "Leave added. No bookings were affected.");
      done();
    },
  });
  const del = useMutation({ mutationFn: (id: number) => api(`/doctor/leaves/${id}/`, { method: "DELETE", params }), onSuccess: done });
  return (
    <div className="card grid gap-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Leave</h2>
        <p className="text-sm text-muted">Close a full day for booking.</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setNote("");
          add.mutate();
        }}
      >
        <Field label="Day off" htmlFor="ld">
          <input id="ld" type="date" className="input" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Button type="submit" loading={add.isPending}>
          Mark leave
        </Button>
      </form>
      <ErrorNote>{add.error?.message}</ErrorNote>
      {note && <p className="text-sm font-semibold text-emerald-700">{note}</p>}
      <div className="grid">
        {q.data?.length ? (
          q.data.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
              <span>On leave · {fmtDate(l.date)}</span>
              <Button size="sm" variant="ghost" onClick={() => del.mutate(l.id)}>
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No leave planned.</p>
        )}
      </div>
    </div>
  );
}

export default function AvailabilityPage() {
  return (
    <>
      <div>
        <p className="label">Availability</p>
        <h1 className="text-2xl font-extrabold">When patients can book</h1>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <HoursEditor />
        <div className="grid gap-5">
          <Blocks />
          <Leaves />
        </div>
      </div>
    </>
  );
}
