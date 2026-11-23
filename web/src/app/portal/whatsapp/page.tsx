"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, List, MapPin, Reply, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { usePortal } from "@/components/portal";
import { ErrorNote, Field, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

type Payload = {
  type?: string;
  text?: { body: string };
  interactive?: {
    type: "button" | "list" | "cta_url" | "location_request_message";
    header?: { text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      buttons?: { reply: { id: string; title: string } }[];
      button?: string;
      sections?: { title: string; rows: { id: string; title: string; description?: string }[] }[];
      parameters?: { display_text: string; url: string };
    };
  };
  template?: { name: string; components: { type: string; sub_type?: string; parameters: { type: string; text?: string; payload?: string }[] }[] };
  reply_id?: string;
};
type Msg = { id: number; direction: "in" | "out"; kind: string; summary: string; payload: Payload; status: string; created_at: string };

const PAYLOAD_LABEL: Record<string, string> = {
  remok: "Yes, I will come",
  resch: "Reschedule",
  cancel: "Cancel",
  rebook: "Pick a new time",
};

function fmt(s: string) {
  const esc = s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return esc.replace(/\*(.+?)\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
}

function Bubble({ m, onTap, onList, onLocation }: { m: Msg; onTap: (id: string, title: string) => void; onList: (m: Msg) => void; onLocation: () => void }) {
  const time = fmtDateTime(m.created_at);
  if (m.direction === "in")
    return (
      <div className="max-w-[85%] self-end rounded-xl rounded-tr-sm bg-accent-soft px-3 py-1.5 text-sm shadow-sm">
        <span dangerouslySetInnerHTML={{ __html: fmt(m.summary || "") }} />
        <span className="ml-2 text-[10px] text-muted">{time}</span>
      </div>
    );
  const p = m.payload;
  const i = p.interactive;
  let body = m.summary;
  let buttons: { id: string; title: string }[] = [];
  if (p.type === "text") body = p.text?.body || "";
  if (i) body = (i.header ? `*${i.header.text}*\n` : "") + i.body.text;
  if (i?.type === "button") buttons = i.action.buttons!.map((b) => b.reply);
  if (p.template) {
    buttons = p.template.components
      .filter((c) => c.sub_type === "quick_reply")
      .map((c) => {
        const id = c.parameters[0].payload || "";
        return { id, title: PAYLOAD_LABEL[id.split(":")[0]] || id };
      });
  }
  return (
    <div className="max-w-[85%] self-start rounded-xl rounded-tl-sm bg-white text-sm shadow-sm">
      <div className="px-3 pb-1 pt-2">
        {p.template && <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">Template · {p.template.name}</p>}
        <span dangerouslySetInnerHTML={{ __html: fmt(body) }} />
        {i?.footer && <p className="mt-1 text-[11px] text-muted">{i.footer.text}</p>}
        <p className="text-right text-[10px] text-muted">
          {time}
          {m.status === "failed" ? " · failed" : ""}
        </p>
      </div>
      {buttons.map((b) => (
        <button key={b.id} onClick={() => onTap(b.id, b.title)} className="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-line px-3 font-semibold touch:min-h-11 text-brand hover:bg-canvas">
          <Reply className="size-3.5" aria-hidden /> {b.title}
        </button>
      ))}
      {i?.type === "list" && (
        <button onClick={() => onList(m)} className="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-line px-3 font-semibold touch:min-h-11 text-brand hover:bg-canvas">
          <List className="size-3.5" aria-hidden /> {i.action.button}
        </button>
      )}
      {i?.type === "location_request_message" && (
        <button onClick={onLocation} className="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-line px-3 font-semibold touch:min-h-11 text-brand hover:bg-canvas">
          <MapPin className="size-3.5" aria-hidden /> Send location
        </button>
      )}
      {i?.type === "cta_url" && (
        <a href={i.action.parameters!.url} target="_blank" rel="noopener" className="flex min-h-10 items-center justify-center gap-1.5 border-t border-line px-3 font-semibold touch:min-h-11 text-brand hover:bg-canvas">
          <ExternalLink className="size-3.5" aria-hidden /> {i.action.parameters!.display_text}
        </a>
      )}
    </div>
  );
}

export default function WhatsAppTesterPage() {
  const { isAdmin } = usePortal();
  const qc = useQueryClient();
  const [phone, setPhone] = useState("919847012345");
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState<Msg | null>(null);
  const chat = useRef<HTMLDivElement>(null);
  const log = useQuery({
    queryKey: ["sim", phone],
    queryFn: () => api<{ console_mode: boolean; messages: Msg[] }>("/whatsapp/simulate/", { params: { phone } }),
    enabled: isAdmin && phone.replace(/\D/g, "").length >= 11,
    refetchInterval: 5000,
  });
  const send = useMutation({
    mutationFn: (b: { text?: string; reply_id?: string; reply_title?: string; latitude?: number; longitude?: number }) => api("/whatsapp/simulate/", { method: "POST", body: { phone, profile_name: "Test patient", ...b } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sim", phone] }),
  });
  const count = log.data?.messages.length || 0;
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight });
  }, [count]);

  if (!isAdmin) return <p className="text-muted">Only admins can use the WhatsApp tester.</p>;
  const tap = (reply_id: string, reply_title: string) => send.mutate({ reply_id, reply_title });
  // Sample spot in Kakkanad, Kochi, standing in for the patient's phone location.
  const shareLocation = () => send.mutate({ latitude: 10.0159, longitude: 76.3419 });

  return (
    <>
      <div className="grid gap-1 border-b border-line pb-5">
        <p className="label">Doctor tools</p>
        <h1 className="text-2xl font-extrabold sm:text-[28px]">WhatsApp tester</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          This runs the real bot, bookings and all, without sending anything to WhatsApp. Use a doctor&apos;s registered phone to try doctor commands
          (sample doctors: 919800000001 to 919800000004). It works only while the server has no WhatsApp token.
        </p>
      </div>
      {log.data && !log.data.console_mode && <ErrorNote>WhatsApp is live on this server, so the tester is off. Test from a real phone instead.</ErrorNote>}
      <div className="grid items-start gap-5 lg:grid-cols-[18rem_minmax(0,26rem)]">
        <div className="card grid gap-3 p-4">
          <Field label="Chatting as phone" htmlFor="sp" hint="Digits with country code">
            <input id="sp" className="input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <p className="label">Quick messages</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={shareLocation} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-brand bg-brand-soft px-3 text-xs font-semibold touch:min-h-10 text-brand-dark">
              <MapPin className="size-3" aria-hidden /> Share location (Kakkanad)
            </button>
            {["Hi", "DR-ANITHA", "My bookings", "today", "tomorrow", "block 7pm-8pm", "help"].map((t) => (
              <button key={t} onClick={() => send.mutate({ text: t })} className="min-h-8 rounded-full border border-line bg-surface px-3 font-mono text-xs touch:min-h-10 font-semibold hover:border-muted">
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="relative flex h-[38rem] flex-col overflow-hidden rounded-3xl border-8 border-ink bg-[#e8eff7]">
          <div className="bg-accent-dark px-4 py-3 text-white">
            <p className="font-semibold">CareSlot Bookings</p>
            <p className="text-xs opacity-80">{send.isPending ? "typing…" : `+${phone}`}</p>
          </div>
          <div ref={chat} className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
            {log.isLoading && <Spinner />}
            {count === 0 && !log.isLoading && <p className="self-center rounded-lg bg-white px-3 py-1.5 text-xs text-muted">No messages yet. Send “Hi” or a doctor code.</p>}
            {log.data?.messages.map((m) => (
              <Bubble key={m.id} m={m} onTap={tap} onList={setSheet} onLocation={shareLocation} />
            ))}
          </div>
          <form
            className="flex gap-2 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send.mutate({ text });
              setText("");
            }}
          >
            <input className="input rounded-full border-0" placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" />
            <button className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white" aria-label="Send">
              <Send className="size-4" aria-hidden />
            </button>
          </form>
          {sheet?.payload.interactive && (
            <div className="absolute inset-0 flex items-end bg-black/40" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
              <div className="max-h-[80%] w-full overflow-y-auto rounded-t-2xl bg-white pb-3">
                <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-white px-3 py-2.5 font-semibold">
                  <button onClick={() => setSheet(null)} aria-label="Close" className="rounded-lg p-1 hover:bg-canvas">
                    <X className="size-4" aria-hidden />
                  </button>
                  {sheet.payload.interactive.action.button}
                </div>
                {sheet.payload.interactive.action.sections?.map((s) => (
                  <div key={s.title}>
                    <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-brand">{s.title}</p>
                    {s.rows.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => (setSheet(null), tap(r.id, r.title))}
                        className="block w-full border-b border-line px-4 py-2.5 text-left hover:bg-canvas"
                      >
                        <span className="block text-sm font-semibold">{r.title}</span>
                        {r.description && <span className="text-xs text-muted">{r.description}</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <ErrorNote>{send.error?.message}</ErrorNote>
    </>
  );
}
