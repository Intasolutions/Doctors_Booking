"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { RequireAuth } from "@/components/require-auth";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button, Empty, ErrorNote, Spinner, StatusPill } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dayParts } from "@/lib/format";
import type { Appointment } from "@/lib/types";

function Row({ a }: { a: Appointment }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api<Appointment>(`/me/appointments/${a.code}/cancel/`, { method: "POST", body: { source: "web" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });
  const p = dayParts(a.date);
  return (
    <div className={`card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${a.upcoming ? "" : "opacity-75"}`}>
      <div className="min-w-17 rounded-xl bg-canvas p-2 text-center">
        <b className="block font-display text-xl leading-tight">{p.day}</b>
        <span className="text-xs text-muted">
          {p.month} · {p.weekday}
        </span>
      </div>
      <div className="min-w-0">
        <p className="font-semibold">
          {a.when.split(", ").slice(-1)[0]} · {a.doctor.name}
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
          {confirming ? (
            <>
              <span className="self-center text-[13px] font-semibold text-red-700">Cancel this visit?</span>
              <Button size="sm" variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Yes, cancel
              </Button>
              <Button size="sm" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </>
          ) : (
            <>
              <a href={a.doctor.directions_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-semibold hover:border-muted">
                <MapPin className="size-3.5" aria-hidden /> Directions
              </a>
              <Link href={`/appointments/${a.code}/reschedule`} className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-semibold hover:border-muted">
                Reschedule
              </Link>
              <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      )}
      {cancel.error && (
        <div className="col-span-full">
          <ErrorNote>{cancel.error.message}</ErrorNote>
        </div>
      )}
    </div>
  );
}

function List() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["appointments"], queryFn: () => api<Appointment[]>("/me/appointments/") });
  if (q.isLoading) return <Spinner />;
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
