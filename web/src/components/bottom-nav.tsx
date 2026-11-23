"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
  /** Match the path exactly (for section home pages like /portal). */
  exact?: boolean;
  onClick?: () => void;
  active?: boolean;
  expanded?: boolean;
};

/**
 * The app's main sections at the bottom of the screen on phones and tablets,
 * where the thumb already is. `className` hides it from the size where a
 * sidebar or top links take over (e.g. "md:hidden").
 */
export function BottomNav({ items, className = "" }: { items: TabItem[]; className?: string }) {
  const path = usePathname();
  return (
    <>
      {/* Keeps the end of the page clear of the bar. */}
      <div className={`h-[calc(4rem+env(safe-area-inset-bottom))] shrink-0 ${className}`} aria-hidden />
      <nav
        aria-label="Sections"
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden ${className}`}
      >
        <ul className="mx-auto grid max-w-2xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((it) => {
            const active = it.active ?? (!!it.href && (it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`)));
            const cls = `flex h-16 w-full flex-col items-center justify-center gap-0.5 text-xs font-semibold transition ${
              active ? "text-brand-dark" : "text-muted hover:text-ink"
            }`;
            const inner = (
              <>
                <span className={`grid h-8 w-14 place-items-center rounded-full transition ${active ? "bg-brand-soft" : ""}`}>
                  <it.icon className="size-5" aria-hidden />
                </span>
                <span className="max-w-full truncate px-1">{it.label}</span>
              </>
            );
            return (
              <li key={it.label} className="min-w-0">
                {it.href ? (
                  <Link href={it.href} aria-current={active ? "page" : undefined} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" onClick={it.onClick} aria-expanded={it.expanded} className={cls}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
