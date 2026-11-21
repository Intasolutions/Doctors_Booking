import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, C, s } from "@/components/ui";

const POINTS = [
  { icon: "location-outline" as const, text: "See the doctors nearest to you, with their next free time" },
  { icon: "calendar-outline" as const, text: "Book for yourself or your family in a few taps" },
  { icon: "logo-whatsapp" as const, text: "Confirmations and reminders on WhatsApp" },
];

export default function Welcome() {
  return (
    <SafeAreaView style={[s.screen, { padding: 24, justifyContent: "space-between" }]}>
      <View style={{ gap: 18, marginTop: 24 }}>
        <View style={{ width: 52, height: 52, borderRadius: 15, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="add" size={34} color="#fff" />
        </View>
        <Text style={{ fontSize: 30, fontWeight: "800", color: C.ink, lineHeight: 36 }}>See a trusted doctor near home</Text>
        <Text style={[s.body, { color: C.muted }]}>
          CareSlot books visits with private-practice doctors who consult from their home clinics.
        </Text>
        <View style={{ gap: 14, marginTop: 8 }}>
          {POINTS.map((p) => (
            <View key={p.text} style={s.row}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={p.icon} size={19} color={C.accentDark} />
              </View>
              <Text style={[s.body, { flex: 1 }]}>{p.text}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Button variant="primary" title="Create account" onPress={() => router.push("/register")} />
        <Button title="I already have an account" onPress={() => router.push("/login")} />
        <Text style={[s.muted, { textAlign: "center", fontSize: 12 }]}>Registration takes a minute. We verify your number on WhatsApp.</Text>
      </View>
    </SafeAreaView>
  );
}
