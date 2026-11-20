"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MessageSquareText, QrCode, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { Spinner } from "./ui";

type AdminDoctor = { slug: string; name: string; specialty: string; is_active: boolean };
type PortalCtx = { slug: string; params: Record<string, string | undefined>; isAdmin: boolean };

const Ctx = createContext<PortalCtx | null>(null);
const KEY = "careslot.portal.doctor";

export function usePortal() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePortal outside PortalShell");
  return c;
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const path = usePathname();
  const isAdmin = user?.role === "admin";
  const doctors = useQuery({ queryKey: ["admin-doctors"], queryFn: () => api<AdminDoctor[]>("/admin/doctors/"), enabled: isAdmin });
  // The shell renders only after sign-in on the client, so reading storage here is safe.
  const [choice, setPicked] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) || "";
    } catch {
      return "";
    }
  });
  const list = doctors.data || [];
  const picked = list.some((d) => d.slug === choice) ? choice : list[0]?.slug || "";

  const slug = isAdmin ? picked : user?.doctor?.slug || "";
  const value = useMemo<PortalCtx>(() => ({ slug, params: isAdmin ? { doctor: slug } : {}, isAdmin }), [slug, isAdmin]);

  const nav = [
    { href: "/portal", label: "Today's queue", icon: CalendarDays },
    { href: "/portal/availability", label: "Availability", icon: Settings2 },
    { href: "/portal/share", label: "Profile, link & QR", icon: QrCode },
    ...(isAdmin ? [{ href: "/portal/whatsapp", label: "WhatsApp tester", icon: MessageSquareText }] : []),
  ];

  if (!user) return null;
  if (user.role === "doctor" && !user.doctor)
    return <p className="py-10 text-muted">Your login isn&apos;t linked to a doctor profile yet. Ask the clinic admin to link it.</p>;
  if (isAdmin && doctors.isLoading) return <Spinner />;
  if (isAdmin && !doctors.data?.length)
    return (
      <p className="py-10 text-muted">
        No doctors yet. Add one in the Django admin (<code>/admin/clinic/doctor/add/</code>), then come back.
      </p>
    );

  return (
    <Ctx.Provider value={value}>
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="grid content-start gap-4">
          {isAdmin && (
            <div className="grid gap-1.5">
              <label htmlFor="pdoc" className="label">
                Managing
              </label>
              <select
                id="pdoc"
                className="input"
                value={picked}
                onChange={(e) => {
                  setPicked(e.target.value);
                  try {
                    localStorage.setItem(KEY, e.target.value);
                  } catch {}
                }}
              >
                {doctors.data?.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.name}
                    {d.is_active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!isAdmin && user.doctor && (
            <div>
              <p className="font-display font-bold">{user.doctor.name}</p>
              <p className="text-xs text-muted">WhatsApp code {user.doctor.code}</p>
            </div>
          )}
          <nav className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1" aria-label="Portal">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${
                  path === href ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="grid min-w-0 content-start gap-5">{slug ? children : <Spinner />}</section>
      </div>
    </Ctx.Provider>
  );
}
