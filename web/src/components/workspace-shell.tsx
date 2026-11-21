"use client";

import {
  CalendarDays,
  CalendarRange,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  QrCode,
  Settings2,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";

import { ConfirmDialog } from "./confirm-dialog";
import { Logo } from "./site-header";

type Item = { href: string; label: string; icon: typeof Users; exact?: boolean };

const ADMIN: Item[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/appointments", label: "Bookings", icon: CalendarRange },
  { href: "/admin/doctors", label: "Doctors", icon: Stethoscope },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/messages", label: "WhatsApp messages", icon: MessageSquareText },
];
const PRACTICE: Item[] = [
  { href: "/portal", label: "Today's queue", icon: CalendarDays, exact: true },
  { href: "/portal/availability", label: "Hours and leave", icon: Settings2 },
  { href: "/portal/share", label: "Profile, link and QR", icon: QrCode },
];
const ADMIN_TOOLS: Item[] = [...PRACTICE, { href: "/portal/whatsapp", label: "WhatsApp tester", icon: MessageSquareText }];

function NavGroup({ title, items, path, onNavigate }: { title: string; items: Item[]; path: string; onNavigate?: () => void }) {
  return (
    <div className="grid gap-1">
      <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">{title}</p>
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              active ? "bg-brand text-white shadow-sm" : "text-ink/80 hover:bg-canvas hover:text-ink"
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

/** Layout for the admin and doctor areas: sidebar on computers, top bar and menu on phones. */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const open = openAt === path;
  if (!user) return null;
  const isAdmin = user.role === "admin";
  const close = () => setOpenAt(null);

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
        <Link href="/" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted hover:bg-canvas hover:text-ink">
          <ExternalLink className="size-4 shrink-0" aria-hidden /> Patient website
        </Link>
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
      <button onClick={() => setConfirmOut(true)} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink" aria-label="Sign out" title="Sign out">
        <LogOut className="size-4" aria-hidden />
      </button>
    </div>
  );

  return (
    <div className="min-h-full">
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

      {/* Phones and tablets: top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <button
            onClick={() => setOpenAt(open ? null : path)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold"
          >
            {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />} Menu
          </button>
        </div>
        {open && (
          <nav className="grid max-h-[80vh] gap-4 overflow-y-auto border-t border-line px-4 py-4" aria-label="Workspace">
            {nav(close)}
            {account}
          </nav>
        )}
      </header>

      <main className="px-4 pb-16 pt-6 sm:px-6 lg:ml-64 lg:px-10 lg:pt-8">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 content-start gap-6">{children}</div>
      </main>

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
