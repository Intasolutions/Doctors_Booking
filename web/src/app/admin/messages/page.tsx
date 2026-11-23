"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Empty, ErrorNote, Spinner } from "@/components/ui";
import type { LogMessage, Page, Thread } from "@/lib/admin-types";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

function time(iso: string) {
  return fmtDateTime(iso);
}

function Conversation({ phone }: { phone: string }) {
  const box = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ["admin-thread", phone],
    queryFn: () => api<Page<LogMessage>>("/admin/messages/", { params: { phone } }),
    refetchInterval: 10_000,
  });
  const n = q.data?.results.length || 0;
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [n]);
  if (q.isLoading) return <Spinner />;
  return (
    <div ref={box} className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto rounded-xl bg-[#e8eff7] p-3">
      {q.data?.results.map((m) => (
        <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm ${m.direction === "in" ? "self-end bg-accent-soft" : "self-start bg-white"}`}>
          {m.kind === "template" && <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Template</p>}
          <p className="whitespace-pre-line">{m.summary || `(${m.kind})`}</p>
          <p className="mt-1 text-right text-[10px] text-muted">
            {time(m.created_at)}
            {m.direction === "out" && m.status ? ` · ${m.status}` : ""}
          </p>
          {m.status === "failed" && <p className="mt-1 text-xs font-semibold text-red-700">Not delivered: {m.error.slice(0, 160)}</p>}
        </div>
      ))}
      {n === 0 && <p className="text-sm text-muted">No messages.</p>}
    </div>
  );
}

export default function AdminMessagesPage() {
  const [q, setQ] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["admin-threads", q],
    queryFn: () => api<Page<Thread> & { failed_total: number }>("/admin/messages/", { params: { q } }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  const selected = list.data?.results.find((t) => t.phone === phone);

  return (
    <>
      <PageHeader
        eyebrow={list.data ? `${list.data.count} conversations` : "Admin"}
        title="WhatsApp messages"
        description="Everything the bot sent and received, including confirmations and reminders."
        actions={
          <Link href="/portal/whatsapp" className="btn btn-secondary hover:border-brand">
            Open the WhatsApp tester
          </Link>
        }
      />
      {!!list.data?.failed_total && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          {list.data.failed_total} message(s) failed to send. Look for the red counts below.
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className={`grid gap-3 ${phone ? "hidden lg:grid" : ""}`}>
          <label className="relative">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input pl-9" placeholder="Search by phone or name" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {list.isLoading && <Spinner />}
          <ErrorNote>{list.error?.message}</ErrorNote>
          {list.data?.results.length === 0 && <Empty title="No messages yet" />}
          <ul className="card divide-y divide-line overflow-hidden">
            {list.data?.results.map((t) => (
              <li key={t.phone}>
                <button onClick={() => setPhone(t.phone)} className={`grid w-full gap-0.5 px-4 py-3 text-left hover:bg-canvas ${t.phone === phone ? "bg-brand-soft" : ""}`}>
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate">{t.name || t.phone_display}</b>
                    <span className="shrink-0 text-xs text-muted">{time(t.updated_at)}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {t.name ? `${t.phone_display} · ` : ""}
                    {t.is_doctor ? "Doctor · " : ""}
                    {t.messages} messages
                    {t.failed ? <b className="text-red-700"> · {t.failed} failed</b> : null}
                  </span>
                  <span className="truncate text-[13px]">{t.last}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className={`grid gap-3 ${phone ? "" : "hidden lg:grid"}`}>
          {phone ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{selected?.name || selected?.phone_display || phone}</p>
                  <p className="text-xs text-muted">{selected?.phone_display}</p>
                </div>
                <button onClick={() => setPhone(null)} className="btn btn-secondary btn-sm lg:hidden">
                  ← All conversations
                </button>
              </div>
              <Conversation phone={phone} />
            </>
          ) : (
            <Empty title="Choose a conversation" />
          )}
        </div>
      </div>
    </>
  );
}
