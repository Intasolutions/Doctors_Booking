"use client";

import { useCallback, useEffect, useState } from "react";

export type Coords = { lat: number; lng: number };
export type GeoState =
  | { status: "locating" }
  | { status: "ready"; coords: Coords }
  | { status: "denied" | "unavailable"; message: string };

const CACHE = "careslot.lastLocation";

function remember(c: Coords) {
  try {
    sessionStorage.setItem(CACHE, JSON.stringify({ ...c, at: Date.now() }));
  } catch {}
}

function recent(): Coords | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE) || "null");
    return c && Date.now() - c.at < 10 * 60_000 ? { lat: c.lat, lng: c.lng } : null;
  } catch {
    return null;
  }
}

/** Asks the browser for the user's location as soon as the page opens. */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "locating" });

  const locate = useCallback((onDone: (s: GeoState) => void) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      onDone({ status: "unavailable", message: "This browser can't share your location." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        remember(coords);
        onDone({ status: "ready", coords });
      },
      (err) =>
        onDone(
          err.code === err.PERMISSION_DENIED
            ? { status: "denied", message: "Location is turned off for this site." }
            : { status: "unavailable", message: "We couldn't find your location. Check that location is on." },
        ),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  useEffect(() => {
    let alive = true;
    const cached = recent();
    // Resolve on the next tick so the first render matches the server's.
    Promise.resolve().then(() => {
      if (!alive) return;
      if (cached) setState({ status: "ready", coords: cached });
      else locate((s) => alive && setState(s));
    });
    return () => {
      alive = false;
    };
  }, [locate]);

  const retry = useCallback(() => {
    setState({ status: "locating" });
    locate(setState);
  }, [locate]);

  return { ...state, retry };
}

export function kmLabel(km: number | null | undefined) {
  if (km == null) return "";
  return km < 1 ? `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m away` : `${km.toFixed(1)} km away`;
}
