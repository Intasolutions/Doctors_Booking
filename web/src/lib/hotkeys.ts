"use client";

import { useEffect, useRef } from "react";

/**
 * Single-key shortcuts for keyboard users ("/" to search, "n" for new).
 * Ignored while typing in a field, with a modifier key held, or while a dialog is open.
 */
export function useHotkeys(map: Record<string, () => void>) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      const fn = ref.current[e.key.toLowerCase()] ?? ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
