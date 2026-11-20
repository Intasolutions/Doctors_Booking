"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { profileErrors, ProfileFields, type ProfileValues } from "@/components/profile-fields";
import { RequireAuth } from "@/components/require-auth";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Avatar, Button, Empty, ErrorNote, Field, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Patient } from "@/lib/types";

function YourDetails() {
  const { user, refreshUser } = useAuth();
  const [v, setV] = useState<ProfileValues>(() => ({
    name: user?.name || "",
    gender: user?.gender || "",
    date_of_birth: user?.date_of_birth || "",
    email: user?.email || "",
    consent: true,
  }));
  const save = useMutation({
    mutationFn: () => api("/auth/me/", { method: "PATCH", body: v }),
    onSuccess: () => refreshUser(),
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <form
      className="card grid gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="text-lg font-bold">Your details</h2>
      <ProfileFields value={v} onChange={setV} errors={err?.fields} showConsent={false} />
      <ErrorNote>{err?.message}</ErrorNote>
      <div className="flex items-center gap-3">
        <Button variant="primary" type="submit" loading={save.isPending} disabled={!!profileErrors(v)}>
          Save details
        </Button>
        {save.isSuccess && <span className="text-sm font-semibold text-emerald-700">Saved.</span>}
      </div>
    </form>
  );
}

function Family() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["patients"], queryFn: () => api<Patient[]>("/me/patients/") });
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [relation, setRelation] = useState("family");
  const add = useMutation({
    mutationFn: () => api<Patient>("/me/patients/", { method: "POST", body: { name, age: Number(age), relation } }),
    onSuccess: () => {
      setName("");
      setAge("");
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/me/patients/${id}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patients"] }),
  });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="label">{user?.phone_display}</p>
        <h1 className="text-3xl font-extrabold">Family members</h1>
        <p className="text-muted">Book for anyone here from the website, the app or WhatsApp. Confirmations go to your WhatsApp.</p>
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : list.data?.length ? (
        <div className="grid gap-2">
          {list.data.map((p) => (
            <div key={p.id} className="card flex items-center gap-3 p-3">
              <Avatar name={p.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.name}</p>
                <p className="text-[13px] text-muted">
                  {p.relation === "self" ? "You" : p.relation[0].toUpperCase() + p.relation.slice(1)}
                  {p.age != null ? ` · ${p.age} yrs` : ""}
                </p>
              </div>
              {p.relation !== "self" && (
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No one added yet">
          <p className="text-sm text-muted">Your first booking adds you automatically.</p>
        </Empty>
      )}
      <ErrorNote>{remove.error?.message}</ErrorNote>
      <form
        className="card grid gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <h2 className="text-lg font-bold">Add a family member</h2>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Full name" htmlFor="fn">
            <input id="fn" className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </Field>
          <Field label="Age" htmlFor="fa">
            <input id="fa" className="input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} required />
          </Field>
          <Field label="Relation" htmlFor="fr">
            <select id="fr" className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>
              {["family", "spouse", "son", "daughter", "father", "mother", "other"].map((r) => (
                <option key={r} value={r}>
                  {r[0].toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorNote>{add.error?.message}</ErrorNote>
        <Button variant="primary" type="submit" loading={add.isPending} className="justify-self-start">
          Add member
        </Button>
      </form>
    </div>
  );
}

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8">
        <RequireAuth>
          <div className="grid gap-8">
            <YourDetails />
            <Family />
          </div>
        </RequireAuth>
      </main>
      <SiteFooter />
    </>
  );
}
