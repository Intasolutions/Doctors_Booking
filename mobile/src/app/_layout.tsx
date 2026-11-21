import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { View } from "react-native";

import { C, Loading } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";

function AppStack() {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: C.canvas }}>
        <Loading />
      </View>
    );
  // Registration comes first: the app's screens open only for registered patients.
  const registered = !!user && user.profile_complete;
  return (
    <Stack
      screenOptions={{
        headerTintColor: C.ink,
        headerStyle: { backgroundColor: C.surface },
        headerTitleStyle: { fontWeight: "800" },
        contentStyle: { backgroundColor: C.canvas },
      }}
    >
      <Stack.Protected guard={!registered}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: user ? "Complete registration" : "Create account" }} />
        <Stack.Screen name="login" options={{ title: "Sign in" }} />
      </Stack.Protected>
      <Stack.Protected guard={registered}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="doctor/[slug]" options={{ title: "Book a visit" }} />
        <Stack.Screen name="reschedule/[code]" options={{ title: "Reschedule" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <StatusBar style="dark" />
        <AppStack />
      </AuthProvider>
    </QueryClientProvider>
  );
}
