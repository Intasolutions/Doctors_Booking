"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LocateFixed, MapPin, MapPinOff, MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { InstallCard } from "@/components/pwa";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Avatar, Button, Empty, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { useHotkeys } from "@/lib/hotkeys";
import { useAuth } from "@/lib/auth";
import { rupees, waNumberDisplay } from "@/lib/format";
import { kmLabel, useGeolocation } from "@/lib/location";
import { rememberSlot } from "@/lib/pending-slot";
import type { Doctor, Meta } from "@/lib/types";

const RADII = [
  { km: 0, label: "Any distance" },
  { km: 3, label: "Within 3 km" },
  { km: 5, label: "Within 5 km" },
  { km: 10, label: "Within 10 km" },
];

function LocationBar({ geo, area, setArea, areas }: { geo: ReturnType<typeof useGeolocation>; area: string; setArea: (a: string) => void; areas: string[] }) {
  if (geo.status === "locating")
    return (
      <p className="flex items-center gap-2 text-sm text-muted" role="status">
        <LocateFixed className="size-4 animate-pulse text-brand" aria-hidden /> Finding your location to show the nearest doctors…
      </p>
    );
  if (geo.status === "ready")
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-accent-dark">
        <MapPin className="size-4" aria-hidden /> Showing doctors nearest to you
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <MapPinOff className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {geo.message} Turn on location to see the doctors nearest to you, or choose your area.
      </span>
      <Button size="sm" onClick={geo.retry}>
        <LocateFixed className="size-4" aria-hidden /> Use my location
      </Button>
      <select className="input w-auto" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Your area">
        <option value="">All areas</option>
        {areas.map((a) => (
          <option key={a}>{a}</option>
        ))}
      </select>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const geo = useGeolocation();
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("");
  const [area, setArea] = useState("");
  const [radius, setRadius] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  useHotkeys({ "/": () => searchRef.current?.focus() });
  const coords = geo.status === "ready" ? geo.coords : null;

  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/meta/", { auth: false }) });
  const doctors = useQuery({
    queryKey: ["doctors", spec, coords ? "" : area, coords?.lat, coords?.lng, radius],
    queryFn: () =>
      api<Doctor[]>("/doctors/", {
        auth: false,
        params: {
          specialty: spec,
          area: coords ? "" : area,
          lat: coords ? coords.lat.toFixed(5) : undefined,
          lng: coords ? coords.lng.toFixed(5) : undefined,
          radius_km: coords && radius ? String(radius) : undefined,
        },
      }),
    // Wait for the location (or its refusal) so the first list is already sorted by distance.
    enabled: geo.status !== "locating",
    placeholderData: keepPreviousData,
  });

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (doctors.data || []).filter((d) => !t || `${d.name} ${d.specialty} ${d.area} ${d.code}`.toLowerCase().includes(t));
  }, [doctors.data, q]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16">
        <section className="grid gap-2 pb-2 pt-8">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Doctors near you</h1>
          <p className="max-w-2xl text-muted">
            Private-practice doctors consulting from their home clinics. Pick a free time, get the confirmation on WhatsApp, and walk in at your slot.
          </p>
        </section>

        {!user && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-soft px-5 py-4">
            <p className="text-sm text-brand-dark">
              <b>New to CareSlot?</b> Register once with your phone number to book for yourself and your family.
            </p>
            <Link href="/register" className="btn btn-primary">
              Register
            </Link>
          </div>
        )}

        <div className="mt-5 grid gap-3">
          <InstallCard />
          <LocationBar geo={geo} area={area} setArea={setArea} areas={meta.data?.areas || []} />
          <div className="grid gap-2.5 sm:grid-cols-[2fr_1fr_1fr]">
            <label className="relative">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                enterKeyHint="search"
                className="input pl-9 pr-9"
                placeholder="Search by doctor, specialty or area"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQ("")}
              />
              <span className="kbd pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">/</span>
            </label>
            <select className="input" value={spec} onChange={(e) => setSpec(e.target.value)} aria-label="Specialty">
              <option value="">All specialties</option>
              {meta.data?.specialties.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select className="input" value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Distance" disabled={!coords}>
              {RADII.map((r) => (
                <option key={r.km} value={r.km}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-3 mt-6 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">
            {doctors.data ? `${list.length} doctor${list.length === 1 ? "" : "s"}${coords ? ", nearest first" : ""}` : "Doctors"}
          </h2>
          <span className="text-xs text-muted">Free times update live as people book on the web, the app and WhatsApp</span>
        </div>

        {(geo.status === "locating" || doctors.isLoading) && <Spinner label={geo.status === "locating" ? "Waiting for your location…" : "Finding doctors…"} />}
        {doctors.isError && <Empty title="Can't load doctors right now">Check your connection and refresh the page.</Empty>}
        {doctors.data && list.length === 0 && (
          <Empty title={radius ? `No doctors within ${radius} km` : "No doctors match that search"}>
            <button className="text-sm font-semibold text-brand" onClick={() => (setQ(""), setSpec(""), setArea(""), setRadius(0))}>
              Show all doctors
            </button>
          </Empty>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-4">
          {list.map((d) => (
            <article key={d.slug} className="card grid content-start gap-3.5 p-5">
              <div className="flex items-start gap-3.5">
                <Avatar name={d.name} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[17px] font-bold">{d.name}</h3>
                  <p className="text-sm text-muted">
                    {d.specialty} · {d.experience_years} yrs
                  </p>
                  <p className="text-[13px]">{d.qualifications}</p>
                </div>
                {d.distance_km != null && (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-dark">{kmLabel(d.distance_km).replace(" away", "")}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden /> {d.area}
                  {d.distance_km != null ? ` · ${kmLabel(d.distance_km)}` : ""}
                </span>
                <span>
                  <b className="text-ink">{rupees(d.fee)}</b> consultation
                </span>
              </div>
              {d.next_slots ? (
                <div className="grid gap-2 rounded-xl bg-accent-soft p-3">
                  <p className="text-[13px] text-accent-dark">
                    Next free · <b>{d.next_slots.label}</b>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.next_slots.times.map((t) => (
                      <button
                        key={t.time}
                        onClick={() => {
                          rememberSlot(d.slug, d.next_slots!.date, t.time);
                          router.push(`/doctors/${d.slug}`);
                        }}
                        className="tabular min-h-9 rounded-lg border border-accent/40 bg-surface px-3 text-[13px] font-semibold text-accent-dark touch:min-h-11 touch:px-3.5 hover:border-accent hover:bg-white"
                        aria-label={`Book ${d.name} at ${t.label}, ${d.next_slots!.label}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg bg-canvas px-3 py-2 text-[13px] text-muted">No free times in the next two weeks</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href={`/doctors/${d.slug}`} className="btn btn-primary">
                  More times
                </Link>
                <a href={d.whatsapp_link} target="_blank" rel="noopener" className="btn btn-secondary">
                  <MessageCircle className="size-4" aria-hidden /> WhatsApp
                </a>
              </div>
            </article>
          ))}
        </div>

        {meta.data && (
          <div className="mt-8 rounded-2xl border border-dashed border-muted/60 px-5 py-4">
            <p className="font-bold">Prefer WhatsApp?</p>
            <p className="text-sm text-muted">
              Message <b>{waNumberDisplay(meta.data.whatsapp_number)}</b> and share your location to see the nearest doctors, or send a doctor&apos;s code like{" "}
              <code className="rounded bg-canvas px-1.5 py-0.5 text-[13px] font-semibold">{doctors.data?.[0]?.code || "DR-NAME"}</code>.
            </p>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
