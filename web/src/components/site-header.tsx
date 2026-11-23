"use client";

import { CalendarDays, LayoutDashboard, LogOut, Menu, Plus, Search, Stethoscope, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/lib/auth";

import { BottomNav, type TabItem } from "./bottom-nav";
import { ConfirmDialog } from "./confirm-dialog";
import { InstallButton } from "./pwa";

export function Logo() {
  return (
    <Link href="/" className="-my-1 flex min-h-11 items-center gap-2.5 font-display text-lg font-extrabold" aria-label="CareSlot home">
      <span className="grid size-8 place-items-center rounded-[10px] bg-brand text-white">
        <Plus className="size-5" strokeWidth={3} aria-hidden />
      </span>
      <span>
        Care<span className="text-accent">Slot</span>
      </span>
    </Link>
  );
}

function useLinks() {
  const { user } = useAuth();
  // Each role sees only what it uses.
  return user?.role === "admin"
    ? [{ href: "/", label: "Find a doctor" }, { href: "/admin", label: "Admin" }]
    : user?.role === "doctor"
      ? [{ href: "/", label: "Find a doctor" }, { href: "/portal", label: "Doctor portal" }]
      : [
          { href: "/", label: "Find a doctor" },
          ...(user ? [{ href: "/appointments", label: "My appointments" }, { href: "/account", label: "Profile & family" }] : []),
        ];
}

export function SiteHeader() {
  const { user, ready, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const links = useLinks();
  // The phone menu remembers the page it was opened on, so it closes itself after navigating.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const [confirmOut, setConfirmOut] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const out = () => {
    setOpenAt(null);
    setConfirmOut(true);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Logo />

        {/* Tablets and computers: everything in one row. */}
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold touch:min-h-11 ${active(l.href) ? "bg-brand-soft text-brand-dark" : "text-muted hover:text-ink"}`}
            >
              {l.label}
            </Link>
          ))}
          {user && (
            <button onClick={out} className="ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted hover:text-ink touch:min-h-11">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {ready && !user && (
            <>
              <Link href="/login" className="btn px-3 text-muted hover:text-ink">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-primary">
                Register
              </Link>
            </>
          )}
          {/* Phones: the tab bar has the pages; this menu has the rest. */}
          {user && (
            <button
              onClick={() => setOpenAt(open ? null : path)}
              aria-expanded={open}
              aria-controls="phone-menu"
              className="btn btn-secondary px-3 md:hidden"
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
              className={`flex min-h-12 items-center rounded-lg px-3 text-[15px] font-semibold ${active(l.href) ? "bg-brand-soft text-brand-dark" : "text-ink hover:bg-canvas"}`}
            >
              {l.label}
            </Link>
          ))}
          <InstallButton onDone={() => setOpenAt(null)} className="flex min-h-12 items-center gap-2 rounded-lg px-3 text-left text-[15px] font-semibold text-ink hover:bg-canvas" />
          <button onClick={out} className="flex min-h-12 items-center gap-2 rounded-lg px-3 text-left text-[15px] font-semibold text-muted hover:bg-canvas">
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

/** Phone tab bar for signed-in people on the patient site. */
function SiteTabs() {
  const { user } = useAuth();
  if (!user) return null;
  const items: TabItem[] =
    user.role === "patient"
      ? [
          { href: "/", label: "Doctors", icon: Search, exact: true },
          { href: "/appointments", label: "My visits", icon: CalendarDays },
          { href: "/account", label: "Profile", icon: UserRound },
        ]
      : [
          { href: "/", label: "Doctors", icon: Search, exact: true },
          user.role === "admin"
            ? { href: "/admin", label: "Admin", icon: LayoutDashboard }
            : { href: "/portal", label: "My practice", icon: Stethoscope },
        ];
  return <BottomNav items={items} className="md:hidden" />;
}

export function SiteFooter() {
  return (
    <>
      <footer className="mt-auto border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted">
          <span className="py-2">© {new Date().getFullYear()} CareSlot. Your details are shared only with the doctor you book.</span>
          <div className="flex flex-wrap items-center gap-x-1">
            <InstallButton className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 hover:text-ink touch:min-h-11" />
            <Link href="/login?as=staff" className="inline-flex min-h-10 items-center rounded-lg px-2 hover:text-ink touch:min-h-11">
              Doctor and staff sign-in
            </Link>
          </div>
        </div>
      </footer>
      <SiteTabs />
    </>
  );
}
