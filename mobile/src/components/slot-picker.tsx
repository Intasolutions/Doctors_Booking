import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { api } from "@/lib/api";
import { dayName, fmtDate } from "@/lib/format";
import type { DayInfo, DaySlots, Slot } from "@/lib/types";

import { C, Chip, Loading, s } from "./ui";

const period = (t: string) => (Number(t.slice(0, 2)) < 12 ? "Morning" : Number(t.slice(0, 2)) < 16 ? "Afternoon" : "Evening");

export function SlotPicker({ slug, date, time, onDate, onTime }: { slug: string; date: string | null; time: string | null; onDate: (d: string) => void; onTime: (t: string | null) => void }) {
  const days = useQuery({ queryKey: ["days", slug], queryFn: () => api<DayInfo[]>(`/doctors/${slug}/days/`, { auth: false }) });
  const slots = useQuery({
    queryKey: ["slots", slug, date],
    queryFn: () => api<DaySlots>(`/doctors/${slug}/slots/`, { auth: false, params: { date: date! } }),
    enabled: !!date,
    refetchInterval: 30_000,
  });
  const first = days.data?.find((d) => d.free > 0) || days.data?.[0];
  const current = date ?? first?.date ?? null;

  // Tell the parent which day is showing once days have loaded.
  useEffect(() => {
    if (!date && first) onDate(first.date);
  }, [date, first, onDate]);

  if (days.isLoading) return <Loading />;
  const groups: Record<string, Slot[]> = {};
  // Only times that can still be booked.
  for (const sl of (slots.data?.slots || []).filter((x) => x.status !== "past")) (groups[period(sl.time)] ||= []).push(sl);

  return (
    <View style={{ gap: 14 }}>
      <Text style={s.eyebrow}>Choose a day</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.data?.map((d) => (
          <Chip
            key={d.date}
            label={dayName(d.date)}
            sub={`${fmtDate(d.date)} · ${d.on_leave ? "On leave" : d.closed ? "Closed" : d.free ? `${d.free} free` : "Full"}`}
            on={d.date === current}
            onPress={() => {
              onDate(d.date);
              onTime(null);
            }}
          />
        ))}
      </ScrollView>
      {slots.isLoading && <Loading />}
      {slots.data?.on_leave && <Text style={s.muted}>The doctor is on leave this day.</Text>}
      {slots.data && !slots.data.on_leave && slots.data.slots.length === 0 && <Text style={s.muted}>No consultation hours on this day.</Text>}
      {Object.entries(groups).map(([label, items]) => (
        <View key={label} style={{ gap: 8 }}>
          <Text style={s.eyebrow}>{label}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {items.map((sl) => {
              const free = sl.status === "free";
              const on = sl.time === time;
              return (
                <Pressable
                  key={sl.time}
                  disabled={!free}
                  onPress={() => onTime(sl.time)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: !free }}
                  accessibilityLabel={`${sl.label}${free ? "" : ", not available"}`}
                  style={{
                    width: "23%",
                    minWidth: 74,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    alignItems: "center",
                    borderColor: on ? C.brand : free ? C.line : "transparent",
                    backgroundColor: on ? C.brand : free ? C.surface : "#E9EEF4",
                  }}
                >
                  <Text style={{ fontWeight: "700", fontSize: 13, color: on ? "#fff" : free ? C.ink : C.muted, textDecorationLine: free ? "none" : "line-through" }}>{sl.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
