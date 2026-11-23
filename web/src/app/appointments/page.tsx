"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { RequireAuth } from "@/components/require-auth";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { Button, Empty, ErrorNote, SkeletonList, StatusPill } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtTime, weekday } from "@/lib/format";
import type { Appointment } from "@/lib/types";

function Row({ a }: { a: Appointment }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api<Appointment>(`/me/appointments/${a.code}/cancel/`, { method: "POST", body: { source: "web" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setConfirming(false);
      toast.success(`Your visit with ${a.doctor.name} is cancelled. The doctor has been told.`);
    },
  });
  return (
    <div className={`card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${a.upcoming ? "" : "opacity-75"}`}>
      <div className="min-w-24 rounded-xl bg-canvas p-2 text-center">
        <b className="block font-display text-lg leading-tight">{weekday(a.date)}</b>
        <span className="tabular text-xs text-muted">{fmtDate(a.date)}</span>
      </div>
      <div className="min-w-0">
        <p className="font-semibold">
          {fmtTime(a.time)} · {a.doctor.name}
        </p>
        <p className="text-[13px] text-muted">
          {a.doctor.specialty} · {a.doctor.area} · for {a.patient.name}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
          <code className="rounded bg-canvas px-1.5 font-semibold">{a.code}</code>
          <StatusPill status={a.status} label={a.status_label} />
          {a.cancelled_by === "doctor" && <span className="text-xs text-muted">Doctor unavailable, no fee charged</span>}
        </p>
      </div>
      {a.upcoming && (
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1">
          {(
            <>
              <a href={a.doctor.directions_url} target="_blank" rel="noopener" className="btn btn-secondary btn-sm gap-1">
                <MapPin className="size-3.5" aria-hidden /> Directions
              </a>
              <Link href={`/appointments/${a.code}/reschedule`} className="btn btn-secondary btn-sm">
                Reschedule
              </Link>
              <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Cancel this visit?"
          confirmLabel="Cancel visit"
          loading={cancel.isPending}
          error={cancel.error?.message}
          onClose={() => (setConfirming(false), cancel.reset())}
          onConfirm={() => cancel.mutate()}
        >
          <p>
            <b>{a.doctor.name}</b>, {a.when}, for {a.patient.name}.
          </p>
          <p>The doctor is told, and the time opens up for other patients. You can book a new time whenever you like.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function List() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["appointments"], queryFn: () => api<Appointment[]>("/me/appointments/") });
  if (q.isLoading) return <SkeletonList rows={3} />;
  if (q.isError) return <ErrorNote>{q.error.message}</ErrorNote>;
  const all = q.data || [];
  const upcoming = all.filter((a) => a.upcoming).reverse();
  const past = all.filter((a) => !a.upcoming);
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <p className="label">
          {user?.name || "Your account"} · {user?.phone_display}
        </p>
        <h1 className="text-3xl font-extrabold">My appointments</h1>
        <p className="text-muted">Bookings made on the website, the app and WhatsApp all show up here, for you and your family.</p>
      </div>
      <section className="grid gap-3">
        <h2 className="text-lg font-bold">Upcoming</h2>
        {upcoming.length ? (
          upcoming.map((a) => <Row key={a.code} a={a} />)
        ) : (
          <Empty title="No upcoming visits">
            <Link href="/" className="text-sm font-semibold text-brand">
              Find a doctor
            </Link>
          </Empty>
        )}
      </section>
      {past.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-bold">Past and cancelled</h2>
          {past.map((a) => (
            <Row key={a.code} a={a} />
          ))}
        </section>
      )}
    </div>
  );
}

export default function AppointmentsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-8">
        <RequireAuth>
          <List />
        </RequireAuth>
      </main>
      <SiteFooter />
    </>
  );
}
