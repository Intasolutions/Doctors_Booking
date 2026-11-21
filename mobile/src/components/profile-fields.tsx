import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { C, Chip, Input, s } from "./ui";

export type ProfileValues = { name: string; gender: string; date_of_birth: string; email: string; consent: boolean };
export const emptyProfile: ProfileValues = { name: "", gender: "", date_of_birth: "", email: "", consent: false };

export function profileError(v: ProfileValues): string {
  if (v.name.trim().length < 2) return "Enter your full name.";
  if (!v.gender) return "Choose your gender.";
  if (!v.date_of_birth) return "Enter a valid date of birth.";
  if (!v.consent) return "Please agree to share your details with the doctors you book.";
  return "";
}

/** DD / MM / YYYY boxes. Reports an ISO date, or "" while incomplete or invalid. */
function DateOfBirth({ onChange }: { onChange: (iso: string) => void }) {
  const [d, setD] = useState({ day: "", month: "", year: "" });
  const update = (k: keyof typeof d, raw: string) => {
    const next = { ...d, [k]: raw.replace(/\D/g, "").slice(0, k === "year" ? 4 : 2) };
    setD(next);
    const y = Number(next.year), m = Number(next.month), day = Number(next.day);
    const date = new Date(y, m - 1, day);
    const valid = next.year.length === 4 && y > 1900 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === day && date <= new Date();
    onChange(valid ? `${next.year}-${next.month.padStart(2, "0")}-${next.day.padStart(2, "0")}` : "");
  };
  const box = { ...s.input, textAlign: "center" as const };
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>Date of birth</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput style={[box, { flex: 1 }]} placeholder="DD" placeholderTextColor="#8A9AAB" keyboardType="number-pad" value={d.day} onChangeText={(t) => update("day", t)} accessibilityLabel="Day of birth" />
        <TextInput style={[box, { flex: 1 }]} placeholder="MM" placeholderTextColor="#8A9AAB" keyboardType="number-pad" value={d.month} onChangeText={(t) => update("month", t)} accessibilityLabel="Month of birth" />
        <TextInput style={[box, { flex: 1.6 }]} placeholder="YYYY" placeholderTextColor="#8A9AAB" keyboardType="number-pad" value={d.year} onChangeText={(t) => update("year", t)} accessibilityLabel="Year of birth" />
      </View>
    </View>
  );
}

export function ProfileFields({ value, onChange }: { value: ProfileValues; onChange: (v: ProfileValues) => void }) {
  const set = (k: keyof ProfileValues, v: string | boolean) => onChange({ ...value, [k]: v });
  return (
    <>
      <Input label="Full name" value={value.name} onChangeText={(t) => set("name", t)} autoComplete="name" />
      <View style={{ gap: 6 }}>
        <Text style={s.label}>Gender</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {[
            ["female", "Female"],
            ["male", "Male"],
            ["other", "Other"],
          ].map(([v, l]) => (
            <Chip key={v} label={l} on={value.gender === v} onPress={() => set("gender", v)} />
          ))}
        </View>
      </View>
      <DateOfBirth onChange={(iso) => set("date_of_birth", iso)} />
      <Input label="Email (optional)" value={value.email} onChangeText={(t) => set("email", t.trim())} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Pressable
        onPress={() => set("consent", !value.consent)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: value.consent }}
        style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: value.consent ? C.brand : C.muted,
            backgroundColor: value.consent ? C.brand : "transparent",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          {value.consent && <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>✓</Text>}
        </View>
        <Text style={[s.body, { flex: 1, fontSize: 14 }]}>I agree to share these details with the doctors I book, and to get booking messages on WhatsApp.</Text>
      </Pressable>
    </>
  );
}
