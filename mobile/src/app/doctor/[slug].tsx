import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text, View } from "react-native";

import { SlotPicker } from "@/components/slot-picker";
import { Avatar, Button, C, Card, Chip, ErrorText, Input, Loading, s } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtTime, rupees } from "@/lib/format";
import type { Appointment, Doctor, Patient } from "@/lib/types";

export default function DoctorScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const doctor = useQuery({ queryKey: ["doctor", slug], queryFn: () => api<Doctor>(`/doctors/${slug}/`, { auth: false }) });
  const patients = useQuery({ queryKey: ["patients"], queryFn: () => api<Patient[]>("/me/patients/"), enabled: !!user });
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [picked, setWho] = useState<number | "new" | null>(null);
  const who = picked ?? patients.data?.[0]?.id ?? "new";
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [reason, setReason] = useState("");
  const onDate = useCallback((d: string) => setDate(d), []);
  const onTime = useCallback((t: string | null) => setTime(t), []);

  const book = useMutation({
    mutationFn: () =>
      api<Appointment>("/me/appointments/", {
        method: "POST",
        body: {
          doctor: slug,
          date,
          time,
          reason,
          source: "app",
          ...(who === "new" ? { patient: { name, age: Number(age), relation: patients.data?.length ? "family" : "self" } } : { patient_id: who }),
        },
      }),
    onSuccess: (a) => {
      qc.invalidateQueries();
      router.replace({ pathname: "/visits", params: { booked: a.code } });
    },
    onError: () => qc.invalidateQueries({ queryKey: ["slots", slug] }),
  });

  if (doctor.isLoading) return <Loading />;
  if (!doctor.data) return <ErrorText>We couldn&apos;t load this doctor. Go back and try again.</ErrorText>;
  const d = doctor.data;
  const ready = !!time && (who !== "new" || (name.trim().length >= 2 && age !== ""));

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: d.name }} />
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <View style={s.row}>
          <Avatar name={d.name} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>{d.name}</Text>
            <Text style={s.muted}>{d.qualifications}</Text>
            <Text style={s.muted}>
              {d.specialty} · {d.experience_years} yrs · {rupees(d.fee)}
            </Text>
          </View>
        </View>
        {!!d.about && <Text style={s.body}>{d.about}</Text>}
        <Card>
          <Text style={s.body}>{d.address}</Text>
          <Text style={s.muted}>Speaks {d.languages}</Text>
          <Button small title="Get directions" onPress={() => Linking.openURL(d.directions_url)} style={{ alignSelf: "flex-start" }} />
        </Card>

        <SlotPicker slug={d.slug} date={date} time={time} onDate={onDate} onTime={onTime} />

        {time && date && user && (
          <Card style={{ gap: 14 }}>
            <Text style={s.label}>Who is the visit for?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {patients.data?.map((p) => (
                <Chip key={p.id} label={p.name.split(" ")[0] + (p.relation === "self" ? " (me)" : "")} on={who === p.id} onPress={() => setWho(p.id)} />
              ))}
              <Chip label={patients.data?.length ? "Someone else" : "Me"} on={who === "new"} onPress={() => setWho("new")} />
            </View>
            {who === "new" && (
              <>
                <Input label="Patient name" value={name} onChangeText={setName} autoComplete="name" />
                <Input label="Age" value={age} onChangeText={(t) => setAge(t.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
              </>
            )}
            <Input label="Reason for visit (optional)" value={reason} onChangeText={setReason} placeholder="For example: fever since two days" maxLength={200} />
            <View style={{ backgroundColor: C.canvas, borderRadius: 12, padding: 12, gap: 4 }}>
              <Text style={s.body}>
                <Text style={{ fontWeight: "800" }}>
                  {fmtDate(date)}, {fmtTime(time)}
                </Text>{" "}
                · {rupees(d.fee)} at the clinic
              </Text>
              <Text style={s.muted}>Confirmation to {user.phone_display} on WhatsApp</Text>
            </View>
            <ErrorText>{book.error?.message}</ErrorText>
            <Button variant="primary" title="Confirm booking" loading={book.isPending} disabled={!ready} onPress={() => book.mutate()} />
            <Text style={[s.muted, { fontSize: 12 }]}>By booking you agree to share these details with {d.name} for this visit.</Text>
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
