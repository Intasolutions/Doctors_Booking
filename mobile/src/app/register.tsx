import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { emptyProfile, profileError, ProfileFields, type ProfileValues } from "@/components/profile-fields";
import { Button, ErrorText, Input, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TokenResponse, User } from "@/lib/types";

type Sent = { sent: boolean; phone_display: string; registered: boolean; dev_code?: string };

export default function Register() {
  const { user, signIn, refreshUser } = useAuth();
  const [profile, setProfile] = useState<ProfileValues>(() => ({ ...emptyProfile, name: user?.name || "" }));
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [already, setAlready] = useState(false);
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

  const check = () => {
    const msg = profileError(profile);
    if (msg) setError(msg);
    return !msg;
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 48 }]} keyboardShouldPersistTaps="handled">
        {user ? (
          // Signed in (e.g. first booked on WhatsApp) but the registration details are missing.
          <View style={{ gap: 14 }}>
            <Text style={s.muted}>Signed in as {user.phone_display}. A few details and you&apos;re ready to book.</Text>
            <ProfileFields value={profile} onChange={setProfile} />
            <ErrorText>{error}</ErrorText>
            <Button
              variant="primary"
              title="Save and continue"
              loading={busy}
              onPress={() =>
                check() &&
                run(async () => {
                  await api<User>("/auth/me/", { method: "PATCH", body: profile });
                  await refreshUser(); // the layout then opens the app
                })
              }
            />
          </View>
        ) : !sent ? (
          <View style={{ gap: 14 }}>
            <Text style={s.eyebrow}>Step 1 of 2 · Your details</Text>
            <ProfileFields value={profile} onChange={setProfile} />
            <Input label="Mobile number (WhatsApp)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="98470 12345" />
            {already && (
              <View style={{ backgroundColor: "#FAEED6", padding: 12, borderRadius: 10, gap: 8 }}>
                <Text style={{ color: "#7A4D0C" }}>This number is already registered.</Text>
                <Button small title="Sign in instead" onPress={() => router.replace("/login")} />
              </View>
            )}
            <ErrorText>{error}</ErrorText>
            <Button
              variant="primary"
              title="Send code on WhatsApp"
              loading={busy}
              disabled={phone.replace(/\D/g, "").length < 10}
              onPress={() =>
                check() &&
                run(async () => {
                  const r = await api<Sent>("/auth/otp/request/", { method: "POST", body: { phone }, auth: false });
                  if (r.registered) setAlready(true);
                  else setSent(r);
                })
              }
            />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Text style={s.eyebrow}>Step 2 of 2 · Verify your number</Text>
            <Text style={s.body}>
              We sent a 6-digit code to <Text style={{ fontWeight: "800" }}>{sent.phone_display}</Text> on WhatsApp.
            </Text>
            {sent.dev_code ? (
              <Text style={{ backgroundColor: "#FAEED6", color: "#9A6210", padding: 10, borderRadius: 10, fontSize: 12.5 }}>
                Development mode: your code is {sent.dev_code}. This never shows on the live server.
              </Text>
            ) : null}
            <Input label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" autoFocus style={{ letterSpacing: 6, fontSize: 18 }} />
            <ErrorText>{error}</ErrorText>
            <Button
              variant="primary"
              title="Create account"
              loading={busy}
              disabled={code.length !== 6}
              onPress={() => run(async () => signIn(await api<TokenResponse>("/auth/register/", { method: "POST", body: { ...profile, phone, code }, auth: false })))}
            />
            <Button title="Change details" onPress={() => (setSent(null), setCode(""))} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
