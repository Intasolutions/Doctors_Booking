"use client";

/**
 * The API address. Production builds set NEXT_PUBLIC_API_BASE_URL. In local
 * development it follows the address the site was opened on, so the same dev
 * server works at localhost on this PC and at 192.168.x.x from a phone.
 */
export function apiBase() {
  const fixed = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  const host = typeof window === "undefined" ? "127.0.0.1" : window.location.hostname;
  return `http://${host}:8000/api`;
}

const ACCESS = "careslot.access";
const REFRESH = "careslot.refresh";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveTokens(access: string, refresh?: string) {
  try {
    window.localStorage.setItem(ACCESS, access);
    if (refresh) window.localStorage.setItem(REFRESH, refresh);
  } catch {
    /* storage blocked: the session lasts until reload */
  }
}

export function clearTokens() {
  try {
    window.localStorage.removeItem(ACCESS);
    window.localStorage.removeItem(REFRESH);
  } catch {}
}

export function hasToken() {
  return !!read(ACCESS);
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  /** The response body as sent, for errors that carry extra details. */
  data: unknown;
  constructor(status: number, message: string, fields: Record<string, string> = {}, data: unknown = null) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.data = data;
  }
}

function messageFrom(data: unknown): { message: string; fields: Record<string, string> } {
  if (!data || typeof data !== "object") return { message: "Something went wrong. Please try again.", fields: {} };
  const d = data as Record<string, unknown>;
  if (typeof d.detail === "string") return { message: d.detail, fields: {} };
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string") fields[k] = first;
    else if (first && typeof first === "object") {
      const inner = Object.values(first as Record<string, unknown>)[0];
      if (Array.isArray(inner) && typeof inner[0] === "string") fields[k] = inner[0];
    }
  }
  const message = fields.non_field_errors || Object.values(fields)[0] || "Please check the form and try again.";
  return { message, fields };
}

let refreshing: Promise<boolean> | null = null;

async function refreshAccess(): Promise<boolean> {
  const refresh = read(REFRESH);
  if (!refresh) return false;
  try {
    const r = await fetch(`${apiBase()}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    saveTokens(data.access, data.refresh);
    return true;
  } catch {
    return false;
  }
}

type Options = { method?: string; body?: unknown; auth?: boolean; params?: Record<string, string | undefined> };

export async function api<T = unknown>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const url = new URL(`${apiBase()}${path}`);
  for (const [k, v] of Object.entries(opts.params || {})) if (v) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = opts.auth === false ? null : read(ACCESS);
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection and try again.");
  }

  if (res.status === 401 && token && !retried) {
    refreshing ??= refreshAccess().finally(() => (refreshing = null));
    if (await refreshing) return api<T>(path, opts, true);
    clearTokens();
    window.dispatchEvent(new Event("careslot:logout"));
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const { message, fields } = messageFrom(data);
    throw new ApiError(res.status, message, fields, data);
  }
  return data as T;
}
