import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

export default function config(phase: string): NextConfig {
  // NEXT_PUBLIC_API_BASE_URL is baked into the build. Without it the site
  // would call http://127.0.0.1:8000/api from real browsers and fail.
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_API_BASE_URL && !process.env.ALLOW_LOCAL_API) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be set for a production build (e.g. https://api.careslot.in/api).");
  }
  return {};
}
