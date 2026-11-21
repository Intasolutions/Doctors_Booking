import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

export default function config(phase: string): NextConfig {
  // NEXT_PUBLIC_API_BASE_URL is baked into the build. Without it the site
  // would call http://127.0.0.1:8000/api from real browsers and fail.
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_API_BASE_URL && !process.env.ALLOW_LOCAL_API) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be set for a production build (e.g. https://api.careslot.in/api).");
  }
  return {
    // Hide the Next.js badge in the corner while testing.
    devIndicators: false,
    // Addresses allowed to load the dev server's code. Without an entry, the
    // page shows but nothing on it works (buttons, sign-in). Covers 127.0.0.1
    // on this PC and Wi-Fi addresses such as http://192.168.1.160:3000.
    allowedDevOrigins: ["127.0.0.1", "0.0.0.0", "192.168.*.*", "10.*.*.*", "172.*.*.*"],
  };
}
