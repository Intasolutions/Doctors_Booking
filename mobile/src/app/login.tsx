import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { Button, C, ErrorText, Input, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TokenResponse } from "@/lib/types";

type Sent = { sent: boolean; phone_display: string; is_new: boolean; dev_code?: string };

export default function Login() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[s.pad, { paddingTop: 28 }]} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>Welcome back</Text>
        <Text style={s.muted}>We&apos;ll send a 6-digit code to your WhatsApp. No password needed.</Text>
        {!sent ? (
          <View style={{ gap: 14 }}>
            <Input label="Mobile number (WhatsApp)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="98470 12345" />
            <ErrorText>{error}</ErrorText>
            <Button
              variant="primary"
              title="Send code on WhatsApp"
              loading={busy}
              disabled={phone.replace(/\D/g, "").length < 10}
              onPress={() => run(async () => setSent(await api<Sent>("/auth/otp/request/", { method: "POST", body: { phone }, auth: false })))}
            />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Text style={s.body}>
              Code sent to <Text style={{ fontWeight: "800" }}>{sent.phone_display}</Text>.
            </Text>
            {sent.dev_code ? (
              <Text style={{ backgroundColor: "#FAEED6", color: "#9A6210", padding: 10, borderRadius: 10, fontSize: 12.5 }}>
                Development mode: your code is {sent.dev_code}. This never shows on the live server.
              </Text>
            ) : null}
            <Input label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" autoFocus style={{ letterSpacing: 6, fontSize: 18 }} />
            {sent.is_new && <Text style={s.muted}>This number isn&apos;t registered yet. After the code we&apos;ll ask for a few details.</Text>}
            <ErrorText>{error}</ErrorText>
            <Button
              variant="primary"
              title="Sign in"
              loading={busy}
              disabled={code.length !== 6}
              onPress={() =>
                run(async () => {
                  const t = await api<TokenResponse>("/auth/otp/verify/", { method: "POST", body: { phone, code }, auth: false });
                  await signIn(t);
                  // Registered users are taken into the app by the layout; others finish registering.
                  if (!t.user.profile_complete) router.replace("/register");
                })
              }
            />
            <Button title="Change number" onPress={() => (setSent(null), setCode(""))} />
          </View>
        )}
        <Text style={[s.muted, { fontSize: 12, color: C.muted }]}>Your details are shared only with the doctor you book.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
