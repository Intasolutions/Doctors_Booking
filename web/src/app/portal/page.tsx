"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";

import { usePortal } from "@/components/portal";
import { Button, Empty, ErrorNote, Field, SourceTag, Spinner, StatusPill } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtTime, rupees } from "@/lib/format";
import type { Appointment, DoctorDay } from "@/lib/types";

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Actions({ a, onChange }: { a: Appointment; onChange: (status: string) => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (a.status === "confirmed")
    return confirmCancel ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-red-700">Cancel and tell the patient?</span>
        <Button size="sm" variant="danger" onClick={() => onChange("cancelled")}>
          Yes
        </Button>
        <Button size="sm" onClick={() => setConfirmCancel(false)}>
          No
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" onClick={() => onChange("checked_in")}>
          Check in
        </Button>
        <Button size="sm" onClick={() => onChange("no_show")}>
          No-show
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>
          Cancel
        </Button>
      </div>
    );
  if (a.status === "checked_in")
    return (
      <Button size="sm" variant="primary" onClick={() => onChange("completed")}>
        Mark seen
      </Button>
    );
  if (a.status === "no_show")
    return (
      <Button size="sm" variant="ghost" onClick={() => onChange("confirmed")}>
        Undo
      </Button>
    );
  return null;
}

function Walkin({ date, free, onDone }: { date: string; free: string[]; onDone: () => void }) {
  const { params } = usePortal();
  const [f, setF] = useState({ name: "", age: "", phone: "", reason: "", time: free[0] || "" });
  const add = useMutation({
    mutationFn: () =>
      api("/doctor/walkins/", {
        method: "POST",
        params,
        body: { ...f, age: f.age ? Number(f.age) : null, date },
      }),
    onSuccess: onDone,
  });
  return (
    <form
      className="card grid gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <p className="label">Add a walk-in patient</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_5rem_2fr_2fr_8rem]">
        <Field label="Name" htmlFor="wn">
          <input id="wn" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Age" htmlFor="wa">
          <input id="wa" className="input" inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
        </Field>
        <Field label="WhatsApp (optional)" htmlFor="wp">
          <input id="wp" className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Reason" htmlFor="wr">
          <input id="wr" className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </Field>
        <Field label="Time" htmlFor="wt">
          <select id="wt" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })}>
            {free.map((t) => (
              <option key={t} value={t}>
                {fmtTime(t)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorNote>{add.error?.message}</ErrorNote>
      <Button variant="primary" type="submit" loading={add.isPending} className="justify-self-start" disabled={!f.time}>
        Add to queue
      </Button>
    </form>
  );
}

export default function TodayPage() {
  const { slug, params } = usePortal();
  const qc = useQueryClient();
  const [date, setDate] = useState(localToday);
  const [walkin, setWalkin] = useState(false);
  const key = ["doctor-day", slug, date];
  const day = useQuery({
    queryKey: key,
    queryFn: () => api<DoctorDay>("/doctor/day/", { params: { ...params, date } }),
    refetchInterval: 30_000,
  });
  const status = useMutation({
    mutationFn: ({ code, status }: { code: string; status: string }) =>
      api(`/doctor/appointments/${code}/status/`, { method: "POST", params, body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctor-day", slug] }),
  });

  if (day.isLoading) return <Spinner />;
  if (day.isError) return <ErrorNote>{day.error.message}</ErrorNote>;
  const d = day.data!;
  const s = d.summary;
  const isToday = date === localToday();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">{fmtDate(date)}</p>
          <h1 className="text-2xl font-extrabold">{isToday ? "Today's queue" : `${d.label}'s appointments`}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => day.refetch()} aria-label="Refresh">
            <RefreshCw className={`size-4 ${day.isFetching ? "animate-spin" : ""}`} aria-hidden />
          </Button>
          <Button variant="primary" onClick={() => setWalkin((w) => !w)} disabled={!d.free_slots.length}>
            <Plus className="size-4" aria-hidden /> Add walk-in
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {d.days.map((x) => (
          <button
            key={x.date}
            onClick={() => (setDate(x.date), setWalkin(false))}
            aria-pressed={x.date === date}
            className={`min-w-22 shrink-0 rounded-xl border px-3 py-2 text-left ${x.date === date ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-muted"}`}
          >
            <span className="block text-[13.5px] font-bold">{x.label === x.short ? x.short.slice(0, 6) : x.label}</span>
            <span className="text-xs text-muted">{x.on_leave ? "On leave" : x.closed ? "Closed" : `${x.free} free`}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [s.booked, "Booked"],
          [s.seen, "Seen"],
          [s.remaining, s.waiting ? `Still to come · ${s.waiting} waiting` : "Still to come"],
          [rupees(s.collected), `Collected of ${rupees(s.expected)}`],
        ].map(([v, l]) => (
          <div key={String(l)} className="card px-4 py-3">
            <b className="tabular block font-display text-2xl">{v}</b>
            <span className="text-[13px] text-muted">{l}</span>
          </div>
        ))}
      </div>

      {s.on_leave && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">You are on leave this day. Patients can&apos;t book.</p>}
      {d.blocks.map((b) => (
        <p key={b.id} className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
          Blocked {fmtTime(b.start)} – {fmtTime(b.end)}
          {b.reason ? ` · ${b.reason}` : ""}
        </p>
      ))}

      {walkin && (
        <Walkin
          key={date}
          date={date}
          free={d.free_slots}
          onDone={() => {
            setWalkin(false);
            qc.invalidateQueries({ queryKey: ["doctor-day", slug] });
          }}
        />
      )}
      <ErrorNote>{status.error?.message}</ErrorNote>

      {d.appointments.length === 0 ? (
        <Empty title={`No appointments ${isToday ? "today" : "on this day"}`}>
          <p className="text-sm text-muted">Bookings appear here as patients book on WhatsApp, the website or the app.</p>
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="bg-canvas text-left">
                {["Time", "Patient", "Reason", "Booked via", "Status", ""].map((h) => (
                  <th key={h} className="label border-b border-line px-4 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.appointments.map((a) => (
                <tr key={a.code} className={`border-b border-line last:border-0 ${a.status === "cancelled" ? "opacity-50" : ""}`}>
                  <td className="tabular whitespace-nowrap px-4 py-3 font-mono text-[13px] font-semibold">{fmtTime(a.time)}</td>
                  <td className="px-4 py-3">
                    <b className={a.status === "cancelled" ? "line-through" : ""}>
                      {a.patient.name}
                      {a.patient.age != null ? `, ${a.patient.age}` : ""}
                    </b>
                    <span className="block text-xs text-muted">
                      {a.code}
                      {a.patient_phone ? ` · ${a.patient_phone}` : ""}
                      {a.patient_confirmed ? " · confirmed on WhatsApp" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">{a.reason || "Consultation"}</td>
                  <td className="px-4 py-3">
                    <SourceTag source={a.source} label={a.source_label} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={a.status} label={a.status_label} />
                    {a.status === "cancelled" && a.cancelled_by && <span className="block text-xs text-muted">by {a.cancelled_by}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Actions a={a} onChange={(st) => status.mutate({ code: a.code, status: st })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
