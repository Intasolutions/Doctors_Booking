const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

export function parseISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Every date shown to people is dd/mm/yyyy. Takes an ISO date (2026-11-23). */
export function fmtDate(s: string) {
  const d = parseISODate(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function weekday(s: string) {
  return WD[parseISODate(s).getDay()];
}

/** "Today", "Tomorrow" or the weekday, for day buttons. */
export function dayName(s: string) {
  const today = toISODate(new Date());
  const tomorrow = toISODate(new Date(Date.now() + 86_400_000));
  return s === today ? "Today" : s === tomorrow ? "Tomorrow" : weekday(s);
}

/** "Today (23/11/2026)" or "Mon 23/11/2026". */
export function dayLabel(s: string) {
  const n = dayName(s);
  return n === "Today" || n === "Tomorrow" ? `${n} (${fmtDate(s)})` : `${n} ${fmtDate(s)}`;
}

/** 12-hour clock only: "17:30" -> "5:30 PM". */
export function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}

/** A timestamp from the server as "23/11/2026, 5:30 PM". */
export function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${fmtTime(`${d.getHours()}:${d.getMinutes()}`)}`;
}

/** A timestamp as dd/mm/yyyy only. */
export function fmtStamp(iso: string | null | undefined) {
  if (!iso) return "";
  return fmtDate(toISODate(new Date(iso)));
}

export function rupees(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function initials(name: string) {
  return name
    .replace(/^Dr\.\s*/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

/** Stable hue per doctor so avatars keep their colour. */
export function hueFor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function waNumberDisplay(digits: string) {
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Collapses days with the same hours: Mon–Sat 7:00 AM – 9:00 AM, 5:00 PM – 8:00 PM. */
export function groupHours(hours: { day: string; sessions: string[] }[]) {
  const out: { days: string; sessions: string[] }[] = [];
  let run: { first: string; last: string; key: string; sessions: string[] } | null = null;
  const flush = () => run && out.push({ days: run.first === run.last ? run.first : `${run.first} – ${run.last}`, sessions: run.sessions });
  for (const h of [...hours].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))) {
    const key = h.sessions.join("|");
    const next = run && DAY_ORDER.indexOf(h.day) === DAY_ORDER.indexOf(run.last) + 1;
    if (run && next && run.key === key) run.last = h.day;
    else {
      flush();
      run = { first: h.day, last: h.day, key, sessions: h.sessions };
    }
  }
  flush();
  return out;
}
