import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

export default function config(phase: string): NextConfig {
  // NEXT_PUBLIC_API_BASE_URL is baked into the build. Without it the site calls
  // the API on port 8000 of whatever address it was opened on: right for testing
  // on this PC, wrong on a live server.
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_API_BASE_URL) {
    // Deploy builds (Vercel, CI) must name the live API, so stop them here.
    if (process.env.VERCEL || process.env.CI) {
      throw new Error("NEXT_PUBLIC_API_BASE_URL must be set for a deploy build (e.g. https://api.careslot.in/api).");
    }
    // The build loads this file twice; the second load inherits this flag.
    if (!process.env.CARESLOT_API_WARNED) {
      process.env.CARESLOT_API_WARNED = "1";
      console.warn("⚠ NEXT_PUBLIC_API_BASE_URL is not set: this build is for local testing only (API at <this address>:8000).");
    }
  }
  return {
    // The project root has its own package-lock.json (for `npm run dev`), which
    // would otherwise make Next.js treat the whole project as the workspace.
    turbopack: { root: __dirname },
    // Hide the Next.js badge in the corner while testing.
    devIndicators: false,
    // Addresses allowed to load the dev server's code. Without an entry, the
    // page shows but nothing on it works (buttons, sign-in). Covers 127.0.0.1
    // on this PC and Wi-Fi addresses such as http://192.168.1.160:3000.
    allowedDevOrigins: ["127.0.0.1", "0.0.0.0", "192.168.*.*", "10.*.*.*", "172.*.*.*"],
    async headers() {
      return [
        {
          source: "/(.*)",
          headers: [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ],
        },
        {
          // The installable app's service worker: never cached, so an update reaches phones at once.
          source: "/sw.js",
          headers: [
            { key: "Content-Type", value: "application/javascript; charset=utf-8" },
            { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
            { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
          ],
        },
      ];
    },
  };
}
