"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/toast";
import { Button, Empty, ErrorNote, Field, Modal, Segmented, SkeletonList, Spinner } from "@/components/ui";
import type { AdminUser, Page } from "@/lib/admin-types";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtStamp } from "@/lib/format";
import { useHotkeys } from "@/lib/hotkeys";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", doctor: "Doctor", patient: "Patient" };
const ROLE_STYLE: Record<string, string> = { admin: "bg-ink text-white", doctor: "bg-brand-soft text-brand-dark", patient: "bg-accent-soft text-accent-dark" };
const PAGE = 50;

function when(iso: string | null) {
  return iso ? fmtStamp(iso) : "Never";
}

type UserConfirm = "disable" | "enable" | "make_admin" | "remove_admin" | "erase" | null;

function ManageUser({ u, onClose }: { u: AdminUser; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user: me } = useAuth();
  const [f, setF] = useState({ name: u.name, phone: u.phone, email: u.email, password: "" });
  const [confirm, setConfirm] = useState<UserConfirm>(null);
  const who = u.name || u.username;
  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    toast.success(msg);
    onClose();
  };
  const patch = useMutation({
    mutationFn: ({ body }: { body: object; msg: string }) => api<AdminUser>(`/admin/users/${u.id}/`, { method: "PATCH", body }),
    onSuccess: (_r, v) => done(v.msg),
  });
  const del = useMutation({
    mutationFn: () => api(`/admin/users/${u.id}/`, { method: "DELETE" }),
    onSuccess: () => done(`${who}'s data was erased.`),
  });
  const fields = patch.error instanceof ApiError ? patch.error.fields : {};
  const self = me?.id === u.id;
  const close = () => {
    setConfirm(null);
    patch.reset();
    del.reset();
  };

  if (confirm === "erase")
    return (
      <ConfirmDialog
        title={`Erase ${who}'s data?`}
        confirmLabel="Erase permanently"
        typeToConfirm="ERASE"
        loading={del.isPending}
        error={del.error?.message}
        onClose={close}
        onConfirm={() => del.mutate()}
      >
        <p>Use this when the person asks for their data to be deleted (DPDP Act).</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Their login is removed.</li>
          <li>Names, phone numbers and birth dates of everyone on the account are wiped.</li>
          <li>Their WhatsApp history is deleted.</li>
          <li>
            Past visits stay in the doctors&apos; records as &ldquo;Erased patient&rdquo;. The {u.bookings} booking{u.bookings === 1 ? "" : "s"} can no longer be traced to them.
          </li>
        </ul>
        <p className="font-semibold text-red-700">This can&apos;t be undone.</p>
      </ConfirmDialog>
    );

  if (confirm) {
    const cfg = {
      disable: {
        title: `Disable ${who}'s login?`,
        label: "Disable login",
        danger: true,
        body: <p>They won&apos;t be able to sign in on the website, the app or the portal. Their bookings and details stay. You can enable the login again later.</p>,
        req: { is_active: false },
        msg: `${who}'s login is disabled.`,
      },
      enable: {
        title: `Enable ${who}'s login?`,
        label: "Enable login",
        danger: false,
        body: <p>They can sign in again straight away.</p>,
        req: { is_active: true },
        msg: `${who}'s login is enabled.`,
      },
      make_admin: {
        title: `Make ${who} an admin?`,
        label: "Make admin",
        danger: true,
        body: <p>Admins can see and change everything: all doctors, all bookings, all users and all WhatsApp messages. Only do this for trusted clinic staff.</p>,
        req: { role: "admin" },
        msg: `${who} is now an admin.`,
      },
      remove_admin: {
        title: `Remove ${who}'s admin rights?`,
        label: "Remove admin rights",
        danger: true,
        body: <p>They become a regular patient account and lose access to the admin area at once.</p>,
        req: { role: "patient" },
        msg: `${who} is no longer an admin.`,
      },
    }[confirm];
    return (
      <ConfirmDialog
        title={cfg.title}
        confirmLabel={cfg.label}
        danger={cfg.danger}
        loading={patch.isPending}
        error={patch.error?.message}
        onClose={close}
        onConfirm={() => patch.mutate({ body: cfg.req, msg: cfg.msg })}
      >
        {cfg.body}
      </ConfirmDialog>
    );
  }

  return (
    <Modal title={who} onClose={onClose}>
      <p className="-mt-2 text-sm text-muted">
        {ROLE_LABEL[u.role]} · joined {when(u.date_joined)} · last sign-in {when(u.last_login)}
        {u.role === "patient" ? ` · ${u.bookings} booking${u.bookings === 1 ? "" : "s"}` : ""}
      </p>
      {u.role === "doctor" && u.doctor && (
        <Link href={`/admin/doctors/${u.doctor.slug}`} className="btn bg-brand-soft text-brand-dark">
          Edit this doctor&apos;s profile and clinic →
        </Link>
      )}
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const body: Record<string, string> = { name: f.name, phone: f.phone, email: f.email };
          if (f.password) body.password = f.password;
          patch.mutate({ body, msg: f.password ? "Details and password saved." : "Details saved." });
        }}
      >
        <Field label="Name" htmlFor="un">
          <input id="un" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Phone" htmlFor="up" error={fields.phone}>
          <input id="up" className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="ue">
          <input id="ue" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        {u.role !== "patient" && (
          <Field label="Set a new password" htmlFor="upw" error={fields.password} hint="Leave empty to keep the current one.">
            <input id="upw" className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
        )}
        <ErrorNote>{patch.error && !Object.keys(fields).length ? patch.error.message : ""}</ErrorNote>
        <Button variant="primary" type="submit" loading={patch.isPending}>
          Save details
        </Button>
      </form>

      {!self && (
        <div className="grid gap-3 border-t border-line pt-4">
          <p className="text-[13px] font-semibold">Access</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={u.is_active ? "danger" : "secondary"} onClick={() => setConfirm(u.is_active ? "disable" : "enable")}>
              {u.is_active ? "Disable login" : "Enable login"}
            </Button>
            {u.role === "patient" && (
              <Button size="sm" onClick={() => setConfirm("make_admin")}>
                Make admin
              </Button>
            )}
            {u.role === "admin" && (
              <Button size="sm" onClick={() => setConfirm("remove_admin")}>
                Remove admin rights
              </Button>
            )}
          </div>
          {u.role === "doctor" && <p className="text-xs text-muted">To stop a doctor taking bookings or to delete them, use the Doctors page.</p>}
        </div>
      )}

      {u.role === "patient" && !self && (
        <div className="grid gap-2 rounded-xl border border-red-200 p-4">
          <p className="text-[13px] font-semibold text-red-700">Erase this person&apos;s data</p>
          <p className="text-xs text-muted">For a deletion request under the DPDP Act. You&apos;ll be asked to confirm.</p>
          <Button size="sm" variant="danger" className="justify-self-start" onClick={() => setConfirm("erase")}>
            Erase data…
          </Button>
        </div>
      )}
    </Modal>
  );
}

function NewAdmin({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ name: "", username: "", password: "", phone: "", email: "" });
  const save = useMutation({
    mutationFn: () => api("/admin/users/", { method: "POST", body: { ...f, role: "admin" } }),
    onSuccess: () => {
      toast.success(`Admin login "${f.username}" created.`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      onClose();
    },
  });
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  return (
    <Modal title="Add an admin" onClose={onClose}>
      <p className="-mt-2 text-sm text-muted">For clinic or office staff. Admins can see and change everything. Add doctors from the Doctors page.</p>
      <Field label="Name" htmlFor="nan">
        <input id="nan" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="Username" htmlFor="nau" error={fields.username}>
        <input id="nau" className="input" autoComplete="off" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
      </Field>
      <Field label="Password" htmlFor="nap" error={fields.password} hint="At least 8 characters.">
        <input id="nap" className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      </Field>
      <Field label="Phone (optional)" htmlFor="naph" error={fields.phone}>
        <input id="naph" className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </Field>
      <ErrorNote>{save.error && !Object.keys(fields).length ? save.error.message : ""}</ErrorNote>
      <Button variant="primary" loading={save.isPending} disabled={!f.username || f.password.length < 8} onClick={() => save.mutate()}>
        Add admin
      </Button>
    </Modal>
  );
}

function Users() {
  const search = useSearchParams();
  const [role, setRole] = useState(search.get("role") ?? "");
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useHotkeys({ "/": () => searchRef.current?.focus() });
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<AdminUser | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useQuery({
    queryKey: ["admin-users", role, q, offset],
    queryFn: () => api<Page<AdminUser>>("/admin/users/", { params: { role, q, limit: String(PAGE), offset: String(offset) } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        eyebrow={list.data ? `${list.data.count} people` : "Admin"}
        title="Users"
        description="Every patient, doctor and admin login. Open a person to edit them or change their access."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add admin
          </Button>
        }
      />
      <div className="grid gap-3">
        <Segmented
          value={role}
          onChange={(r) => (setRole(r), setOffset(0))}
          options={[
            { value: "", label: "Everyone" },
            { value: "patient", label: "Patients" },
            { value: "doctor", label: "Doctors" },
            { value: "admin", label: "Admins" },
          ]}
        />
        <label className="relative">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input ref={searchRef} type="search" enterKeyHint="search" className="input pl-9 pr-9" placeholder="Search by name, phone, username or email" value={q} onChange={(e) => (setQ(e.target.value), setOffset(0))} onKeyDown={(e) => e.key === "Escape" && (setQ(""), setOffset(0))} />
          <span className="kbd pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">/</span>
        </label>
      </div>
      {list.isLoading && <SkeletonList rows={4} />}
      <ErrorNote>{list.error?.message}</ErrorNote>
      {list.data?.results.length === 0 && <Empty title="No one matches" />}
      <ul className="card divide-y divide-line overflow-hidden">
        {list.data?.results.map((u) => (
          <li key={u.id}>
            <button onClick={() => setOpen(u)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-canvas">
              <div className="min-w-44 flex-1">
                <p className="font-semibold">
                  {u.name || u.username}
                  {!u.is_active && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">Disabled</span>}
                  {u.role === "patient" && !u.profile_complete && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800">Not registered yet</span>}
                </p>
                <p className="text-[13px] text-muted">
                  {u.phone_display || "No phone"}
                  {u.role !== "patient" ? ` · ${u.username}` : ""}
                  {u.email ? ` · ${u.email}` : ""}
                </p>
              </div>
              {u.role === "patient" && (
                <span className="text-[13px] text-muted">
                  {u.bookings} booking{u.bookings === 1 ? "" : "s"} · {u.people ?? 0} {u.people === 1 ? "person" : "people"}
                </span>
              )}
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ROLE_STYLE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
            </button>
          </li>
        ))}
      </ul>
      {list.data && list.data.count > PAGE && (
        <div className="flex items-center justify-between gap-3">
          <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Previous
          </Button>
          <span className="text-sm text-muted">
            {offset + 1}–{Math.min(offset + PAGE, list.data.count)} of {list.data.count}
          </span>
          <Button disabled={offset + PAGE >= list.data.count} onClick={() => setOffset(offset + PAGE)}>
            Next
          </Button>
        </div>
      )}
      {open && <ManageUser u={open} onClose={() => setOpen(null)} />}
      {adding && <NewAdmin onClose={() => setAdding(false)} />}
    </>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Users />
    </Suspense>
  );
}
