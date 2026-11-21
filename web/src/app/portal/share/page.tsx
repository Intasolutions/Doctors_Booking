"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState, useSyncExternalStore } from "react";

import { PageHeader } from "@/components/page-header";
import { usePortal } from "@/components/portal";
import { useToast } from "@/components/toast";
import { Button, ErrorNote, Field, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Doctor } from "@/lib/types";

function CopyRow({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex gap-2">
        <input id={id} readOnly className="input font-mono text-[12.5px]" value={value} onFocus={(e) => e.target.select()} />
        <Button
          onClick={() =>
            navigator.clipboard
              .writeText(value)
              .then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))
              .catch(() => (document.getElementById(id) as HTMLInputElement | null)?.select())
          }
        >
          <Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Field>
  );
}

export default function SharePage() {
  const { slug, params } = usePortal();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["doctor-profile", slug], queryFn: () => api<Doctor>("/doctor/profile/", { params }) });
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  return (
    <>
      <PageHeader eyebrow="Practice" title="Profile, link and QR" description="Patients scan the QR code or open the link to book with this doctor directly." />
      <div className="card grid gap-6 p-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="justify-self-start rounded-xl border border-line bg-white p-3">
          <QRCodeSVG value={d.whatsapp_link} size={184} level="M" aria-label={`QR code to book ${d.name} on WhatsApp`} />
        </div>
        <div className="grid content-start gap-4">
          <p className="text-[15px]">
            Patients scan this code with their phone camera. WhatsApp opens with <b>{d.code}</b> typed in, and the bot starts booking with you straight away.
          </p>
          <CopyRow id="wl" label="WhatsApp booking link" value={d.whatsapp_link} />
          <CopyRow id="pl" label="Website profile" value={`${origin}/doctors/${d.slug}`} />
          <p className="text-xs text-muted">Put the code on the clinic board, prescriptions, visiting cards and your Google Business profile.</p>
        </div>
      </div>

      <ProfileForm key={`${slug}:${q.dataUpdatedAt}`} d={d} onSaved={() => qc.invalidateQueries({ queryKey: ["doctor-profile", slug] })} />
    </>
  );
}

function ProfileForm({ d, onSaved }: { d: Doctor; onSaved: () => void }) {
  const { params } = usePortal();
  const toast = useToast();
  const [form, setForm] = useState({
    fee: String(d.fee),
    about: d.about,
    address: d.address,
    languages: d.languages,
    notify_whatsapp: !!d.notify_whatsapp,
    latitude: d.latitude != null ? String(d.latitude) : "",
    longitude: d.longitude != null ? String(d.longitude) : "",
  });
  const [locating, setLocating] = useState("");
  const coordsOk =
    (form.latitude === "" && form.longitude === "") ||
    (Math.abs(Number(form.latitude)) <= 90 && Math.abs(Number(form.longitude)) <= 180 && form.latitude !== "" && form.longitude !== "");
  const save = useMutation({
    mutationFn: () =>
      api<Doctor>("/doctor/profile/", {
        method: "PATCH",
        params,
        body: {
          ...form,
          fee: Number(form.fee),
          latitude: form.latitude === "" ? null : Number(form.latitude),
          longitude: form.longitude === "" ? null : Number(form.longitude),
        },
      }),
    onSuccess: () => {
      toast.success("Profile saved. Patients see the changes now.");
      onSaved();
    },
  });
  const useHere = () => {
    if (!("geolocation" in navigator)) return setLocating("This browser can't share its location.");
    setLocating("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setForm((f) => ({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }));
        setLocating("Location filled in. Save the profile to keep it.");
      },
      () => setLocating("Couldn't get your location. Allow location for this site, or paste the numbers from Google Maps."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  return (
    <>
      <form
        className="card grid gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="text-lg font-bold">Profile shown to patients</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Consultation fee (₹)" htmlFor="fee">
            <input id="fee" className="input" inputMode="numeric" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="Languages" htmlFor="lang">
            <input id="lang" className="input" value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} />
          </Field>
        </div>
        <Field label="Clinic address" htmlFor="addr">
          <input id="addr" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <div className="grid gap-2 rounded-xl bg-canvas p-4">
          <p className="text-[13px] font-semibold">Clinic location on the map</p>
          <p className="text-xs text-muted">
            Patients nearby see you first. Standing in the clinic? Use your current location. Otherwise, right-click the clinic in Google Maps and copy the two numbers.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Latitude" htmlFor="lat">
              <input id="lat" className="input tabular" inputMode="decimal" placeholder="9.966700" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value.trim() })} />
            </Field>
            <Field label="Longitude" htmlFor="lng">
              <input id="lng" className="input tabular" inputMode="decimal" placeholder="76.298500" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value.trim() })} />
            </Field>
            <Button type="button" onClick={useHere}>
              Use my current location
            </Button>
          </div>
          {locating && <p className="text-xs text-muted">{locating}</p>}
          {!coordsOk && <p className="text-xs font-medium text-red-700">Enter both numbers, like 9.9667 and 76.2985.</p>}
          {form.latitude === "" && <p className="text-xs font-medium text-amber-800">Without a location, you appear after the nearby doctors.</p>}
        </div>
        <Field label="About" htmlFor="about">
          <textarea id="about" className="input min-h-24" value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand" checked={form.notify_whatsapp} onChange={(e) => setForm({ ...form, notify_whatsapp: e.target.checked })} />
          Send me a WhatsApp alert for every booking and cancellation, and a morning summary
        </label>
        <ErrorNote>{save.error?.message}</ErrorNote>
        <div className="flex items-center gap-3">
          <Button variant="primary" type="submit" loading={save.isPending} disabled={!coordsOk}>
            Save profile
          </Button>
        </div>
      </form>
    </>
  );
}
