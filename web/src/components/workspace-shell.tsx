"use client";

import {
  CalendarDays,
  CalendarRange,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  QrCode,
  Settings2,
  Stethoscope,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

import { BottomNav, type TabItem } from "./bottom-nav";
import { ConfirmDialog } from "./confirm-dialog";
import { InstallButton } from "./pwa";
import { Logo } from "./site-header";

type Item = { href: string; label: string; short: string; icon: typeof Users; exact?: boolean };

const ADMIN: Item[] = [
  { href: "/admin", label: "Overview", short: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/appointments", label: "Bookings", short: "Bookings", icon: CalendarRange },
  { href: "/admin/doctors", label: "Doctors", short: "Doctors", icon: Stethoscope },
  { href: "/admin/users", label: "Users", short: "Users", icon: Users },
  { href: "/admin/messages", label: "WhatsApp messages", short: "Messages", icon: MessageSquareText },
];
const PRACTICE: Item[] = [
  { href: "/portal", label: "Today's queue", short: "Queue", icon: CalendarDays, exact: true },
  { href: "/portal/availability", label: "Hours and leave", short: "Hours", icon: Settings2 },
  { href: "/portal/share", label: "Profile, link and QR", short: "Share", icon: QrCode },
];
const ADMIN_TOOLS: Item[] = [...PRACTICE, { href: "/portal/whatsapp", label: "WhatsApp tester", short: "Tester", icon: MessageSquareText }];

const isActive = (path: string, { href, exact }: { href: string; exact?: boolean }) => (exact ? path === href : path === href || path.startsWith(`${href}/`));

function NavGroup({ title, items, path, onNavigate }: { title: string; items: Item[]; path: string; onNavigate?: () => void }) {
  return (
    <div className="grid gap-1">
      <p className="label px-3 pb-1">{title}</p>
      {items.map((it) => {
        const active = isActive(path, it);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition touch:min-h-12 ${
              active ? "bg-brand text-white shadow-sm" : "text-ink/80 hover:bg-canvas hover:text-ink"
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Layout for the admin and doctor areas: sidebar on computers, tab bar and a "More" sheet on phones and tablets. */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const open = openAt === path;
  const close = () => setOpenAt(null);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open]);

  if (!user) return null;
  const isAdmin = user.role === "admin";

  const nav = (onNavigate?: () => void) => (
    <div className="grid gap-6">
      {isAdmin ? (
        <>
          <NavGroup title="Admin" items={ADMIN} path={path} onNavigate={onNavigate} />
          <NavGroup title="Doctor tools" items={ADMIN_TOOLS} path={path} onNavigate={onNavigate} />
        </>
      ) : (
        <NavGroup title="My practice" items={PRACTICE} path={path} onNavigate={onNavigate} />
      )}
      <div className="grid gap-1">
        <Link href="/" onClick={onNavigate} className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-canvas hover:text-ink touch:min-h-12">
          <ExternalLink className="size-4 shrink-0" aria-hidden /> Patient website
        </Link>
        <InstallButton
          onDone={onNavigate}
          className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-muted hover:bg-canvas hover:text-ink touch:min-h-12"
        />
      </div>
    </div>
  );

  const account = (
    <div className="flex items-center gap-3 border-t border-line pt-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark">{initials(user.name || user.phone || "U")}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.doctor?.name || user.name || user.phone_display}</p>
        <p className="text-xs capitalize text-muted">{user.role}</p>
      </div>
      <button
        onClick={() => (close(), setConfirmOut(true))}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted hover:bg-canvas hover:text-ink touch:min-h-11"
        title="Sign out"
      >
        <LogOut className="size-4" aria-hidden /> <span className="lg:sr-only">Sign out</span>
      </button>
    </div>
  );

  // The tab bar: the sections used every day, the rest under More.
  const main = isAdmin ? ADMIN.slice(0, 4) : PRACTICE;
  const inMore = !main.some((it) => isActive(path, it));
  const tabs: TabItem[] = [
    ...main.map((it) => ({ href: it.href, label: it.short, icon: it.icon, exact: it.exact })),
    { label: isAdmin ? "More" : "Menu", icon: isAdmin ? MoreHorizontal : Menu, onClick: () => setOpenAt(open ? null : path), active: open || inMore, expanded: open },
  ];

  return (
    <div className="flex min-h-full flex-col">
      {/* Computers: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-line bg-surface px-4 py-5 lg:flex">
        <div className="px-1">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto" aria-label="Workspace">
          {nav()}
        </nav>
        {account}
      </aside>

      {/* Phones and tablets: slim top bar; sections are in the tab bar at the bottom. */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <Logo />
          <button
            onClick={() => setOpenAt(open ? null : path)}
            aria-label="Account and more"
            className="grid size-11 place-items-center rounded-full"
          >
            <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark">{initials(user.name || user.phone || "U")}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-10 pt-5 sm:px-6 lg:ml-64 lg:px-10 lg:pb-16 lg:pt-8">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 content-start gap-6">{children}</div>
      </main>

      <BottomNav items={tabs} className="lg:hidden" />

      {/* "More" sheet, over the tab bar. */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end bg-ink/40 lg:hidden" onClick={(e) => e.target === e.currentTarget && close()}>
          <nav
            aria-label="Workspace"
            className="mx-auto grid max-h-[85dvh] w-full max-w-2xl gap-4 overflow-y-auto overscroll-contain rounded-t-2xl bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-xl"
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-line" aria-hidden />
            {nav(close)}
            {account}
          </nav>
        </div>
      )}

      {confirmOut && (
        <ConfirmDialog
          title="Sign out?"
          confirmLabel="Sign out"
          danger={false}
          onClose={() => setConfirmOut(false)}
          onConfirm={() => {
            signOut();
            router.push("/login?as=staff");
          }}
        >
          <p>You&apos;ll need your username and password to come back in.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
