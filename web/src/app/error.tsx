"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto grid w-full max-w-lg flex-1 content-center justify-items-center gap-4 px-4 py-20 text-center">
      <p className="font-display text-5xl font-extrabold text-brand">Sorry</p>
      <h1 className="text-2xl font-extrabold">Something went wrong on this page</h1>
      <p className="text-muted">Your bookings are safe. Try again, and if it keeps happening, contact the clinic.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={reset} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold hover:border-muted">
          Home page
        </Link>
      </div>
      {error.digest && <p className="text-xs text-muted">Reference: {error.digest}</p>}
    </main>
  );
}
