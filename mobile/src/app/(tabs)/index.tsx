import Ionicons from "@expo/vector-icons/Ionicons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";

import { Avatar, Button, C, Chip, ErrorText, Loading, s } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { rupees } from "@/lib/format";
import { kmLabel, useLocation } from "@/lib/location";
import type { Appointment, Doctor, Meta } from "@/lib/types";

const RADII = [0, 3, 5, 10];

function NextVisit() {
  const q = useQuery({ queryKey: ["appointments"], queryFn: () => api<Appointment[]>("/me/appointments/") });
  const next = (q.data || []).filter((a) => a.upcoming).at(-1);
  if (!next) return null;
  return (
    <Link href="/visits" asChild>
      <Pressable style={{ backgroundColor: C.brand, borderRadius: 18, padding: 16, gap: 4 }}>
        <Text style={{ color: "#fff", opacity: 0.8, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }}>NEXT VISIT</Text>
        <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800" }}>{next.doctor.name}</Text>
        <Text style={{ color: "#fff", opacity: 0.9 }}>
          {next.when} · for {next.patient.name.split(" ")[0]}
        </Text>
      </Pressable>
    </Link>
  );
}

function LocationLine({ loc }: { loc: ReturnType<typeof useLocation> }) {
  if (loc.status === "locating")
    return (
      <View style={[s.row, { gap: 8 }]}>
        <ActivityIndicator color={C.brand} size="small" />
        <Text style={s.muted}>Finding doctors near you…</Text>
      </View>
    );
  if (loc.status === "ready")
    return (
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name="location" size={16} color={C.accentDark} />
        <Text style={{ color: C.accentDark, fontWeight: "700", flex: 1 }}>{loc.place ? `Near ${loc.place}` : "Near your location"}</Text>
        <Pressable onPress={loc.retry} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: C.brand, fontWeight: "700" }}>Refresh</Text>
        </Pressable>
      </View>
    );
  return (
    <View style={{ backgroundColor: "#FAEED6", borderRadius: 14, padding: 14, gap: 10 }}>
      <Text style={{ color: "#7A4D0C" }}>
        {loc.status === "denied"
          ? "Location is off for CareSlot. Turn it on to see the doctors nearest to you."
          : "We couldn't find your location. Check that location is on."}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {loc.status === "denied" && !loc.canAskAgain ? (
          <Button small title="Open settings" onPress={() => Linking.openSettings()} />
        ) : (
          <Button small title="Use my location" onPress={loc.retry} />
        )}
      </View>
    </View>
  );
}

export default function Home() {
  const { user } = useAuth();
  const loc = useLocation();
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("");
  const [radius, setRadius] = useState(0);
  const coords = loc.status === "ready" ? loc.coords : null;

  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/meta/", { auth: false }) });
  const doctors = useQuery({
    queryKey: ["doctors", spec, coords?.lat, coords?.lng, radius],
    queryFn: () =>
      api<Doctor[]>("/doctors/", {
        auth: false,
        params: {
          specialty: spec,
          lat: coords ? coords.lat.toFixed(5) : undefined,
          lng: coords ? coords.lng.toFixed(5) : undefined,
          radius_km: coords && radius ? String(radius) : undefined,
        },
      }),
    enabled: loc.status !== "locating", // first list is already sorted by distance
    placeholderData: keepPreviousData,
  });
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (doctors.data || []).filter((d) => !t || `${d.name} ${d.specialty} ${d.area}`.toLowerCase().includes(t));
  }, [doctors.data, q]);

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={[s.pad, { paddingBottom: 32 }]}
      data={list}
      keyExtractor={(d) => d.slug}
      refreshControl={<RefreshControl refreshing={doctors.isRefetching} onRefresh={() => void doctors.refetch()} tintColor={C.brand} />}
      ListHeaderComponent={
        <View style={{ gap: 14 }}>
          <View>
            <Text style={s.muted}>{user?.name ? `Hello, ${user.name.split(" ")[0]}` : "Hello"}</Text>
            <Text style={s.h1}>Doctors near you</Text>
          </View>
          <LocationLine loc={loc} />
          <NextVisit />
          <TextInput value={q} onChangeText={setQ} placeholder="Search doctor, specialty or area" placeholderTextColor="#8A9AAB" style={s.input} accessibilityLabel="Search doctors" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="All" on={!spec} onPress={() => setSpec("")} />
            {meta.data?.specialties.map((sp) => <Chip key={sp} label={sp.replace(" Surgeon", "")} on={spec === sp} onPress={() => setSpec(sp)} />)}
          </ScrollView>
          {coords && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {RADII.map((r) => (
                <Chip key={r} label={r ? `Within ${r} km` : "Any distance"} on={radius === r} onPress={() => setRadius(r)} />
              ))}
            </ScrollView>
          )}
          {(loc.status === "locating" || doctors.isLoading) && <Loading />}
          <ErrorText>{doctors.error?.message}</ErrorText>
        </View>
      }
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={
        doctors.data ? (
          <View style={{ alignItems: "center", padding: 24, gap: 10 }}>
            <Text style={s.muted}>{radius ? `No doctors within ${radius} km.` : "No doctors match that search."}</Text>
            {radius ? <Button small title="Show all distances" onPress={() => setRadius(0)} /> : null}
          </View>
        ) : undefined
      }
      renderItem={({ item: d }) => (
        <Link href={{ pathname: "/doctor/[slug]", params: { slug: d.slug } }} asChild>
          <Pressable style={({ pressed }) => [s.card, s.row, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${d.name}, ${d.specialty}${d.distance_km != null ? `, ${kmLabel(d.distance_km)} away` : ""}`}>
            <Avatar name={d.name} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: "800", fontSize: 15.5, color: C.ink }}>{d.name}</Text>
              <Text style={s.muted}>
                {d.specialty} · {d.area} · {rupees(d.fee)}
              </Text>
              <Text style={{ color: C.accentDark, fontWeight: "700", fontSize: 12.5 }}>Next free: {d.next_available?.label || "no slots this week"}</Text>
            </View>
            {d.distance_km != null && (
              <View style={{ backgroundColor: C.accentSoft, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}>
                <Text style={{ color: C.accentDark, fontWeight: "800", fontSize: 12 }}>{kmLabel(d.distance_km)}</Text>
              </View>
            )}
          </Pressable>
        </Link>
      )}
    />
  );
}
