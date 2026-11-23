import type { MetadataRoute } from "next";

/** Makes CareSlot installable as an app on phones, tablets and computers. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CareSlot · Book doctors near you",
    short_name: "CareSlot",
    description: "Book a visit with private-practice doctors at their home clinics. Doctors manage their day in the portal.",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f3f7fb",
    theme_color: "#ffffff",
    categories: ["medical", "health"],
    lang: "en-IN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon to jump straight to these.
    shortcuts: [
      { name: "Find a doctor", url: "/?source=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My appointments", url: "/appointments", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Doctor portal", url: "/portal", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    screenshots: [
      { src: "/screenshots/phone.png", sizes: "390x844", type: "image/png", form_factor: "narrow", label: "Doctors near you" },
      { src: "/screenshots/wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Doctor's queue for the day" },
    ],
  };
}
