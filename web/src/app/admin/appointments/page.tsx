"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { DateInput } from "@/components/date-time-inputs";
import { SlotPicker } from "@/components/slot-picker";
import { useToast } from "@/components/toast";
import { Button, Empty, ErrorNote, Field, Modal, SkeletonList, SourceTag, Spinner, StatusPill } from "@/components/ui";
import type { AdminDoctor, Page } from "@/lib/admin-types";
import { api } from "@/lib/api";
import { fmtDate, fmtTime, rupees, toISODate } from "@/lib/format";
import type { Appointment } from "@/lib/types";

const STATUSES = [
  ["confirmed", "Confirmed"],
  ["checked_in", "Waiting"],
  ["completed", "Seen"],
  ["no_show", "No-show"],
  ["cancelled", "Cancelled"],
] as const;
const SOURCES = [
  ["whatsapp", "WhatsApp"],
  ["web", "Website"],
  ["app", "App"],
  ["walkin", "Walk-in"],
  ["admin", "Admin"],
] as const;
const PAGE = 50;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function useDoctors() {
  return useQuery({ queryKey: ["admin-doctors"], queryFn: () => api<AdminDoctor[]>("/admin/doctors/") });
}

type Confirm =
  | { kind: "cancel" }
  | { kind: "status"; status: "confirmed" | "checked_in" | "completed" | "no_show" }
  | { kind: "move"; date: string; time: string }
  | null;

function ManageBooking({ a, onClose }: { a: Appointment; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [moving, setMoving] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [date, setDate] = useState<string | null>(a.date);
  const [time, setTime] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const onDate = useCallback((d: string) => setDate(d), []);
  const onTime = useCallback((t: string | null) => setTime(t), []);
  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body: object }) => api<Appointment>(`/admin/appointments/${a.code}/${action}/`, { method: "POST", body }),
    onSuccess: (res, v) => {
      qc.invalidateQueries({ queryKey: ["admin-appointments"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      const msg: Record<string, string> = {
        cancel: `Booking ${a.code} cancelled. ${a.patient_phone ? "The patient was told on WhatsApp." : ""}`,
        reschedule: `Moved to ${res.when}. ${a.patient_phone ? "The patient was told on WhatsApp." : ""}`,
        status: `Booking ${a.code} marked as ${res.status_label.toLowerCase()}.`,
      };
      toast.success(msg[v.action]);
      onClose();
    },
  });
  const statusLabel = (s: string) => STATUSES.find(([v]) => v === s)?.[1] ?? s;

  if (confirm?.kind === "cancel")
    return (
      <ConfirmDialog
        title={`Cancel booking ${a.code}?`}
        confirmLabel="Cancel booking"
        loading={act.isPending}
        error={act.error?.message}
        onClose={() => (setConfirm(null), act.reset())}
        onConfirm={() => act.mutate({ action: "cancel", body: { reason } })}
      >
        <p>
          <b>{a.patient.name}</b> with {a.doctor.name}, {a.when}.
        </p>
        <p>{a.patient_phone ? "The patient is told on WhatsApp and offered a new time." : "This patient has no WhatsApp number, so call them to let them know."} The time opens up for others.</p>
        <Field label="Reason (optional, for staff)" htmlFor="creason">
          <input id="creason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: patient called to cancel" />
        </Field>
      </ConfirmDialog>
    );

  if (confirm?.kind === "status") {
    const s = confirm.status;
    const reopening = a.status === "cancelled";
    return (
      <ConfirmDialog
        title={reopening ? `Reopen booking ${a.code}?` : `Mark as ${statusLabel(s).toLowerCase()}?`}
        confirmLabel={reopening ? "Reopen booking" : `Mark as ${statusLabel(s).toLowerCase()}`}
        danger={s === "no_show"}
        loading={act.isPending}
        error={act.error?.message}
        onClose={() => (setConfirm(null), act.reset())}
        onConfirm={() => act.mutate({ action: "status", body: { status: s } })}
      >
        <p>
          <b>{a.patient.name}</b> with {a.doctor.name}, {a.when}.
        </p>
        {reopening && <p>The visit is booked again at the same time, if nobody else has taken it. The patient isn&apos;t messaged automatically, so let them know.</p>}
        {!reopening && s === "no_show" && <p>Use this when the patient didn&apos;t come. It counts in the doctor&apos;s no-show numbers.</p>}
        {!reopening && s === "completed" && <p>The visit is recorded as seen and the fee counts as collected.</p>}
        {!reopening && s === "checked_in" && <p>The patient is marked as waiting at the clinic.</p>}
        {!reopening && s === "confirmed" && <p>The visit goes back to booked and not yet seen.</p>}
      </ConfirmDialog>
    );
  }

  if (confirm?.kind === "move")
    return (
      <ConfirmDialog
        title="Move this booking?"
        confirmLabel="Move booking"
        danger={false}
        loading={act.isPending}
        error={act.error?.message}
        onClose={() => (setConfirm(null), act.reset())}
        onConfirm={() => act.mutate({ action: "reschedule", body: { date: confirm.date, time: confirm.time } })}
      >
        <p>
          <b>{a.patient.name}</b> with {a.doctor.name}
        </p>
        <p>
          From <b>{a.when}</b> to{" "}
          <b>
            {fmtDate(confirm.date)}, {fmtTime(confirm.time)}
          </b>
          .
        </p>
        <p>{a.patient_phone ? "The patient gets the new time on WhatsApp." : "This patient has no WhatsApp number, so call them with the new time."}</p>
      </ConfirmDialog>
    );

  return (
    <Modal title={`Booking ${a.code}`} onClose={onClose} wide={moving}>
      <dl className="grid gap-1.5 rounded-xl bg-canvas p-4 text-sm">
        {[
          ["Patient", `${a.patient.name}${a.patient.age != null ? `, ${a.patient.age}` : ""}`],
          ["Phone", a.patient_phone || "Not given"],
          ["Doctor", a.doctor.name],
          ["When", a.when],
          ["Reason", a.reason || "Consultation"],
          ["Booked via", a.source_label],
          ["Fee", rupees(a.fee)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Status</dt>
          <dd>
            <StatusPill status={a.status} label={a.status_label} />
          </dd>
        </div>
      </dl>

      {!moving ? (
        <>
          <div className="grid gap-2">
            <p className="text-[13px] font-semibold">{a.status === "cancelled" ? "This booking is cancelled" : "Change status"}</p>
            <div className="flex flex-wrap gap-2">
              {a.status === "cancelled" ? (
                <Button size="sm" onClick={() => setConfirm({ kind: "status", status: "confirmed" })}>
                  Reopen booking
                </Button>
              ) : (
                (["confirmed", "checked_in", "completed", "no_show"] as const)
                  .filter((v) => v !== a.status)
                  .map((v) => (
                    <Button key={v} size="sm" onClick={() => setConfirm({ kind: "status", status: v })}>
                      {statusLabel(v)}
                    </Button>
                  ))
              )}
            </div>
          </div>
          {a.status !== "cancelled" && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {a.status === "confirmed" && (
                <Button variant="primary" onClick={() => setMoving(true)}>
                  Reschedule
                </Button>
              )}
              <Button variant="danger" onClick={() => setConfirm({ kind: "cancel" })}>
                Cancel booking
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="grid gap-4">
          <SlotPicker slug={a.doctor.slug} date={date} time={time} onDate={onDate} onTime={onTime} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!date || !time} onClick={() => date && time && setConfirm({ kind: "move", date, time })}>
              {date && time ? `Move to ${fmtDate(date)}, ${fmtTime(time)}` : "Pick a new time"}
            </Button>
            <Button onClick={() => setMoving(false)}>Back</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NewBooking({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const doctors = useDoctors();
  const [slug, setSlug] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", age: "", phone: "", reason: "" });
  const digits = f.phone.replace(/\D/g, "");
  const known = useQuery({
    queryKey: ["admin-patient-lookup", digits],
    queryFn: () => api<{ id: number; name: string; age: number | null; relation: string }[]>("/admin/patients/lookup/", { params: { phone: digits } }),
    enabled: digits.length >= 10,
  });
  const onDate = useCallback((d: string) => setDate(d), []);
  const onTime = useCallback((t: string | null) => setTime(t), []);
  const active = (doctors.data || []).filter((d) => d.is_active);
  const doctor = slug || active[0]?.slug || "";
  const save = useMutation({
    mutationFn: () => api<Appointment>("/admin/appointments/", { method: "POST", body: { doctor, date, time, ...f } }),
    onSuccess: (a) => {
      toast.success(`Booked ${a.code}: ${a.patient.name}, ${a.when}.${f.phone ? " Confirmation sent on WhatsApp." : ""}`);
      qc.invalidateQueries({ queryKey: ["admin-appointments"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      onClose();
    },
  });
  return (
    <Modal title="New booking" onClose={onClose} wide>
      <p className="-mt-2 text-sm text-muted">For a patient who called or came to the desk. If you add their WhatsApp number, they get the confirmation and reminder.</p>
      <Field label="Doctor" htmlFor="ndoc">
        <select
          id="ndoc"
          className="input"
          value={doctor}
          onChange={(e) => {
            setSlug(e.target.value);
            setDate(null);
            setTime(null);
          }}
        >
          {active.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.name} · {d.specialty}
            </option>
          ))}
        </select>
      </Field>
      {doctor && <SlotPicker key={doctor} slug={doctor} date={date} time={time} onDate={onDate} onTime={onTime} />}
      <Field label="WhatsApp number" htmlFor="nphone" hint="Type it first: patients booked before fill in by themselves. Optional for walk-ins.">
        <input id="nphone" className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </Field>
      {(known.data?.length ?? 0) > 0 && (
        <div className="grid gap-1.5 rounded-xl bg-brand-soft p-3">
          <p className="text-[13px] font-semibold text-brand-dark">Booked before with this number. Tap to fill in:</p>
          <div className="flex flex-wrap gap-1.5">
            {known.data!.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setF({ ...f, name: p.name, age: p.age != null ? String(p.age) : "" })}
                className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${f.name === p.name ? "border-brand bg-brand text-white" : "border-brand/30 bg-surface text-brand-dark hover:border-brand"}`}
              >
                {p.name}
                {p.age != null ? `, ${p.age}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[2fr_6rem]">
        <Field label="Patient name" htmlFor="nname">
          <input id="nname" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Age" htmlFor="nage">
          <input id="nage" className="input" inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
        </Field>
      </div>
      <Field label="Reason (optional)" htmlFor="nreason">
        <input id="nreason" className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </Field>
      <ErrorNote>{save.error?.message}</ErrorNote>
      <Button variant="primary" disabled={!time || f.name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate()}>
        {date && time ? `Book ${fmtDate(date)}, ${fmtTime(time)}` : "Pick a time"}
      </Button>
    </Modal>
  );
}

function Bookings() {
  const search = useSearchParams();
  const doctors = useDoctors();
  const [filters, setFilters] = useState({
    date_from: search.get("from") ?? todayISO(),
    date_to: search.get("to") ?? "",
    doctor: search.get("doctor") ?? "",
    status: search.get("status") ?? "",
    source: "",
    q: "",
    order: "",
  });
  const [offset, setOffset] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [open, setOpen] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);
  const set = (k: keyof typeof filters, v: string) => {
    setFilters({ ...filters, [k]: v });
    setOffset(0);
  };
  const shift = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return toISODate(d);
  };
  const RANGES = [
    { key: "today", label: "Today", from: shift(0), to: shift(0), order: "" },
    { key: "tomorrow", label: "Tomorrow", from: shift(1), to: shift(1), order: "" },
    { key: "week", label: "Next 7 days", from: shift(0), to: shift(6), order: "" },
    { key: "upcoming", label: "All upcoming", from: shift(0), to: "", order: "" },
    { key: "past", label: "Past", from: "", to: shift(-1), order: "latest" },
  ];
  const activeRange = RANGES.find((r) => r.from === filters.date_from && r.to === filters.date_to && r.order === filters.order)?.key;
  const pickRange = (r: (typeof RANGES)[number]) => {
    setFilters({ ...filters, date_from: r.from, date_to: r.to, order: r.order });
    setOffset(0);
    setResetKey((k) => k + 1);
  };
  const q = useQuery({
    queryKey: ["admin-appointments", filters, offset],
    queryFn: () => api<Page<Appointment>>("/admin/appointments/", { params: { ...filters, limit: String(PAGE), offset: String(offset) } }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const rows = q.data?.results || [];

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Bookings"
        description="Every booking for every doctor. Open one to reschedule, cancel or change its status."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> New booking
          </Button>
        }
      />

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 ring-1 ring-line" role="tablist" aria-label="Dates">
        {RANGES.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={activeRange === r.key}
            onClick={() => pickRange(r)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold ${activeRange === r.key ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="card grid grid-cols-2 gap-3 p-4 lg:grid-cols-3">
        <label className="relative col-span-2 lg:col-span-3">
          <span className="sr-only">Search bookings</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Search by patient name, phone, booking ID or reason" value={filters.q} onChange={(e) => set("q", e.target.value)} />
        </label>
        <Field label="From" htmlFor="ffrom">
          <DateInput key={`from-${resetKey}`} id="ffrom" value={filters.date_from} onChange={(v) => set("date_from", v)} />
        </Field>
        <Field label="To" htmlFor="fto">
          <DateInput key={`to-${resetKey}`} id="fto" value={filters.date_to} onChange={(v) => set("date_to", v)} />
        </Field>
        <Field label="Doctor" htmlFor="fdoc">
          <select id="fdoc" className="input" value={filters.doctor} onChange={(e) => set("doctor", e.target.value)}>
            <option value="">All doctors</option>
            {doctors.data?.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" htmlFor="fstatus">
          <select id="fstatus" className="input" value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">Any status</option>
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Booked via" htmlFor="fsource">
          <select id="fsource" className="input" value={filters.source} onChange={(e) => set("source", e.target.value)}>
            <option value="">Any channel</option>
            {SOURCES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-2 flex items-end lg:col-span-1">
          <Button
            variant="ghost"
            onClick={() => {
              setFilters({ date_from: "", date_to: "", doctor: "", status: "", source: "", q: "", order: "" });
              setOffset(0);
              setResetKey((k) => k + 1);
            }}
          >
            Show everything
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted">{q.data ? `${q.data.count} booking${q.data.count === 1 ? "" : "s"}` : ""}</p>
      {q.isLoading && <SkeletonList rows={4} />}
      <ErrorNote>{q.error?.message}</ErrorNote>
      {q.data && rows.length === 0 && (
        <Empty title="No bookings match">
          <p className="text-sm text-muted">Change the filters, or press Show everything.</p>
        </Empty>
      )}

      {/* Phones: cards */}
      <ul className="grid gap-3 md:hidden">
        {rows.map((a) => (
          <li key={a.code}>
            <button onClick={() => setOpen(a)} className={`card grid w-full gap-2 p-4 text-left hover:border-brand ${a.status === "cancelled" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-brand-dark">{a.when}</p>
                  <p className="font-semibold">{a.patient.name}</p>
                  <p className="text-[13px] text-muted">
                    {a.doctor.name} · {a.reason || "Consultation"}
                  </p>
                </div>
                <StatusPill status={a.status} label={a.status_label} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <SourceTag source={a.source} label={a.source_label} /> {a.code} {a.patient_phone && `· ${a.patient_phone}`}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Tablets and computers: table */}
      {rows.length > 0 && (
        <div className="card hidden overflow-x-auto md:block">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="bg-canvas text-left">
                {["When", "Patient", "Doctor", "Reason", "Via", "Status", ""].map((h) => (
                  <th key={h} className="label border-b border-line px-4 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.code}
                  onClick={() => setOpen(a)}
                  className={`cursor-pointer border-b border-line last:border-0 hover:bg-canvas ${a.status === "cancelled" ? "opacity-55" : ""}`}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <b className="tabular">{fmtTime(a.time)}</b>
                    <span className="block text-xs text-muted">{fmtDate(a.date)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <b>
                      {a.patient.name}
                      {a.patient.age != null ? `, ${a.patient.age}` : ""}
                    </b>
                    <span className="block text-xs text-muted">
                      {a.code}
                      {a.patient_phone ? ` · ${a.patient_phone}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">{a.doctor.name}</td>
                  <td className="px-4 py-3">{a.reason || "Consultation"}</td>
                  <td className="px-4 py-3">
                    <SourceTag source={a.source} label={a.source_label} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={a.status} label={a.status_label} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" onClick={() => setOpen(a)}>
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {q.data && q.data.count > PAGE && (
        <div className="flex items-center justify-between gap-3">
          <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Previous
          </Button>
          <span className="text-sm text-muted">
            {offset + 1}–{Math.min(offset + PAGE, q.data.count)} of {q.data.count}
          </span>
          <Button disabled={offset + PAGE >= q.data.count} onClick={() => setOffset(offset + PAGE)}>
            Next
          </Button>
        </div>
      )}

      {open && <ManageBooking a={open} onClose={() => setOpen(null)} />}
      {creating && <NewBooking onClose={() => setCreating(false)} />}
    </>
  );
}

export default function AdminAppointmentsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Bookings />
    </Suspense>
  );
}
