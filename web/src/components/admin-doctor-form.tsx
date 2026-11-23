"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AdminDoctor } from "@/lib/admin-types";
import { api, ApiError } from "@/lib/api";

import { openDoctorPortal } from "./admin-nav";
import { affectedFrom, type AffectedBooking, ScheduleConflictDialog } from "./schedule-conflict";
import { useToast } from "./toast";
import { Button, ErrorNote, Field } from "./ui";

type Form = Record<string, string | boolean>;

function initial(d?: AdminDoctor): Form {
  return {
    first_name: d?.first_name ?? "",
    last_name: d?.last_name ?? "",
    phone: d?.phone ?? "",
    username: d?.username ?? "",
    password: "",
    email: d?.email ?? "",
    specialty: d?.specialty ?? "",
    qualifications: d?.qualifications ?? "",
    experience_years: String(d?.experience_years ?? ""),
    languages: d?.languages ?? "English, Malayalam",
    about: d?.about ?? "",
    area: d?.area ?? "",
    city: d?.city ?? "Kochi",
    address: d?.address ?? "",
    maps_url: d?.maps_url ?? "",
    latitude: d?.latitude != null ? String(d.latitude) : "",
    longitude: d?.longitude != null ? String(d.longitude) : "",
    fee: String(d?.fee ?? ""),
    slot_minutes: String(d?.slot_minutes ?? 15),
    code: d?.code ?? "",
    is_active: d?.is_active ?? true,
    notify_whatsapp: d?.notify_whatsapp ?? true,
  };
}

export function AdminDoctorForm({ doctor }: { doctor?: AdminDoctor }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => initial(doctor));
  const toast = useToast();
  const [locMsg, setLocMsg] = useState("");
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const str = (k: string) => String(f[k] ?? "");

  // Booked patients a new time per patient would leave out, waiting for the admin's OK.
  const [affected, setAffected] = useState<AffectedBooking[] | null>(null);

  const save = useMutation({
    mutationFn: (cancelAffected: boolean) => {
      const body: Record<string, unknown> = {
        ...f,
        experience_years: Number(f.experience_years || 0),
        fee: Number(f.fee || 0),
        slot_minutes: Number(f.slot_minutes || 15),
        latitude: f.latitude === "" ? null : Number(f.latitude),
        longitude: f.longitude === "" ? null : Number(f.longitude),
      };
      if (!f.password) delete body.password;
      // An existing doctor's status is changed from the Doctors list, with a confirmation.
      if (doctor) delete body.is_active;
      if (cancelAffected) body.cancel_affected = true;
      return doctor
        ? api<AdminDoctor & { cancelled?: string[] }>(`/admin/doctors/${doctor.slug}/`, { method: "PATCH", body })
        : api<AdminDoctor & { cancelled?: string[] }>("/admin/doctors/", { method: "POST", body });
    },
    onSuccess: (d) => {
      setAffected(null);
      qc.invalidateQueries({ queryKey: ["admin-doctors"] });
      qc.invalidateQueries({ queryKey: ["admin-doctor", d.slug] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      if (doctor) {
        const n = d.cancelled?.length ?? 0;
        toast.success(n ? `Changes saved. ${n} booking${n > 1 ? "s were" : " was"} cancelled and the patient${n > 1 ? "s were" : " was"} told on WhatsApp.` : "Changes saved.");
        setF((x) => ({ ...x, password: "" }));
      } else {
        toast.success(`${d.name} added.`);
        router.replace(`/admin/doctors/${d.slug}?created=1`);
      }
    },
    onError: (e) => {
      const list = affectedFrom(e);
      if (list) setAffected(list);
    },
  });
  const conflict = !!affectedFrom(save.error);
  const fields = save.error instanceof ApiError ? save.error.fields : {};

  const useHere = () => {
    if (!("geolocation" in navigator)) return setLocMsg("This browser can't share its location.");
    setLocMsg("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set("latitude", p.coords.latitude.toFixed(6));
        set("longitude", p.coords.longitude.toFixed(6));
        setLocMsg("Filled in from this device. Save to keep it.");
      },
      () => setLocMsg("Couldn't get the location. Paste the numbers from Google Maps instead."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const input = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field label={label} htmlFor={`df-${k}`} error={fields[k]} hint={hint}>
      <input id={`df-${k}`} className="input" value={str(k)} onChange={(e) => set(k, e.target.value)} {...props} />
    </Field>
  );
  const valid = str("first_name").trim() && str("specialty").trim() && str("area").trim() && str("address").trim() && str("fee") !== "";

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(false);
      }}
    >
      <section className="card grid gap-4 p-5">
        <h2 className="text-lg font-bold">Login</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("first_name", "First name", { required: true })}
          {input("last_name", "Last name")}
          {input("phone", "Doctor's WhatsApp number", { type: "tel", inputMode: "tel" }, "Gets booking alerts, and can sign in with a WhatsApp code.")}
          {input("email", "Email (optional)", { type: "email" })}
          {input("username", "Username", { placeholder: "Made from the first name if empty", autoComplete: "off" })}
          {input("password", doctor ? "New password (leave empty to keep)" : "Password (optional)", { type: "password", autoComplete: "new-password", minLength: 8 }, doctor ? (doctor.has_password ? "A password is set." : "No password yet: signs in with a WhatsApp code.") : "At least 8 characters. Without one, the doctor signs in with a WhatsApp code.")}
        </div>
      </section>

      <section className="card grid gap-4 p-5">
        <h2 className="text-lg font-bold">Profile shown to patients</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("specialty", "Specialty", { required: true, placeholder: "General Physician" })}
          {input("qualifications", "Qualifications", { placeholder: "MBBS, MD" })}
          {input("experience_years", "Years of experience", { inputMode: "numeric" })}
          {input("languages", "Languages")}
        </div>
        <Field label="About" htmlFor="df-about">
          <textarea id="df-about" className="input min-h-20" value={str("about")} onChange={(e) => set("about", e.target.value)} />
        </Field>
      </section>

      <section className="card grid gap-4 p-5">
        <h2 className="text-lg font-bold">Clinic and fee</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("area", "Area / locality", { required: true, placeholder: "Kadavanthra" })}
          {input("city", "City")}
        </div>
        {input("address", "Clinic address", { required: true })}
        <div className="grid gap-2 rounded-xl bg-canvas p-4">
          <p className="text-[13px] font-semibold">Location on the map</p>
          <p className="text-xs text-muted">Needed for &ldquo;doctors near you&rdquo;. Right-click the clinic in Google Maps and copy the two numbers.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {input("latitude", "Latitude", { inputMode: "decimal", placeholder: "9.966700" })}
            {input("longitude", "Longitude", { inputMode: "decimal", placeholder: "76.298500" })}
            <Button type="button" onClick={useHere}>
              Use this device&apos;s location
            </Button>
          </div>
          {locMsg && <p className="text-xs text-muted">{locMsg}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {input("fee", "Consultation fee (₹)", { inputMode: "numeric", required: true })}
          <Field label="Time per patient" htmlFor="df-slot">
            <select id="df-slot" className="input" value={str("slot_minutes")} onChange={(e) => set("slot_minutes", e.target.value)}>
              {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </Field>
          {input("code", "WhatsApp code", { placeholder: "DR-NAME (made if empty)" })}
        </div>
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="text-lg font-bold">Settings</h2>
        {!doctor && (
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={!!f.is_active} onChange={(e) => set("is_active", e.target.checked)} />
            <span>
              <b>Start taking bookings once hours are set</b>
              <span className="block text-muted">Leave on unless the doctor isn&apos;t ready. You can switch it on or off from the Doctors list.</span>
            </span>
          </label>
        )}
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={!!f.notify_whatsapp} onChange={(e) => set("notify_whatsapp", e.target.checked)} />
          <span>
            <b>WhatsApp alerts to the doctor</b>
            <span className="block text-muted">A message for each booking and cancellation, and a morning summary.</span>
          </span>
        </label>
      </section>

      <ErrorNote>{affected || conflict ? "" : save.error?.message}</ErrorNote>
      {affected && (
        <ScheduleConflictDialog
          affected={affected}
          loading={save.isPending}
          error={save.error && !conflict ? save.error.message : ""}
          onConfirm={() => save.mutate(true)}
          onClose={() => (setAffected(null), save.reset())}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" type="submit" loading={save.isPending && !affected} disabled={!valid}>
          {doctor ? "Save changes" : "Add doctor"}
        </Button>
        {doctor && (
          <Link href="/portal/availability" onClick={() => openDoctorPortal(doctor.slug)} className="btn btn-secondary hover:border-brand">
            Set hours and leave
          </Link>
        )}
      </div>
    </form>
  );
}
