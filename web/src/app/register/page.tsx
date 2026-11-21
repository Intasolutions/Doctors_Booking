"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { emptyProfile, ProfileFields, profileErrors, type ProfileValues } from "@/components/profile-fields";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button, ErrorNote, Field, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TokenResponse, User } from "@/lib/types";

type Sent = { sent: boolean; phone_display: string; registered: boolean; dev_code?: string };

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export default function RegisterPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10">
        <Suspense fallback={<Spinner />}>
          <Register />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

function Register() {
  const { user, ready, signIn, refreshUser } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNext(search.get("next"));
  const [profile, setProfile] = useState<ProfileValues>(emptyProfile);
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [already, setAlready] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError("");
    setFields({});
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Spinner />;

  // Signed in already (e.g. first booked on WhatsApp) but details missing.
  if (user && !user.profile_complete) {
    return (
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          const filled = { ...profile, name: profile.name || user.name };
          const msg = profileErrors(filled);
          if (msg) return setError(msg);
          run(async () => {
            await api<User>("/auth/me/", { method: "PATCH", body: filled });
            await refreshUser();
            router.replace(next);
          });
        }}
      >
        <div className="grid gap-2">
          <h1 className="text-3xl font-extrabold">Complete your registration</h1>
          <p className="text-muted">Signed in as {user.phone_display}. A few details before you book.</p>
        </div>
        <div className="card grid gap-4 p-5">
          <ProfileFields value={{ ...profile, name: profile.name || user.name }} onChange={setProfile} errors={fields} />
          <ErrorNote>{error}</ErrorNote>
          <Button variant="primary" type="submit" loading={busy}>
            Save and continue
          </Button>
        </div>
      </form>
    );
  }

  if (user) {
    return (
      <div className="grid gap-3">
        <h1 className="text-3xl font-extrabold">You&apos;re registered</h1>
        <p className="text-muted">Signed in as {user.name || user.phone_display}.</p>
        <Link href="/" className="justify-self-start rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          Find doctors near you
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p className="label">Step {sent ? "2 of 2" : "1 of 2"}</p>
        <h1 className="text-3xl font-extrabold">Create your account</h1>
        <p className="text-muted">Register once to book visits for yourself and your family on the website, the app and WhatsApp.</p>
      </div>

      {!sent ? (
        <form
          className="card grid gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const msg = profileErrors(profile);
            if (msg) return setError(msg);
            run(async () => {
              const r = await api<Sent>("/auth/otp/request/", { method: "POST", body: { phone }, auth: false });
              if (r.registered) {
                setAlready(true);
                return;
              }
              setSent(r);
            });
          }}
        >
          <ProfileFields
            value={profile}
            onChange={setProfile}
            errors={fields}
            afterName={
              <Field label="Mobile number (WhatsApp)" htmlFor="rphone" error={fields.phone} hint="We'll send a 6-digit code to this number on WhatsApp.">
                <input id="rphone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="98470 12345" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </Field>
            }
          />
          {already && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This number is already registered.{" "}
              <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold underline">
                Sign in instead
              </Link>
            </p>
          )}
          <ErrorNote>{error}</ErrorNote>
          <Button variant="primary" type="submit" loading={busy}>
            Send code on WhatsApp
          </Button>
        </form>
      ) : (
        <form
          className="card grid gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const t = await api<TokenResponse>("/auth/register/", { method: "POST", body: { ...profile, phone, code }, auth: false });
              signIn(t);
              router.replace(next);
            });
          }}
        >
          <p className="text-sm">
            We sent a 6-digit code to <b>{sent.phone_display}</b> on WhatsApp.{" "}
            <button type="button" className="font-semibold text-brand" onClick={() => (setSent(null), setCode(""))}>
              Change details
            </button>
          </p>
          {sent.dev_code && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Development mode: your code is <b className="tabular">{sent.dev_code}</b>. This note never shows on the live site.
            </p>
          )}
          <Field label="6-digit code" htmlFor="rcode" error={fields.code}>
            <input id="rcode" className="input tabular tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => {
                const c = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(c);
                // Create the account as soon as the 6th digit is typed.
                if (c.length === 6 && !busy)
                  run(async () => {
                    const t = await api<TokenResponse>("/auth/register/", { method: "POST", body: { ...profile, phone, code: c }, auth: false });
                    signIn(t);
                    router.replace(next);
                  });
              }} required autoFocus />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button variant="primary" type="submit" loading={busy} disabled={code.length !== 6}>
            Create account
          </Button>
        </form>
      )}

      <p className="text-sm text-muted">
        Already registered?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand">
          Sign in
        </Link>
      </p>
    </div>
  );
}
