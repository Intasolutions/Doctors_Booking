"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { usePortal } from "@/components/portal";
import { useToast } from "@/components/toast";
import { Button, Empty, ErrorNote, Field, SkeletonList, SourceTag, StatusPill } from "@/components/ui";
import { api } from "@/lib/api";
import { dayLabel, dayName, fmtDate, fmtTime, rupees } from "@/lib/format";
import type { Appointment, DoctorDay } from "@/lib/types";

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Routine steps (check in, seen) are one tap. No-show and cancel ask first. */
function Actions({ a, onChange, onAsk }: { a: Appointment; onChange: (status: string) => void; onAsk: (status: "no_show" | "cancelled") => void }) {
  if (a.status === "confirmed")
    return (
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" onClick={() => onChange("checked_in")}>
          Check in
        </Button>
        <Button size="sm" onClick={() => onAsk("no_show")}>
          No-show
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onAsk("cancelled")}>
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
        Undo no-show
      </Button>
    );
  return null;
}

function Walkin({ date, free, onDone }: { date: string; free: string[]; onDone: () => void }) {
  const { params } = usePortal();
  const toast = useToast();
  const [f, setF] = useState({ name: "", age: "", phone: "", reason: "", time: free[0] || "" });
  const add = useMutation({
    mutationFn: () =>
      api("/doctor/walkins/", {
        method: "POST",
        params,
        body: { ...f, age: f.age ? Number(f.age) : null, date },
      }),
    onSuccess: () => {
      toast.success(`${f.name} added to the queue at ${fmtTime(f.time)}.`);
      onDone();
    },
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
          <input id="wn" className="input" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
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
  const toast = useToast();
  const [ask, setAsk] = useState<{ a: Appointment; status: "no_show" | "cancelled" } | null>(null);
  const status = useMutation({
    mutationFn: ({ a, status }: { a: Appointment; status: string }) =>
      api(`/doctor/appointments/${a.code}/status/`, { method: "POST", params, body: { status } }),
    onSuccess: (_r, { a, status }) => {
      qc.invalidateQueries({ queryKey: ["doctor-day", slug] });
      const done: Record<string, string> = {
        checked_in: `${a.patient.name} checked in.`,
        completed: `${a.patient.name} marked as seen.`,
        no_show: `${a.patient.name} marked as a no-show.`,
        confirmed: `${a.patient.name} is booked again.`,
        cancelled: `Booking cancelled.${a.patient_phone ? " The patient was told on WhatsApp." : ""}`,
      };
      toast.success(done[status] || "Updated.");
      setAsk(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (day.isLoading) return <SkeletonList rows={4} />;
  if (day.isError) return <ErrorNote>{day.error.message}</ErrorNote>;
  const d = day.data!;
  const s = d.summary;
  const isToday = date === localToday();
  const appts = d.appointments;
  const waiting = appts.filter((a) => a.status === "checked_in");
  const upNext = appts.filter((a) => a.status === "confirmed");
  const done = appts.filter((a) => a.status === "completed" || a.status === "no_show");
  const cancelled = appts.filter((a) => a.status === "cancelled");
  // Cards on phones and tablets, table on computers. Used for each group below.
  const renderList = (items: Appointment[]) => (
    <>
        <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
          {items.map((a) => (
            <li key={a.code} className={`card grid gap-3 p-4 ${a.status === "cancelled" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="tabular font-mono text-[13px] font-bold text-brand-dark">{fmtTime(a.time)}</p>
                  <p className={`font-semibold ${a.status === "cancelled" ? "line-through" : ""}`}>
                    {a.patient.name}
                    {a.patient.age != null ? `, ${a.patient.age}` : ""}
                  </p>
                  <p className="text-[13px] text-muted">{a.reason || "Consultation"}</p>
                </div>
                <StatusPill status={a.status} label={a.status_label} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <SourceTag source={a.source} label={a.source_label} />
                <span>{a.code}</span>
                {a.patient_phone && <span>· {a.patient_phone}</span>}
                {a.patient_confirmed && <span className="font-semibold text-accent-dark">· confirmed on WhatsApp</span>}
                {a.status === "cancelled" && a.cancelled_by && <span>· cancelled by {a.cancelled_by}</span>}
              </div>
              <Actions a={a} onChange={(st) => status.mutate({ a, status: st })} onAsk={(st) => setAsk({ a, status: st })} />
            </li>
          ))}
        </ul>
        <div className="card hidden overflow-x-auto lg:block">
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
              {items.map((a) => (
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
                    <Actions a={a} onChange={(st) => status.mutate({ a, status: st })} onAsk={(st) => setAsk({ a, status: st })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </>
  );


  return (
    <>
      <PageHeader
        eyebrow={dayLabel(date)}
        title={isToday ? "Today's queue" : `Appointments on ${fmtDate(date)}`}
        description="Check patients in as they arrive and mark them seen. The list refreshes on its own."
        actions={
          <>
            <Button variant="ghost" onClick={() => day.refetch()} aria-label="Refresh">
              <RefreshCw className={`size-4 ${day.isFetching ? "animate-spin" : ""}`} aria-hidden />
            </Button>
            <Button variant="primary" onClick={() => setWalkin((w) => !w)} disabled={!d.free_slots.length}>
              <Plus className="size-4" aria-hidden /> Add walk-in
            </Button>
          </>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {d.days.map((x) => (
          <button
            key={x.date}
            onClick={() => (setDate(x.date), setWalkin(false))}
            aria-pressed={x.date === date}
            className={`min-w-22 shrink-0 rounded-xl border px-3 py-2 text-left ${x.date === date ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-muted"}`}
          >
            <span className="block text-[13.5px] font-bold">{dayName(x.date)}</span>
              <span className="block text-xs tabular">{fmtDate(x.date)}</span>
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
          <div key={String(l)} className="card px-3 py-2.5 sm:px-4 sm:py-3">
            <b className="tabular block font-display text-xl sm:text-2xl">{v}</b>
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
        <>
          {isToday && (waiting[0] || upNext[0]) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={`content-start gap-2 rounded-2xl p-4 ${waiting[0] ? "grid bg-amber-50 ring-1 ring-amber-200" : "hidden bg-surface ring-1 ring-line sm:grid"}`}>
                <p className="label">Waiting now{waiting.length > 1 ? ` · ${waiting.length} patients` : ""}</p>
                {waiting[0] ? (
                  <>
                    <p className="text-lg font-bold">
                      {waiting[0].patient.name}
                      {waiting[0].patient.age != null ? `, ${waiting[0].patient.age}` : ""}
                    </p>
                    <p className="text-sm text-muted">
                      {fmtTime(waiting[0].time)} · {waiting[0].reason || "Consultation"}
                    </p>
                    <Button variant="primary" className="mt-1 justify-self-start" loading={status.isPending && status.variables?.a.code === waiting[0].code} onClick={() => status.mutate({ a: waiting[0], status: "completed" })}>
                      Mark seen
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted">Nobody is waiting. Check patients in as they arrive.</p>
                )}
              </div>
              <div className="grid content-start gap-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
                <p className="label">Up next{upNext.length > 1 ? ` · ${upNext.length} still to come` : ""}</p>
                {upNext[0] ? (
                  <>
                    <p className="text-lg font-bold">
                      {upNext[0].patient.name}
                      {upNext[0].patient.age != null ? `, ${upNext[0].patient.age}` : ""}
                    </p>
                    <p className="text-sm text-muted">
                      {fmtTime(upNext[0].time)} · {upNext[0].reason || "Consultation"}
                      {upNext[0].patient_confirmed ? " · confirmed on WhatsApp" : ""}
                    </p>
                    <Button className="mt-1 justify-self-start" loading={status.isPending && status.variables?.a.code === upNext[0].code} onClick={() => status.mutate({ a: upNext[0], status: "checked_in" })}>
                      Check in
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted">No more bookings for today.</p>
                )}
              </div>
            </div>
          )}

          {[
            { key: "waiting", title: "Waiting", items: waiting },
            { key: "next", title: isToday ? "Still to come" : "Booked", items: upNext },
            { key: "done", title: "Done", items: done },
          ]
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.key} className="grid gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  {g.title} <span className="tabular rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{g.items.length}</span>
                </h2>
                {renderList(g.items)}
              </section>
            ))}
          {cancelled.length > 0 && (
            <details className="grid gap-3">
              <summary className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-bold text-muted touch:min-h-11">
                Cancelled <span className="tabular rounded-full bg-canvas px-2 py-0.5 text-xs">{cancelled.length}</span>
              </summary>
              <div className="mt-3">{renderList(cancelled)}</div>
            </details>
          )}
        </>
      )}
      {/* Phones and tablets: the queue's next step stays under the thumb while the list scrolls. */}
      {isToday &&
        (waiting[0] || upNext[0]) &&
        (() => {
          const a = waiting[0] ?? upNext[0];
          const seen = !!waiting[0];
          return (
            <>
              <div className="h-16 lg:hidden" aria-hidden />
              <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-2 shadow-[0_-4px_12px_rgb(14_34_54/0.06)] backdrop-blur lg:hidden">
                <div className="mx-auto flex max-w-2xl items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-muted">{seen ? "Waiting now" : `Up next · ${fmtTime(a.time)}`}</p>
                    <p className="truncate font-semibold">
                      {a.patient.name}
                      {a.patient.age != null ? `, ${a.patient.age}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    loading={status.isPending && status.variables?.a.code === a.code}
                    onClick={() => status.mutate({ a, status: seen ? "completed" : "checked_in" })}
                  >
                    {seen ? "Mark seen" : "Check in"}
                  </Button>
                </div>
              </div>
            </>
          );
        })()}
      {ask && (
        <ConfirmDialog
          title={ask.status === "cancelled" ? `Cancel ${ask.a.patient.name}'s visit?` : `Mark ${ask.a.patient.name} as a no-show?`}
          confirmLabel={ask.status === "cancelled" ? "Cancel visit" : "Mark no-show"}
          loading={status.isPending}
          error={status.error?.message}
          onClose={() => (setAsk(null), status.reset())}
          onConfirm={() => status.mutate({ a: ask.a, status: ask.status })}
        >
          <p>
            {fmtTime(ask.a.time)} · {ask.a.reason || "Consultation"} · {ask.a.code}
          </p>
          {ask.status === "cancelled" ? (
            <p>{ask.a.patient_phone ? "The patient is told on WhatsApp and offered a new time." : "This patient has no WhatsApp number, so let them know yourself."} The time opens up for others.</p>
          ) : (
            <p>Use this when the patient didn&apos;t come. You can undo it if they turn up late.</p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
