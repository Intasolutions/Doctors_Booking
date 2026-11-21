"use client";

import { LogOut, Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/lib/auth";

import { ConfirmDialog } from "./confirm-dialog";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-extrabold">
      <span className="grid size-8 place-items-center rounded-[10px] bg-brand text-white">
        <Plus className="size-5" strokeWidth={3} aria-hidden />
      </span>
      <span>
        Care<span className="text-accent">Slot</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, ready, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  // The phone menu remembers the page it was opened on, so it closes itself after navigating.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;

  // Each role sees only what it uses.
  const links =
    user?.role === "admin"
      ? [{ href: "/", label: "Find a doctor" }, { href: "/admin", label: "Admin" }]
      : user?.role === "doctor"
        ? [{ href: "/", label: "Find a doctor" }, { href: "/portal", label: "Doctor portal" }]
        : [
            { href: "/", label: "Find a doctor" },
            ...(user ? [{ href: "/appointments", label: "My appointments" }, { href: "/account", label: "Profile & family" }] : []),
          ];
  const [confirmOut, setConfirmOut] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const out = () => {
    setOpenAt(null);
    setConfirmOut(true);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Logo />

        {/* Tablets and computers: everything in one row. */}
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${active(l.href) ? "bg-brand-soft text-brand-dark" : "text-muted hover:text-ink"}`}
            >
              {l.label}
            </Link>
          ))}
          {user && (
            <button onClick={out} className="ml-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {ready && !user && (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
                Sign in
              </Link>
              <Link href="/register" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                Register
              </Link>
            </>
          )}
          {/* Phones: one menu button instead of rows of links. */}
          {user && (
            <button
              onClick={() => setOpenAt(open ? null : path)}
              aria-expanded={open}
              aria-controls="phone-menu"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold md:hidden"
            >
              {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />} Menu
            </button>
          )}
        </div>
      </div>

      {user && open && (
        <nav id="phone-menu" className="grid gap-1 border-t border-line bg-surface px-4 py-3 md:hidden" aria-label="Main">
          <p className="px-3 pb-1 text-xs text-muted">Signed in as {user.name || user.phone_display}</p>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpenAt(null)}
              aria-current={active(l.href) ? "page" : undefined}
              className={`rounded-lg px-3 py-3 text-[15px] font-semibold ${active(l.href) ? "bg-brand-soft text-brand-dark" : "text-ink hover:bg-canvas"}`}
            >
              {l.label}
            </Link>
          ))}
          <button onClick={out} className="flex items-center gap-2 rounded-lg px-3 py-3 text-left text-[15px] font-semibold text-muted hover:bg-canvas">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </nav>
      )}
      {confirmOut && (
        <ConfirmDialog
          title="Sign out?"
          confirmLabel="Sign out"
          danger={false}
          onClose={() => setConfirmOut(false)}
          onConfirm={() => {
            setConfirmOut(false);
            signOut();
            router.push("/");
          }}
        >
          <p>You can sign back in any time with your phone number.</p>
        </ConfirmDialog>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-6 text-xs text-muted">
        <span>© {new Date().getFullYear()} CareSlot. Your details are shared only with the doctor you book.</span>
        <Link href="/login?as=staff" className="hover:text-ink">
          Doctor and staff sign-in
        </Link>
      </div>
    </footer>
  );
}
