import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type TextInputProps, type ViewStyle } from "react-native";

import { hueFor, initials } from "@/lib/format";
import type { ApptStatus } from "@/lib/types";

export const C = {
  canvas: "#F3F7FB",
  surface: "#FFFFFF",
  ink: "#0E2236",
  muted: "#55687C",
  line: "#D9E3ED",
  brand: "#1B64DA",
  brandDark: "#144CA8",
  brandSoft: "#E7EFFD",
  // Green marks good news: free times, nearby, confirmed.
  accent: "#16A06B",
  accentDark: "#0B6B47",
  accentSoft: "#E3F5EC",
  red: "#B8372F",
  redSoft: "#FAE1DE",
};

type BtnProps = PressableProps & {
  title: string;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
};

export function Button({ title, variant = "secondary", loading, small, disabled, style, ...rest }: BtnProps) {
  const v = {
    primary: { bg: C.brand, fg: "#fff", border: C.brand },
    secondary: { bg: C.surface, fg: C.ink, border: C.line },
    danger: { bg: C.redSoft, fg: C.red, border: C.redSoft },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSm,
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[s.btnText, small && { fontSize: 13 }, { color: v.fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const h = hueFor(name);
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: `hsl(${h}, 45%, 90%)` }]}>
      <Text style={{ fontWeight: "800", fontSize: size * 0.34, color: `hsl(${h}, 55%, 24%)` }}>{initials(name)}</Text>
    </View>
  );
}

const PILL: Record<ApptStatus, [string, string]> = {
  confirmed: ["#E7EFFD", "#144CA8"],
  checked_in: ["#FAEED6", "#9A6210"],
  completed: ["#E3F5EC", "#0B6B47"],
  no_show: [C.redSoft, C.red],
  cancelled: [C.redSoft, C.red],
};

export function StatusPill({ status, label }: { status: ApptStatus; label: string }) {
  const [bg, fg] = PILL[status];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export function Chip({ label, on, onPress, sub }: { label: string; on?: boolean; onPress: () => void; sub?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[s.chip, on && { backgroundColor: C.brandSoft, borderColor: C.brand }]}
    >
      <Text style={{ fontWeight: "700", fontSize: 13.5, color: C.ink }}>{label}</Text>
      {sub ? <Text style={{ fontSize: 12, color: C.muted }}>{sub}</Text> : null}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#8A9AAB" style={[s.input, style]} {...rest} />
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 32, alignItems: "center" }}>
      <ActivityIndicator color={C.brand} />
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={s.error}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  pad: { padding: 18, gap: 16 },
  h1: { fontSize: 24, fontWeight: "800", color: C.ink },
  h2: { fontSize: 17, fontWeight: "800", color: C.ink },
  muted: { color: C.muted, fontSize: 13.5 },
  body: { color: C.ink, fontSize: 15, lineHeight: 21 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", color: C.muted },
  label: { fontSize: 13, fontWeight: "700", color: C.ink },
  btn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  btnSm: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 9 },
  btnText: { fontWeight: "700", fontSize: 15 },
  avatar: { alignItems: "center", justifyContent: "center" },
  pill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3, alignSelf: "flex-start" },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 84 },
  input: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: C.ink },
  error: { backgroundColor: C.redSoft, color: C.red, padding: 10, borderRadius: 10, fontWeight: "600", fontSize: 13.5 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
