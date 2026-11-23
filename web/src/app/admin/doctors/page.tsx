"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPinOff, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { openDoctorPortal } from "@/components/admin-nav";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";
import { Avatar, Button, Empty, ErrorNote, SkeletonList, StatusTag, Switch } from "@/components/ui";
import type { AdminDoctor } from "@/lib/admin-types";
import { api, ApiError } from "@/lib/api";
import { fmtStamp, rupees } from "@/lib/format";

type Tab = "all" | "active" | "inactive" | "deleted";
type Pending = { kind: "deactivate" | "activate" | "delete" | "restore"; d: AdminDoctor } | null;

export default function AdminDoctorsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [pending, setPending] = useState<Pending>(null);
  const list = useQuery({ queryKey: ["admin-doctors", "all", q], queryFn: () => api<AdminDoctor[]>("/admin/doctors/", { params: { q } }) });

  const all = list.data || [];
  const counts = {
    all: all.filter((d) => d.status !== "deleted").length,
    active: all.filter((d) => d.status === "active").length,
    inactive: all.filter((d) => d.status === "inactive").length,
    deleted: all.filter((d) => d.status === "deleted").length,
  };
  const shown = all.filter((d) => (tab === "all" ? d.status !== "deleted" : d.status === tab));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-doctors"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-appointments"] });
  };

  const act = useMutation({
    mutationFn: async (p: NonNullable<Pending>) => {
      if (p.kind === "activate" || p.kind === "deactivate")
        return api<AdminDoctor>(`/admin/doctors/${p.d.slug}/`, { method: "PATCH", body: { is_active: p.kind === "activate" } });
      if (p.kind === "restore") return api<AdminDoctor>(`/admin/doctors/${p.d.slug}/restore/`, { method: "POST" });
      return api<{ result: string; cancelled: number }>(`/admin/doctors/${p.d.slug}/`, { method: "DELETE", params: { cancel_upcoming: "1" } });
    },
    onSuccess: (res, p) => {
      refresh();
      setPending(null);
      const n = p.d.name;
      if (p.kind === "activate") toast.success(`${n} is taking bookings again.`);
      if (p.kind === "deactivate") toast.success(`${n} is now inactive and hidden from patients.`);
      if (p.kind === "restore") toast.success(`${n} restored as inactive. Check the details, then switch bookings on.`);
      if (p.kind === "delete") {
        const r = res as { result: string; cancelled: number };
        const cancelled = r.cancelled ? ` ${r.cancelled} booking${r.cancelled > 1 ? "s were" : " was"} cancelled and the patients told.` : "";
        toast.success(r.result === "deleted" ? `${n} was deleted.${cancelled}` : `${n} was deleted. Past visits are kept in the records.${cancelled}`);
      }
    },
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "inactive", label: "Inactive" },
    { key: "deleted", label: "Deleted" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Doctors"
        description="Add doctors, switch their bookings on or off, and keep their details up to date."
        actions={
          <Link href="/admin/doctors/new" className="btn btn-primary">
            <Plus className="size-4" aria-hidden /> Add doctor
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface p-1 ring-1 ring-line" role="tablist" aria-label="Doctor status">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-9 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold touch:min-h-11 ${tab === t.key ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
            >
              {t.label} <span className={`ml-1 tabular ${tab === t.key ? "text-white/80" : "text-muted"}`}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Search doctors</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Name, specialty, area, code or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {list.isLoading && <SkeletonList rows={3} />}
      <ErrorNote>{list.error?.message}</ErrorNote>
      {list.data && shown.length === 0 && (
        <Empty title={q ? "No doctors match your search" : tab === "deleted" ? "No deleted doctors" : tab === "all" ? "No doctors yet" : `No ${tab} doctors`}>
          {tab === "all" && !q && (
            <Link href="/admin/doctors/new" className="text-sm font-semibold text-brand">
              Add the first doctor
            </Link>
          )}
        </Empty>
      )}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(21rem,100%),1fr))] gap-4">
        {shown.map((d) => {
          const deleted = d.status === "deleted";
          return (
            <li key={d.slug} className={`card flex flex-col gap-4 p-5 ${deleted ? "bg-canvas" : ""}`}>
              <div className="flex items-start gap-3">
                <Avatar name={d.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{d.name}</p>
                  <p className="truncate text-[13px] text-muted">
                    {d.specialty} · {d.area}
                  </p>
                </div>
                <StatusTag status={d.status} />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                <div>
                  <dt className="text-muted">Login</dt>
                  <dd className="truncate font-medium">{d.username}</dd>
                </div>
                <div>
                  <dt className="text-muted">WhatsApp</dt>
                  <dd className="truncate font-medium">{d.phone_display || "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Fee</dt>
                  <dd className="font-medium">{rupees(d.fee)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Upcoming</dt>
                  <dd className="font-medium">
                    {d.upcoming_bookings} booking{d.upcoming_bookings === 1 ? "" : "s"}
                  </dd>
                </div>
              </dl>

              {!deleted && (d.latitude == null || d.sessions.length === 0) && (
                <div className="grid gap-1.5">
                  {d.sessions.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">No consultation hours, so patients can&apos;t book</p>}
                  {d.latitude == null && (
                    <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
                      <MapPinOff className="size-3.5" aria-hidden /> No clinic location yet
                    </p>
                  )}
                </div>
              )}

              {deleted ? (
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                  <p className="text-xs text-muted">
                    Deleted {fmtStamp(d.archived_at)} · {d.total_bookings} past visit{d.total_bookings === 1 ? "" : "s"} kept
                  </p>
                  <Button size="sm" onClick={() => setPending({ kind: "restore", d })}>
                    <RotateCcw className="size-3.5" aria-hidden /> Restore
                  </Button>
                </div>
              ) : (
                <div className="mt-auto grid gap-3 border-t border-line pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">Taking bookings</span>
                    <Switch checked={d.status === "active"} label={`Taking bookings: ${d.name}`} onChange={(on) => setPending({ kind: on ? "activate" : "deactivate", d })} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/doctors/${d.slug}`} className="btn btn-primary btn-sm">
                      Edit
                    </Link>
                    <Link href="/portal/availability" onClick={() => openDoctorPortal(d.slug)} className="btn btn-secondary btn-sm hover:border-brand">
                      Hours
                    </Link>
                    <Link href="/portal" onClick={() => openDoctorPortal(d.slug)} className="btn btn-secondary btn-sm hover:border-brand">
                      Queue
                    </Link>
                    <button
                      onClick={() => setPending({ kind: "delete", d })}
                      className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-red-700 hover:bg-red-50 touch:min-h-11"
                    >
                      <Trash2 className="size-3.5" aria-hidden /> Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {pending?.kind === "deactivate" && (
        <ConfirmDialog
          title={`Make ${pending.d.name} inactive?`}
          confirmLabel="Make inactive"
          loading={act.isPending}
          error={act.error?.message}
          onClose={() => (setPending(null), act.reset())}
          onConfirm={() => act.mutate(pending)}
        >
          <p>Patients won&apos;t see this doctor on the website, the app or WhatsApp, and can&apos;t book new visits.</p>
          {pending.d.upcoming_bookings > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              The {pending.d.upcoming_bookings} upcoming booking{pending.d.upcoming_bookings === 1 ? " stays" : "s stay"} in place. Cancel {pending.d.upcoming_bookings === 1 ? "it" : "them"} from Bookings if the doctor won&apos;t see {pending.d.upcoming_bookings === 1 ? "that patient" : "those patients"}.
            </p>
          )}
          <p>You can switch bookings back on any time.</p>
        </ConfirmDialog>
      )}

      {pending?.kind === "activate" && (
        <ConfirmDialog
          title={`Make ${pending.d.name} active?`}
          confirmLabel="Start taking bookings"
          danger={false}
          loading={act.isPending}
          error={act.error?.message}
          onClose={() => (setPending(null), act.reset())}
          onConfirm={() => act.mutate(pending)}
        >
          <p>Patients will see this doctor and can book their free times straight away.</p>
          {pending.d.sessions.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">This doctor has no consultation hours yet, so there&apos;s nothing to book. Set their hours first.</p>}
        </ConfirmDialog>
      )}

      {pending?.kind === "restore" && (
        <ConfirmDialog
          title={`Restore ${pending.d.name}?`}
          confirmLabel="Restore doctor"
          danger={false}
          loading={act.isPending}
          error={act.error?.message}
          onClose={() => (setPending(null), act.reset())}
          onConfirm={() => act.mutate(pending)}
        >
          <p>The doctor&apos;s login works again and they come back as <b>Inactive</b>, so patients don&apos;t see them yet.</p>
          <p>Check their details and hours, then switch bookings on.</p>
        </ConfirmDialog>
      )}

      {pending?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${pending.d.name}?`}
          confirmLabel="Delete doctor"
          typeToConfirm="DELETE"
          loading={act.isPending}
          error={act.error instanceof ApiError ? act.error.message : act.error?.message}
          onClose={() => (setPending(null), act.reset())}
          onConfirm={() => act.mutate(pending)}
        >
          <p>This removes the doctor from the website, the app and WhatsApp, and turns off their login.</p>
          {pending.d.upcoming_bookings > 0 ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
              <b>
                {pending.d.upcoming_bookings} upcoming booking{pending.d.upcoming_bookings === 1 ? "" : "s"} will be cancelled.
              </b>{" "}
              Each patient is told on WhatsApp and can book with another doctor.
            </p>
          ) : (
            <p>There are no upcoming bookings.</p>
          )}
          <p className="text-muted">
            {pending.d.total_bookings > 0
              ? "Past visits stay in the records. You can restore this doctor later from the Deleted tab."
              : "This doctor has no booking history, so everything about them is removed permanently."}
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
