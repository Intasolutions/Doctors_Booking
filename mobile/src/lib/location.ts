import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

export type Coords = { lat: number; lng: number };
export type LocState =
  | { status: "locating" }
  | { status: "ready"; coords: Coords; place: string }
  | { status: "denied"; canAskAgain: boolean }
  | { status: "unavailable" };

async function placeName(c: Coords) {
  // The phone's own geocoder turns coordinates into a locality name. Not on web.
  if (Platform.OS === "web") return "";
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: c.lat, longitude: c.lng });
    return a?.district || a?.subregion || a?.city || a?.name || "";
  } catch {
    return "";
  }
}

async function locate(): Promise<LocState> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return { status: "denied", canAskAgain: perm.canAskAgain };
  try {
    // A recent fix is good enough to rank clinics and is instant.
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 1000 });
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    return { status: "ready", coords, place: await placeName(coords) };
  } catch {
    return { status: "unavailable" };
  }
}

/** Asks for location permission when the screen opens and keeps the result. */
export function useLocation() {
  const [state, setState] = useState<LocState>({ status: "locating" });

  useEffect(() => {
    let alive = true;
    locate().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  const retry = useCallback(() => {
    setState({ status: "locating" });
    locate().then(setState);
  }, []);

  return { ...state, retry };
}

export function kmLabel(km: number | null | undefined) {
  if (km == null) return "";
  return km < 1 ? `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m` : `${km.toFixed(1)} km`;
}
