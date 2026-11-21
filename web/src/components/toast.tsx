"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type Toast = { id: number; text: string; kind: "success" | "error" };
type ToastApi = { success: (text: string) => void; error: (text: string) => void };

const Ctx = createContext<ToastApi | null>(null);

/** Short confirmations ("Doctor saved") in the corner. They clear themselves after a few seconds. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (text: string, kind: Toast["kind"]) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-3), { id, text, kind }]);
      setTimeout(() => remove(id), kind === "error" ? 7000 : 4000);
    },
    [remove],
  );
  const api = useMemo<ToastApi>(() => ({ success: (t) => push(t, "success"), error: (t) => push(t, "error") }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
              t.kind === "success" ? "bg-ink text-white ring-ink" : "bg-red-50 text-red-800 ring-red-200"
            }`}
          >
            {t.kind === "success" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span className="flex-1">{t.text}</span>
            <button onClick={() => remove(t.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}
