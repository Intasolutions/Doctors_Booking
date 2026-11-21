import Link from "next/link";

import { SiteFooter, SiteHeader } from "@/components/site-header";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-lg flex-1 content-center justify-items-center gap-4 px-4 py-20 text-center">
        <p className="font-display text-6xl font-extrabold text-brand">404</p>
        <h1 className="text-2xl font-extrabold">We can&apos;t find that page</h1>
        <p className="text-muted">The link may be old or mistyped. You can find doctors near you from the home page.</p>
        <Link href="/" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
          Go to the home page
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
