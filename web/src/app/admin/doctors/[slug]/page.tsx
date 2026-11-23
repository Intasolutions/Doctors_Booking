"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { openDoctorPortal } from "@/components/admin-nav";
import { AdminDoctorForm } from "@/components/admin-doctor-form";
import { PageHeader } from "@/components/page-header";
import { Empty, ErrorNote, SkeletonList, StatusTag } from "@/components/ui";
import type { AdminDoctor } from "@/lib/admin-types";
import { api } from "@/lib/api";

function EditDoctor() {
  const { slug } = useParams<{ slug: string }>();
  const created = useSearchParams().get("created");
  const q = useQuery({ queryKey: ["admin-doctor", slug], queryFn: () => api<AdminDoctor>(`/admin/doctors/${slug}/`) });
  if (q.isLoading) return <SkeletonList rows={3} />;
  if (!q.data) return <ErrorNote>{q.error?.message || "Doctor not found."}</ErrorNote>;
  const d = q.data;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/doctors", label: "All doctors" }}
        title={d.name}
        description={
          <>
            {d.specialty} · code <span className="font-mono">{d.code}</span> · {d.upcoming_bookings} upcoming booking{d.upcoming_bookings === 1 ? "" : "s"}
          </>
        }
        actions={<StatusTag status={d.status} />}
      />
      {d.status === "deleted" ? (
        <Empty title="This doctor is deleted">
          <p className="text-sm text-muted">Restore them from the Deleted tab on the Doctors page to make changes.</p>
          <Link href="/admin/doctors" className="text-sm font-semibold text-brand">
            Go to Doctors
          </Link>
        </Empty>
      ) : (
        <>
          {created && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-dark">
              <span>
                <b>Doctor added.</b> Next, set their weekly hours. Until then, patients can&apos;t book.
              </span>
              <Link href="/portal/availability" onClick={() => openDoctorPortal(d.slug)} className="btn btn-primary btn-sm">
                Set hours now
              </Link>
            </div>
          )}
          <AdminDoctorForm doctor={d} />
        </>
      )}
    </>
  );
}

export default function EditDoctorPage() {
  return (
    <Suspense fallback={<SkeletonList rows={3} />}>
      <EditDoctor />
    </Suspense>
  );
}
