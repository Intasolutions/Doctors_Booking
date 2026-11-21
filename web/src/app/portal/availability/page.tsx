"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateInput, TimeSelect } from "@/components/date-time-inputs";
import { PageHeader } from "@/components/page-header";
import { usePortal } from "@/components/portal";
import { useToast } from "@/components/toast";
import { Button, ErrorNote, Field, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtTime, WEEKDAYS } from "@/lib/format";
import type { Appointment, DoctorDay, Leave, Schedule, TimeBlock } from "@/lib/types";

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
  const toast = useToast();

  const save = useMutation({
    mutationFn: () =>
      api<Schedule>("/doctor/schedule/", {
        method: "PUT",
        params,
        body: { slot_minutes: slot, sessions: days.flatMap((spans, weekday) => spans.map((s) => ({ weekday, ...s }))) },
      }),
    onSuccess: () => {
      toast.success("Hours saved. Patients see the new times now.");
      qc.invalidateQueries({ queryKey: ["doctor-day", slug] });
    },
  });

  const update = (i: number, fn: (s: Span[]) => Span[]) => {
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
          <div key={name} className="grid items-start gap-2 border-b border-line pb-2 last:border-0 sm:grid-cols-[6rem_minmax(0,1fr)]">
            <p className="pt-2 text-sm font-semibold">{name}</p>
            <div className="grid gap-2">
              {days[i].length === 0 && <p className="pt-2 text-sm text-muted">Closed</p>}
              {days[i].map((s, k) => (
                <div key={k} className="grid max-w-md grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
                  <TimeSelect id={`h${i}-${k}-start`} className="w-full min-w-0" value={s.start} onChange={(v) => update(i, (x) => x.map((y, m) => (m === k ? { ...y, start: v } : y)))} />
                  <span className="text-muted">to</span>
                  <TimeSelect id={`h${i}-${k}-end`} className="w-full min-w-0" value={s.end} onChange={(v) => update(i, (x) => x.map((y, m) => (m === k ? { ...y, end: v } : y)))} />
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
        <select id="slot" className="input w-48" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
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
      </div>
    </div>
  );
}

/** Booked patients a block or leave would cancel, so the confirmation can say how many. */
function useAffected(date: string, start?: string, end?: string) {
  const { slug, params } = usePortal();
  const q = useQuery({
    queryKey: ["doctor-day", slug, date],
    queryFn: () => api<DoctorDay>("/doctor/day/", { params: { ...params, date } }),
    enabled: !!date,
  });
  const hit = (q.data?.appointments || []).filter((a) => a.status === "confirmed" && (!start || !end || (a.time >= start && a.time < end)));
  return { loading: q.isLoading, hit };
}

function AffectedList({ loading, hit }: { loading: boolean; hit: Appointment[] }) {
  if (loading) return <p className="text-muted">Checking bookings…</p>;
  if (!hit.length) return <p>No patients are booked in this time.</p>;
  return (
    <div className="grid gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-900">
      <p className="font-semibold">
        {hit.length} booked patient{hit.length > 1 ? "s" : ""} will be cancelled and told on WhatsApp:
      </p>
      <ul className="list-disc pl-5 text-[13px]">
        {hit.slice(0, 6).map((a) => (
          <li key={a.code}>
            {fmtTime(a.time)} · {a.patient.name}
          </li>
        ))}
        {hit.length > 6 && <li>and {hit.length - 6} more</li>}
      </ul>
    </div>
  );
}

function ConfirmBlock({ f, onClose, onDone }: { f: { date: string; start: string; end: string; reason: string }; onClose: () => void; onDone: () => void }) {
  const { params } = usePortal();
  const toast = useToast();
  const affected = useAffected(f.date, f.start, f.end);
  const add = useMutation({
    mutationFn: () => api<{ cancelled: string[] }>("/doctor/blocks/", { method: "POST", params, body: f }),
    onSuccess: (r) => {
      toast.success(
        `Blocked ${fmtDate(f.date)}, ${fmtTime(f.start)} – ${fmtTime(f.end)}.${r.cancelled.length ? ` ${r.cancelled.length} patient${r.cancelled.length > 1 ? "s were" : " was"} told on WhatsApp.` : ""}`,
      );
      onDone();
    },
  });
  return (
    <ConfirmDialog
      title="Block this time?"
      confirmLabel={affected.hit.length ? `Block and cancel ${affected.hit.length}` : "Block time"}
      danger={affected.hit.length > 0}
      loading={add.isPending}
      error={add.error?.message}
      onClose={onClose}
      onConfirm={() => add.mutate()}
    >
      <p>
        <b>
          {fmtDate(f.date)}, {fmtTime(f.start)} – {fmtTime(f.end)}
        </b>
        . Patients can&apos;t book this time.
      </p>
      <AffectedList {...affected} />
    </ConfirmDialog>
  );
}

function Blocks() {
  const { slug, params } = usePortal();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["blocks", slug], queryFn: () => api<TimeBlock[]>("/doctor/blocks/", { params }) });
  const [f, setF] = useState({ date: todayISO(), start: "18:00", end: "19:00", reason: "" });
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [removing, setRemoving] = useState<TimeBlock | null>(null);
  const [formError, setFormError] = useState("");
  const done = () => {
    qc.invalidateQueries({ queryKey: ["blocks", slug] });
    qc.invalidateQueries({ queryKey: ["doctor-day", slug] });
  };
  const del = useMutation({
    mutationFn: (b: TimeBlock) => api(`/doctor/blocks/${b.id}/`, { method: "DELETE", params }),
    onSuccess: (_r, b) => {
      done();
      setRemoving(null);
      toast.success(`${fmtDate(b.date)}, ${fmtTime(b.start)} – ${fmtTime(b.end)} is open for booking again.`);
    },
  });
  return (
    <div className="card grid gap-4 p-5">
      <div>
        <h2 className="text-lg font-bold">Block time</h2>
        <p className="text-sm text-muted">For an emergency, a surgery or a personal errand. Booked patients in that time are told on WhatsApp.</p>
      </div>
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.date) return setFormError("Enter the day as dd/mm/yyyy.");
          if (f.end <= f.start) return setFormError("The end time must be after the start time.");
          setFormError("");
          setConfirmAdd(true);
        }}
      >
        <div className="col-span-2">
        <Field label="Day" htmlFor="bd">
          <DateInput id="bd" value={f.date} min={todayISO()} onChange={(v) => setF({ ...f, date: v })} required />
        </Field>
        </div>
        <Field label="From" htmlFor="bf">
          <TimeSelect id="bf" value={f.start} onChange={(v) => setF({ ...f, start: v })} />
        </Field>
        <Field label="To" htmlFor="bt">
          <TimeSelect id="bt" value={f.end} onChange={(v) => setF({ ...f, end: v })} />
        </Field>
        <Button type="submit" className="col-span-2 justify-self-start">
          Block…
        </Button>
      </form>
      <ErrorNote>{formError}</ErrorNote>
      <div className="grid">
        {q.data?.length ? (
          q.data.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
              <span>
                {fmtDate(b.date)} · {fmtTime(b.start)} – {fmtTime(b.end)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(b)}>
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No blocked time coming up.</p>
        )}
      </div>
      {confirmAdd && <ConfirmBlock f={f} onClose={() => setConfirmAdd(false)} onDone={() => (setConfirmAdd(false), done())} />}
      {removing && (
        <ConfirmDialog
          title="Remove this block?"
          confirmLabel="Open for booking"
          danger={false}
          loading={del.isPending}
          error={del.error?.message}
          onClose={() => (setRemoving(null), del.reset())}
          onConfirm={() => del.mutate(removing)}
        >
          <p>
            <b>
              {fmtDate(removing.date)}, {fmtTime(removing.start)} – {fmtTime(removing.end)}
            </b>{" "}
            opens for booking again. Patients cancelled earlier aren&apos;t rebooked automatically.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function ConfirmLeave({ date, onClose, onDone }: { date: string; onClose: () => void; onDone: () => void }) {
  const { params } = usePortal();
  const toast = useToast();
  const affected = useAffected(date);
  const add = useMutation({
    mutationFn: () => api<{ cancelled: string[] }>("/doctor/leaves/", { method: "POST", params, body: { date } }),
    onSuccess: (r) => {
      toast.success(`Leave marked for ${fmtDate(date)}.${r.cancelled.length ? ` ${r.cancelled.length} patient${r.cancelled.length > 1 ? "s were" : " was"} told on WhatsApp.` : ""}`);
      onDone();
    },
  });
  return (
    <ConfirmDialog
      title={`Take leave on ${fmtDate(date)}?`}
      confirmLabel={affected.hit.length ? `Take leave and cancel ${affected.hit.length}` : "Take leave"}
      danger={affected.hit.length > 0}
      loading={add.isPending}
      error={add.error?.message}
      onClose={onClose}
      onConfirm={() => add.mutate()}
    >
      <p>Patients can&apos;t book anything on this day.</p>
      <AffectedList {...affected} />
    </ConfirmDialog>
  );
}

function Leaves() {
  const { slug, params } = usePortal();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["leaves", slug], queryFn: () => api<Leave[]>("/doctor/leaves/", { params }) });
  const [date, setDate] = useState(todayISO(1));
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [removing, setRemoving] = useState<Leave | null>(null);
  const done = () => {
    qc.invalidateQueries({ queryKey: ["leaves", slug] });
    qc.invalidateQueries({ queryKey: ["doctor-day", slug] });
  };
  const del = useMutation({
    mutationFn: (l: Leave) => api(`/doctor/leaves/${l.id}/`, { method: "DELETE", params }),
    onSuccess: (_r, l) => {
      done();
      setRemoving(null);
      toast.success(`${fmtDate(l.date)} is open for booking again.`);
    },
  });
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
          if (date) setConfirmAdd(true);
        }}
      >
        <Field label="Day off" htmlFor="ld">
          <DateInput id="ld" value={date} min={todayISO()} onChange={setDate} required />
        </Field>
        <Button type="submit">Mark leave…</Button>
      </form>
      <div className="grid">
        {q.data?.length ? (
          q.data.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
              <span>On leave · {fmtDate(l.date)}</span>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(l)}>
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No leave planned.</p>
        )}
      </div>
      {confirmAdd && <ConfirmLeave date={date} onClose={() => setConfirmAdd(false)} onDone={() => (setConfirmAdd(false), done())} />}
      {removing && (
        <ConfirmDialog
          title={`Cancel leave on ${fmtDate(removing.date)}?`}
          confirmLabel="Open the day for booking"
          danger={false}
          loading={del.isPending}
          error={del.error?.message}
          onClose={() => (setRemoving(null), del.reset())}
          onConfirm={() => del.mutate(removing)}
        >
          <p>Patients can book this day again. Bookings cancelled for the leave aren&apos;t restored automatically.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function AvailabilityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Practice"
        title="Hours and leave"
        description="Set the weekly hours patients can book, block time for emergencies, and mark days off."
      />
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
