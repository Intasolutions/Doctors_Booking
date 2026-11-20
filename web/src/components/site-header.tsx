"use client";

import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-extrabold">
      <span className="grid size-8 place-items-center rounded-[10px] bg-brand text-white">
        <Plus className="size-5" strokeWidth={3} aria-hidden />
      </span>
      CareSlot
    </Link>
  );
}

export function SiteHeader() {
  const { user, ready, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ${path === href ? "bg-canvas text-ink" : "text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Logo />
        <nav className="ml-auto flex flex-wrap items-center gap-1" aria-label="Main">
          {link("/", "Find a doctor")}
          {user && link("/appointments", "My appointments")}
          {user && link("/account", "Profile & family")}
          {(user?.role === "doctor" || user?.role === "admin") && link("/portal", "Doctor portal")}
          {ready && !user && (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
                Sign in
              </Link>
              <Link href="/register" className="ml-1 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                Register
              </Link>
            </>
          )}
          {user && (
            <button
              onClick={() => {
                signOut();
                router.push("/");
              }}
              className="ml-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          )}
        </nav>
      </div>
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
