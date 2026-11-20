"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button, ErrorNote, Field, Segmented, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TokenResponse } from "@/lib/types";

type OtpSent = { sent: boolean; phone_display: string; is_new: boolean; dev_code?: string };

function nextUrl(next: string | null, role: string) {
  const fallback = role === "patient" ? "/appointments" : "/portal";
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-12">
        <Suspense fallback={<Spinner />}>
          <LoginForm />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const [mode, setMode] = useState<"otp" | "password">(search.get("as") === "staff" ? "password" : "otp");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const done = (t: TokenResponse) => {
    signIn(t);
    const next = nextUrl(search.get("next"), t.user.role);
    router.replace(t.user.profile_complete ? next : `/register?next=${encodeURIComponent(next)}`);
  };

  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
        <div className="grid gap-2">
          <h1 className="text-3xl font-extrabold">Sign in</h1>
          <p className="text-sm">
            New here?{" "}
            <Link href={`/register${search.get("next") ? `?next=${encodeURIComponent(search.get("next")!)}` : ""}`} className="font-semibold text-brand">
              Create an account
            </Link>
          </p>
          <p className="text-muted">
            {mode === "otp"
              ? "We'll send a 6-digit code to your WhatsApp. No password needed."
              : "For doctors and clinic staff with a username and password."}
          </p>
        </div>
        <Segmented
          value={mode}
          onChange={(m) => (setMode(m), setError(""))}
          options={[
            { value: "otp", label: "Phone number" },
            { value: "password", label: "Doctor / staff password" },
          ]}
        />

        {mode === "otp" && !sent && (
          <form
            className="card grid gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => setSent(await api<OtpSent>("/auth/otp/request/", { method: "POST", body: { phone }, auth: false })));
            }}
          >
            <Field label="Mobile number (WhatsApp)" htmlFor="phone">
              <input id="phone" className="input" inputMode="tel" autoComplete="tel" placeholder="98470 12345" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <Button variant="primary" loading={busy} type="submit">
              Send code on WhatsApp
            </Button>
          </form>
        )}

        {mode === "otp" && sent && (
          <form
            className="card grid gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => done(await api<TokenResponse>("/auth/otp/verify/", { method: "POST", body: { phone, code }, auth: false })));
            }}
          >
            <p className="text-sm">
              We sent a code to <b>{sent.phone_display}</b> on WhatsApp.{" "}
              <button type="button" className="font-semibold text-brand" onClick={() => (setSent(null), setCode(""))}>
                Change number
              </button>
            </p>
            {sent.dev_code && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Development mode: your code is <b className="tabular">{sent.dev_code}</b>. This note never shows on the live site.
              </p>
            )}
            <Field label="6-digit code" htmlFor="code">
              <input id="code" className="input tabular tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus />
            </Field>
            {sent.is_new && (
              <p className="rounded-lg bg-canvas px-3 py-2 text-sm">
                This number isn&apos;t registered yet. After the code, we&apos;ll ask for a few details to set up your account.
              </p>
            )}
            <ErrorNote>{error}</ErrorNote>
            <Button variant="primary" loading={busy} type="submit" disabled={code.length !== 6}>
              Sign in
            </Button>
          </form>
        )}

        {mode === "password" && (
          <form
            className="card grid gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => done(await api<TokenResponse>("/auth/login/", { method: "POST", body: { username, password }, auth: false })));
            }}
          >
            <Field label="Username or phone" htmlFor="username">
              <input id="username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="password">
              <input id="password" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <Button variant="primary" loading={busy} type="submit">
              Sign in
            </Button>
          </form>
        )}
    </>
  );
}
