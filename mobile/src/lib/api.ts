import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * API address. Set EXPO_PUBLIC_API_BASE_URL in mobile/.env, e.g.
 *  - Android emulator: http://10.0.2.2:8000/api
 *  - A real phone on the same Wi-Fi: http://192.168.1.20:8000/api (your PC's IP)
 *  - Production: https://careslot-api.onrender.com/api
 */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  "http://127.0.0.1:8000/api"
).replace(/\/$/, "");

const ACCESS = "careslot.access";
const REFRESH = "careslot.refresh";

// SecureStore keeps tokens in the Android Keystore / iOS Keychain. It has no
// web support, so the web preview falls back to localStorage.
const store = {
  async get(k: string) {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(k) ?? null;
    return SecureStore.getItemAsync(k);
  },
  async set(k: string, v: string) {
    if (Platform.OS === "web") return globalThis.localStorage?.setItem(k, v);
    await SecureStore.setItemAsync(k, v);
  },
  async del(k: string) {
    if (Platform.OS === "web") return globalThis.localStorage?.removeItem(k);
    await SecureStore.deleteItemAsync(k);
  },
};

let accessCache: string | null | undefined;

export async function saveTokens(access: string, refresh?: string) {
  accessCache = access;
  await store.set(ACCESS, access);
  if (refresh) await store.set(REFRESH, refresh);
}

export async function clearTokens() {
  accessCache = null;
  await store.del(ACCESS);
  await store.del(REFRESH);
}

async function access() {
  if (accessCache === undefined) accessCache = await store.get(ACCESS);
  return accessCache;
}

export async function hasToken() {
  return !!(await access());
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function messageFrom(data: unknown) {
  if (!data || typeof data !== "object") return "Something went wrong. Please try again.";
  const d = data as Record<string, unknown>;
  if (typeof d.detail === "string") return d.detail;
  for (const v of Object.values(d)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (typeof first === "string") return first;
  }
  return "Please check the details and try again.";
}

let refreshing: Promise<boolean> | null = null;

async function refreshAccess() {
  const refresh = await store.get(REFRESH);
  if (!refresh) return false;
  try {
    const r = await fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    await saveTokens(data.access, data.refresh);
    return true;
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();
export function onSignedOut(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

type Options = { method?: string; body?: unknown; auth?: boolean; params?: Record<string, string | undefined> };

export async function api<T = unknown>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const qs = Object.entries(opts.params || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
    .join("&");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = opts.auth === false ? null : await access();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}${qs ? `?${qs}` : ""}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach CareSlot. Check your internet connection and try again.");
  }
  if (res.status === 401 && token && !retried) {
    refreshing ??= refreshAccess().finally(() => (refreshing = null));
    if (await refreshing) return api<T>(path, opts, true);
    await clearTokens();
    listeners.forEach((fn) => fn());
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageFrom(data));
  return data as T;
}
