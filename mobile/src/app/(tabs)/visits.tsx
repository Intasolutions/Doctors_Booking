import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, Linking, RefreshControl, ScrollView, Text, View } from "react-native";

import { Button, C, Card, ErrorText, Loading, s, StatusPill } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Appointment } from "@/lib/types";

function Visit({ a }: { a: Appointment }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api(`/me/appointments/${a.code}/cancel/`, { method: "POST", body: { source: "app" } }),
    onSuccess: () => {
      qc.invalidateQueries();
      Alert.alert("Visit cancelled", `Your visit with ${a.doctor.name} is cancelled. The doctor has been told.`);
    },
  });
  // The phone's own confirmation dialog.
  const askCancel = () =>
    Alert.alert("Cancel this visit?", `${a.doctor.name}
${a.when}
For ${a.patient.name}

The time opens up for other patients.`, [
      { text: "Keep visit", style: "cancel" },
      { text: "Cancel visit", style: "destructive", onPress: () => cancel.mutate() },
    ]);
  return (
    <Card style={!a.upcoming ? { opacity: 0.75 } : undefined}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: "800", fontSize: 15.5, color: C.ink }}>{a.when}</Text>
          <Text style={s.muted}>
            {a.doctor.name} · {a.doctor.specialty}
          </Text>
          <Text style={s.muted}>
            For {a.patient.name} · {a.code}
          </Text>
        </View>
        <StatusPill status={a.status} label={a.status_label} />
      </View>
      {a.cancelled_by === "doctor" && <Text style={s.muted}>The doctor was unavailable. No fee is charged.</Text>}
      {a.upcoming && (
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button small title="Directions" onPress={() => Linking.openURL(a.doctor.directions_url)} />
          <Button small title="Reschedule" onPress={() => router.push({ pathname: "/reschedule/[code]", params: { code: a.code } })} />
          <Button small variant="danger" title="Cancel" loading={cancel.isPending} onPress={askCancel} />
        </View>
      )}
      <ErrorText>{cancel.error?.message}</ErrorText>
    </Card>
  );
}

export default function Visits() {
  const { user, ready } = useAuth();
  const { booked } = useLocalSearchParams<{ booked?: string }>();
  const q = useQuery({ queryKey: ["appointments"], queryFn: () => api<Appointment[]>("/me/appointments/"), enabled: !!user });

  if (!ready) return <Loading />;
  if (!user)
    return (
      <View style={[s.screen, s.pad, { justifyContent: "center" }]}>
        <Text style={s.h2}>See and manage your visits</Text>
        <Text style={s.muted}>Sign in with your phone number. Bookings made on WhatsApp and the website show up here too.</Text>
        <Button variant="primary" title="Sign in" onPress={() => router.push("/login")} />
      </View>
    );

  const all = q.data || [];
  const upcoming = all.filter((a) => a.upcoming).reverse();
  const past = all.filter((a) => !a.upcoming);
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 40 }]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={C.brand} />}>
      {booked ? (
        <View style={{ backgroundColor: "#E3F5EC", padding: 12, borderRadius: 12 }}>
          <Text style={{ color: "#0B6B47", fontWeight: "700" }}>Booked {booked}. The confirmation is on its way to your WhatsApp.</Text>
        </View>
      ) : null}
      {q.isLoading && <Loading />}
      <ErrorText>{q.error?.message}</ErrorText>
      <Text style={s.h2}>Upcoming</Text>
      {upcoming.length ? upcoming.map((a) => <Visit key={a.code} a={a} />) : <Text style={s.muted}>No upcoming visits.</Text>}
      {past.length > 0 && <Text style={[s.h2, { marginTop: 8 }]}>Past and cancelled</Text>}
      {past.map((a) => (
        <Visit key={a.code} a={a} />
      ))}
    </ScrollView>
  );
}
