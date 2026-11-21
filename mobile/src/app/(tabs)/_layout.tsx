import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/tabs";

import { C } from "@/components/ui";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.muted,
        headerTitleStyle: { fontWeight: "800" },
        sceneStyle: { backgroundColor: C.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Find a doctor", tabBarLabel: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="search" color={String(color)} size={size} /> }}
      />
      <Tabs.Screen
        name="visits"
        options={{ title: "My visits", tabBarLabel: "Visits", tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={String(color)} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={String(color)} size={size} /> }}
      />
    </Tabs>
  );
}
