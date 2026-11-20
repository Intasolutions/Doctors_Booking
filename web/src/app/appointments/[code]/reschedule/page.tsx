"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { RequireAuth } from "@/components/require-auth";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { SlotPicker } from "@/components/slot-picker";
import { Button, ErrorNote, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";

function Reschedule() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const appt = useQuery({ queryKey: ["appointment", code], queryFn: () => api<Appointment>(`/me/appointments/${code}/`) });
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const onDate = useCallback((d: string) => setDate(d), []);
  const onTime = useCallback((t: string | null) => setTime(t), []);
  const move = useMutation({
    mutationFn: () => api<Appointment>(`/me/appointments/${code}/reschedule/`, { method: "POST", body: { date, time, source: "web" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      router.push("/appointments");
    },
  });

  if (appt.isLoading) return <Spinner />;
  if (!appt.data) return <ErrorNote>We couldn&apos;t find that booking.</ErrorNote>;
  const a = appt.data;
  if (!a.upcoming)
    return (
      <p className="text-muted">
        This booking can&apos;t be moved any more.{" "}
        <Link className="font-semibold text-brand" href="/appointments">
          Back to my appointments
        </Link>
      </p>
    );

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="label">Reschedule {a.code}</p>
        <h1 className="text-3xl font-extrabold">Pick a new time with {a.doctor.name}</h1>
        <p className="text-muted">
          Currently {a.when}, for {a.patient.name}.
        </p>
      </div>
      <div className="card grid gap-5 p-5">
        <SlotPicker slug={a.doctor.slug} date={date} time={time} onDate={onDate} onTime={onTime} />
        <ErrorNote>{move.error?.message}</ErrorNote>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!date || !time} loading={move.isPending} onClick={() => move.mutate()}>
            {date && time ? `Move to ${fmtDate(date)}, ${fmtTime(time)}` : "Pick a new time"}
          </Button>
          <Link href="/appointments" className="rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:text-ink">
            Keep current time
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ReschedulePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8">
        <RequireAuth>
          <Reschedule />
        </RequireAuth>
      </main>
      <SiteFooter />
    </>
  );
}
