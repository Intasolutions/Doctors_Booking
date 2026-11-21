"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { createContext, useContext, useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { Empty, Spinner, StatusTag } from "./ui";

type AdminDoctor = { slug: string; name: string; specialty: string; status: "active" | "inactive" | "deleted" };
type PortalCtx = { slug: string; params: Record<string, string | undefined>; isAdmin: boolean };

const Ctx = createContext<PortalCtx | null>(null);
const KEY = "careslot.portal.doctor";

export function usePortal() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePortal outside PortalShell");
  return c;
}

/** Which doctor the practice pages show: the signed-in doctor, or the one an admin picks. */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const doctors = useQuery({ queryKey: ["admin-doctors"], queryFn: () => api<AdminDoctor[]>("/admin/doctors/"), enabled: isAdmin });
  // Rendered only after sign-in on the client, so reading storage here is safe.
  const [choice, setPicked] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) || "";
    } catch {
      return "";
    }
  });
  const list = (doctors.data || []).filter((d) => d.status !== "deleted");
  const picked = list.some((d) => d.slug === choice) ? choice : list[0]?.slug || "";
  const current = list.find((d) => d.slug === picked);

  const slug = isAdmin ? picked : user?.doctor?.slug || "";
  const value: PortalCtx = { slug, params: isAdmin ? { doctor: slug } : {}, isAdmin };

  if (!user) return null;
  if (user.role === "doctor" && !user.doctor)
    return <Empty title="Your login isn't linked to a doctor profile">Ask the clinic admin to finish setting up your profile.</Empty>;
  if (isAdmin && doctors.isLoading) return <Spinner />;
  if (isAdmin && !list.length)
    return (
      <Empty title="No doctors yet">
        <Link href="/admin/doctors/new" className="text-sm font-semibold text-brand">
          Add the first doctor
        </Link>
      </Empty>
    );

  return (
    <Ctx.Provider value={value}>
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3">
          <label htmlFor="pdoc" className="text-sm font-semibold text-brand-dark">
            Managing
          </label>
          <select
            id="pdoc"
            className="input w-auto min-w-56 bg-surface"
            value={picked}
            onChange={(e) => {
              setPicked(e.target.value);
              try {
                localStorage.setItem(KEY, e.target.value);
              } catch {}
            }}
          >
            {list.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name} · {d.specialty}
              </option>
            ))}
          </select>
          {current && <StatusTag status={current.status} />}
        </div>
      )}
      {slug ? children : <Spinner />}
    </Ctx.Provider>
  );
}
