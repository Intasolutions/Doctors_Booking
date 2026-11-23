"use client";

import { Download, Share, WifiOff, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Installable app support: registers the service worker, keeps the browser's
 * install offer for an "Install app" button, and tells iPhone users how to add
 * CareSlot to their home screen (Safari has no install button).
 */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let offer: InstallEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Listen from the moment this file loads: browsers fire the offer early, often before React is ready.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the browser's banner
    offer = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    offer = null;
    installedNow = true;
    notify();
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", fn);
  return () => {
    listeners.delete(fn);
    mq.removeEventListener("change", fn);
  };
}

type InstallState = { canInstall: boolean; ios: boolean; standalone: boolean };
let cached: InstallState = { canInstall: false, ios: false, standalone: false };
const SERVER: InstallState = { canInstall: false, ios: false, standalone: false };

function snapshot(): InstallState {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = installedNow || window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  // iPhone/iPad Safari (iPadOS reports itself as a Mac with touch).
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const next = { canInstall: !!offer && !standalone, ios: ios && !standalone, standalone };
  if (next.canInstall !== cached.canInstall || next.ios !== cached.ios || next.standalone !== cached.standalone) cached = next;
  return cached;
}

export function useInstall() {
  const s = useSyncExternalStore(subscribe, snapshot, () => SERVER);
  return {
    ...s,
    /** True when there is something to offer: a real install button, or iPhone steps. */
    available: s.canInstall || s.ios,
    install: async () => {
      if (!offer) return false;
      await offer.prompt();
      const { outcome } = await offer.userChoice;
      offer = null;
      notify();
      return outcome === "accepted";
    },
  };
}

/** Registers the service worker in production builds (it would fight with live reload in development). */
export function PwaSetup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

// The device's own online flag, plus whether the API last answered (set by lib/api).
let apiReachable = true;
if (typeof window !== "undefined") {
  window.addEventListener("careslot:net", (e) => {
    apiReachable = (e as CustomEvent<boolean>).detail;
  });
  // A connection coming back means it's worth trying the server again.
  window.addEventListener("online", () => (apiReachable = true));
}

type Net = "online" | "offline" | "unreachable";
function useNet(): Net {
  return useSyncExternalStore(
    (fn) => {
      for (const ev of ["online", "offline", "careslot:net"]) window.addEventListener(ev, fn);
      return () => {
        for (const ev of ["online", "offline", "careslot:net"]) window.removeEventListener(ev, fn);
      };
    },
    () => (!navigator.onLine ? "offline" : apiReachable ? "online" : "unreachable"),
    () => "online",
  );
}

/** A slim bar at the top while the device has no connection or the server can't be reached. */
export function OfflineBanner() {
  const net = useNet();
  if (net === "online") return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-ink px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-sm font-medium text-white">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {net === "offline"
        ? "You're offline. Free times and bookings need a connection, and this page will catch up when you're back."
        : "Can't reach CareSlot right now. Check your internet; we'll keep trying."}
    </div>
  );
}

/** "Install app" as a menu item or button. Renders nothing when installing isn't possible. */
export function InstallButton({ className = "", onDone }: { className?: string; onDone?: () => void }) {
  const inst = useInstall();
  const [steps, setSteps] = useState(false);
  if (!inst.available) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={async () => {
          if (inst.canInstall) {
            await inst.install();
            onDone?.();
          } else setSteps(true);
        }}
      >
        <Download className="size-4 shrink-0" aria-hidden /> Install app
      </button>
      {steps && <IosSteps onClose={() => (setSteps(false), onDone?.())} />}
    </>
  );
}

function IosSteps({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Install CareSlot" className="grid w-full gap-4 rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-sm sm:rounded-2xl">
        <h2 className="text-lg font-bold">Add CareSlot to your home screen</h2>
        <ol className="grid gap-3 text-[15px]">
          <li className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-dark">1</span>
            <span>
              Tap <Share className="inline size-4 align-[-2px] text-brand" aria-label="Share" /> <b>Share</b> in Safari&apos;s toolbar.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-dark">2</span>
            <span>
              Choose <b>Add to Home Screen</b>, then <b>Add</b>.
            </span>
          </li>
        </ol>
        <button type="button" onClick={onClose} autoFocus className="min-h-12 rounded-xl bg-brand px-4 font-semibold text-white">
          Got it
        </button>
      </div>
    </div>
  );
}

const HIDE_KEY = "careslot.installCard.hidden";

/** A one-time, dismissible suggestion to install the app, for the home page. */
export function InstallCard() {
  const inst = useInstall();
  // Safe to read here: the card only ever shows after the page is running in the browser.
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (hidden || !inst.available) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {}
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="size-10 shrink-0 rounded-xl" />
      <p className="min-w-0 flex-1 text-sm">
        <b>Get the CareSlot app.</b> <span className="text-muted">Book in two taps from your home screen.</span>
      </p>
      <InstallButton onDone={hide} className="btn btn-primary shrink-0" />
      <button type="button" onClick={hide} className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink" aria-label="Not now">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
