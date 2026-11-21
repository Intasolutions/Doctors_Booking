import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, ErrorText, Input, Loading, s } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Patient } from "@/lib/types";

const RELATIONS = ["spouse", "son", "daughter", "father", "mother", "other"];

export default function Profile() {
  const { user, ready, signOut } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["patients"], queryFn: () => api<Patient[]>("/me/patients/"), enabled: !!user });
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [relation, setRelation] = useState("spouse");
  const add = useMutation({
    mutationFn: () => api("/me/patients/", { method: "POST", body: { name, age: Number(age), relation } }),
    onSuccess: () => {
      setName("");
      setAge("");
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });

  if (!ready) return <Loading />;
  if (!user)
    return (
      <View style={[s.screen, s.pad, { justifyContent: "center" }]}>
        <Text style={s.h2}>Your profile</Text>
        <Text style={s.muted}>Sign in to manage family members and see your bookings.</Text>
        <Button variant="primary" title="Sign in" onPress={() => router.push("/login")} />
      </View>
    );

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
      <View style={s.row}>
        <Avatar name={user.name || user.phone} size={60} />
        <View>
          <Text style={s.h2}>{user.name || "Your account"}</Text>
          <Text style={s.muted}>{user.phone_display} · verified on WhatsApp</Text>
        </View>
      </View>

      <Text style={s.eyebrow}>Family members</Text>
      {list.isLoading && <Loading />}
      {list.data?.map((p) => (
        <Card key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={p.name} size={40} />
          <View>
            <Text style={{ fontWeight: "700" }}>{p.name}</Text>
            <Text style={s.muted}>
              {p.relation === "self" ? "You" : p.relation}
              {p.age != null ? ` · ${p.age} yrs` : ""}
            </Text>
          </View>
        </Card>
      ))}

      <Card style={{ gap: 12 }}>
        <Text style={s.label}>Add a family member</Text>
        <Input label="Full name" value={name} onChangeText={setName} />
        <Input label="Age" value={age} onChangeText={(t) => setAge(t.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {RELATIONS.map((r) => (
            <Chip key={r} label={r[0].toUpperCase() + r.slice(1)} on={relation === r} onPress={() => setRelation(r)} />
          ))}
        </View>
        <ErrorText>{add.error?.message}</ErrorText>
        <Button title="Add member" variant="primary" loading={add.isPending} disabled={name.trim().length < 2 || !age} onPress={() => add.mutate()} />
      </Card>

      <Text style={[s.muted, { fontSize: 12 }]}>Your data is used only for bookings, under India&apos;s DPDP Act. Ask the clinic to delete it at any time.</Text>
      <Button
        title="Sign out"
        onPress={() =>
          Alert.alert("Sign out?", "You can sign back in any time with your phone number.", [
            { text: "Stay signed in", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => void signOut() },
          ])
        }
      />
    </ScrollView>
  );
}
