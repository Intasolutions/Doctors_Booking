"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { openDoctorPortal } from "@/components/admin-nav";
import { PageHeader } from "@/components/page-header";
import { ErrorNote, SkeletonList } from "@/components/ui";
import type { AdminStats } from "@/lib/admin-types";
import { api } from "@/lib/api";
import { fmtDate, rupees } from "@/lib/format";

const SOURCES: Record<string, string> = { whatsapp: "WhatsApp", web: "Website", app: "App", walkin: "Walk-in", admin: "Admin" };

function Tile({ value, label, href }: { value: string | number; label: string; href?: string }) {
  const body = (
    <>
      <b className="tabular block font-display text-3xl">{value}</b>
      <span className="text-[13px] text-muted">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="card px-4 py-3 hover:border-brand">
      {body}
    </Link>
  ) : (
    <div className="card px-4 py-3">{body}</div>
  );
}

export default function AdminOverview() {
  const q = useQuery({ queryKey: ["admin-stats"], queryFn: () => api<AdminStats>("/admin/stats/"), refetchInterval: 30_000 });
  if (q.isLoading) return <SkeletonList rows={3} />;
  if (q.isError) return <ErrorNote>{q.error.message}</ErrorNote>;
  const s = q.data!;
  const todayLink = `/admin/appointments?from=${s.today}&to=${s.today}`;
  const warnings = [
    s.doctors_without_location > 0 && {
      text: `${s.doctors_without_location} active doctor${s.doctors_without_location > 1 ? "s have" : " has"} no clinic location, so patients nearby won't see them first.`,
      href: "/admin/doctors",
    },
    s.whatsapp_failed_today > 0 && { text: `${s.whatsapp_failed_today} WhatsApp message(s) failed to send today.`, href: "/admin/messages" },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <>
      <PageHeader eyebrow={fmtDate(s.today)} title="Overview" description="Today across every doctor. The numbers refresh on their own." />

      {warnings.map((w) => (
        <Link key={w.text} href={w.href} className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w.text}
        </Link>
      ))}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile value={s.bookings_today} label="Visits today" href={todayLink} />
        <Tile value={s.seen_today} label="Seen so far" />
        <Tile value={s.next_7_days} label="Booked, next 7 days" href="/admin/appointments" />
        <Tile value={rupees(s.fees_today)} label="Fees collected today" />
        <Tile value={s.patient_accounts} label="Registered patients" href="/admin/users?role=patient" />
        <Tile value={s.doctors_active} label={`Active doctors${s.doctors_inactive ? ` · ${s.doctors_inactive} off` : ""}`} href="/admin/doctors" />
        <Tile value={s.no_show_today + s.cancelled_today} label="No-shows and cancellations today" href={todayLink} />
        <Tile value={s.whatsapp_messages_today} label="WhatsApp messages today" href="/admin/messages" />
      </div>

      <div className="card grid gap-3 p-5">
        <h2 className="font-bold">Bookings made today, by channel</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Object.entries(s.made_today_by_source).map(([k, n]) => (
            <div key={k} className="rounded-xl bg-canvas px-3 py-2">
              <b className="tabular block text-xl">{n}</b>
              <span className="text-xs text-muted">{SOURCES[k] || k}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 font-bold">Today by doctor</h2>
        <ul className="divide-y divide-line">
          {s.doctors.map((d) => (
            <li key={d.slug} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
              <div className="min-w-48 flex-1">
                <p className="font-semibold">{d.name}</p>
                <p className="text-xs text-muted">
                  {d.specialty}
                  {d.on_leave ? " · on leave today" : ""}
                  {!d.has_location ? " · no clinic location" : ""}
                </p>
              </div>
              <span className="text-sm">
                <b className="tabular">{d.booked}</b> booked · <b className="tabular">{d.seen}</b> seen · <b className="tabular">{d.remaining}</b> to come
              </span>
              <Link href="/portal" onClick={() => openDoctorPortal(d.slug)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-brand">
                Open queue
              </Link>
            </li>
          ))}
          {s.doctors.length === 0 && <li className="px-5 py-6 text-sm text-muted">No active doctors yet. Add one on the Doctors page.</li>}
        </ul>
      </div>
    </>
  );
}
