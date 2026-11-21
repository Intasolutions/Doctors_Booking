"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Clock, Languages, MapPin, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { SiteFooter, SiteHeader } from "@/components/site-header";
import { SlotPicker } from "@/components/slot-picker";
import { Avatar, Button, Empty, ErrorNote, Field, Segmented, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PENDING_SLOT } from "@/lib/pending-slot";
import { fmtDate, fmtTime, groupHours, rupees } from "@/lib/format";
import type { Appointment, Doctor, Patient } from "@/lib/types";

const PENDING = PENDING_SLOT;

/** A slot the patient picked before being sent to sign in. */
function readPending(slug: string): { date: string; time: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING) || "null");
    return p?.slug === slug ? p : null;
  } catch {
    return null;
  }
}

export default function DoctorPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const doctor = useQuery({ queryKey: ["doctor", slug], queryFn: () => api<Doctor>(`/doctors/${slug}/`, { auth: false }) });
  const patients = useQuery({ queryKey: ["patients"], queryFn: () => api<Patient[]>("/me/patients/"), enabled: !!user });

  const [pending] = useState(() => readPending(slug));
  const [date, setDate] = useState<string | null>(pending?.date ?? null);
  const [time, setTime] = useState<string | null>(pending?.time ?? null);
  const [picked, setWho] = useState<number | "new" | null>(null);
  const who: number | "new" = picked ?? patients.data?.[0]?.id ?? "new";
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState("");
  const [relation, setRelation] = useState("family");
  const [reason, setReason] = useState("");
  const [booked, setBooked] = useState<Appointment | null>(null);

  useEffect(() => {
    try {
      sessionStorage.removeItem(PENDING);
    } catch {}
  }, []);

  // Once a time is picked, bring the rest of the booking form into view.
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (time) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [time]);

  const book = useMutation({
    mutationFn: () =>
      api<Appointment>("/me/appointments/", {
        method: "POST",
        body: {
          doctor: slug,
          date,
          time,
          reason,
          source: "web",
          ...(who === "new" ? { patient: { name: newName, age: Number(newAge), relation: patients.data?.length ? relation : "self" } } : { patient_id: who }),
        },
      }),
    onSuccess: (a) => {
      setBooked(a);
      qc.invalidateQueries({ queryKey: ["slots", slug] });
      qc.invalidateQueries({ queryKey: ["days", slug] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && /booked|passed|available/i.test(e.message)) {
        setTime(null);
        qc.invalidateQueries({ queryKey: ["slots", slug] });
      }
    },
  });

  const onDate = useCallback((d: string) => setDate(d), []);
  const onTime = useCallback((t: string | null) => setTime(t), []);

  if (doctor.isLoading)
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4">
          <Spinner />
        </main>
      </>
    );
  if (!doctor.data)
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-12">
          <Empty title="Doctor not found">
            <Link href="/" className="text-sm font-semibold text-brand">
              See all doctors
            </Link>
          </Empty>
        </main>
      </>
    );

  const d = doctor.data;
  const newOk = newName.trim().length >= 2 && newAge !== "" && Number(newAge) >= 0 && Number(newAge) <= 120;
  const canBook = !!time && (who !== "new" || newOk);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 pb-16 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="grid min-w-0 grid-cols-1 content-start gap-5">
          <div className="flex items-center gap-4">
            <Avatar name={d.name} size="lg" />
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold">{d.name}</h1>
              <p className="text-muted">
                {d.specialty} · {d.experience_years} yrs experience
              </p>
              <p className="text-sm">{d.qualifications}</p>
            </div>
          </div>
          {d.about && <p className="max-w-prose text-[15px]">{d.about}</p>}
          <dl className="card grid gap-3 p-5 text-sm">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div>
                <dt className="sr-only">Address</dt>
                <dd>{d.address}</dd>
                <a href={d.directions_url} target="_blank" rel="noopener" className="font-semibold text-brand">
                  Get directions
                </a>
              </div>
            </div>
            <div className="flex gap-3">
              <Clock className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div>
                <dt className="sr-only">Consultation hours</dt>
                {groupHours(d.hours).map((h) => (
                  <dd key={h.days} className="flex flex-wrap gap-x-3">
                    <span className="min-w-20 font-semibold">{h.days}</span>
                    <span>{h.sessions.join(", ")}</span>
                  </dd>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Languages className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <dd>Speaks {d.languages}</dd>
            </div>
            <div className="flex gap-3 border-t border-line pt-3">
              <span className="font-semibold">{rupees(d.fee)}</span>
              <span className="text-muted">consultation, paid at the clinic · about {d.slot_minutes} min</span>
            </div>
          </dl>
          <a href={d.whatsapp_link} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
            <MessageCircle className="size-4" aria-hidden /> Or book on WhatsApp with code {d.code}
          </a>
        </section>

        <section className="card grid min-w-0 grid-cols-1 content-start gap-5 p-5 sm:p-6" aria-label="Book a visit">
          {booked ? (
            <div className="grid justify-items-center gap-3 py-6 text-center">
              <div className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-dark">
                <CalendarCheck className="size-7" aria-hidden />
              </div>
              <h2 className="text-2xl font-extrabold">Your visit is booked</h2>
              <p className="tabular font-mono text-[15px] font-bold tracking-wide">{booked.code}</p>
              <p className="text-muted">
                {booked.patient.name} · {booked.when}
                <br />
                {d.address}
              </p>
              <p className="text-sm">A confirmation is on its way to your WhatsApp, and we&apos;ll remind you a day before.</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <Link href="/appointments" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                  My appointments
                </Link>
                <Button onClick={() => (setBooked(null), setTime(null), setReason(""))}>Book another</Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold">Book a visit</h2>
              <SlotPicker slug={slug} date={date} time={time} onDate={onDate} onTime={onTime} />

              {time && date && ready && !user && (
                <div className="grid gap-3 rounded-xl bg-canvas p-4">
                  <p className="text-sm">
                    <b>
                      {fmtDate(date)}, {fmtTime(time)}
                    </b>{" "}
                    is free. Register or sign in with your phone number to confirm it.
                  </p>
                  <Link
                    href={`/register?next=/doctors/${slug}`}
                    onClick={() => {
                      try {
                        sessionStorage.setItem(PENDING, JSON.stringify({ slug, date, time }));
                      } catch {}
                    }}
                    className="justify-self-start rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                  >
                    Register to book
                  </Link>
                </div>
              )}

              {time && date && user && !user.profile_complete && (
                <div className="grid gap-3 rounded-xl bg-canvas p-4">
                  <p className="text-sm">Finish your registration to book this time.</p>
                  <Link
                    href={`/register?next=/doctors/${slug}`}
                    onClick={() => {
                      try {
                        sessionStorage.setItem(PENDING, JSON.stringify({ slug, date, time }));
                      } catch {}
                    }}
                    className="justify-self-start rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                  >
                    Complete registration
                  </Link>
                </div>
              )}

              <div ref={formRef} />
              {time && date && user?.profile_complete && (
                <form
                  className="grid gap-4 border-t border-line pt-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    book.mutate();
                  }}
                >
                  <div className="grid gap-2">
                    <p className="text-[13px] font-semibold">Who is the visit for?</p>
                    <Segmented
                      value={who}
                      onChange={setWho}
                      options={[
                        ...(patients.data || []).map((p) => ({ value: p.id as number | "new", label: p.name.split(" ")[0] + (p.relation === "self" ? " (me)" : "") })),
                        { value: "new" as const, label: patients.data?.length ? "Someone else" : "Me" },
                      ]}
                    />
                  </div>
                  {who === "new" && (
                    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                      <Field label="Patient name" htmlFor="pname">
                        <input id="pname" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={user.name || "Full name"} />
                      </Field>
                      <Field label="Age" htmlFor="page">
                        <input id="page" className="input" inputMode="numeric" value={newAge} onChange={(e) => setNewAge(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                      </Field>
                      {!!patients.data?.length && (
                        <Field label="Relation" htmlFor="prel">
                          <select id="prel" className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>
                            {["family", "spouse", "son", "daughter", "father", "mother", "other"].map((r) => (
                              <option key={r} value={r}>
                                {r[0].toUpperCase() + r.slice(1)}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                    </div>
                  )}
                  <Field label="Reason for visit (optional)" htmlFor="reason">
                    <input id="reason" className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: fever since two days" />
                  </Field>
                  <div className="grid gap-1.5 rounded-xl bg-canvas p-4 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">When</span>
                      <b className="text-right">
                        {fmtDate(date)}, {fmtTime(time)}
                      </b>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">Fee</span>
                      <span>{rupees(d.fee)} at the clinic</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">Confirmation to</span>
                      <span>{user.phone_display} on WhatsApp</span>
                    </div>
                  </div>
                  <ErrorNote>{book.error instanceof Error ? book.error.message : ""}</ErrorNote>
                  <Button variant="primary" type="submit" loading={book.isPending} disabled={!canBook}>
                    Confirm booking
                  </Button>
                  <p className="text-xs text-muted">By booking you agree to share these details with {d.name} for this visit.</p>
                </form>
              )}
            </>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
