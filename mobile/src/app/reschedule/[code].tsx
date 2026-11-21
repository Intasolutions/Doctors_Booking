import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text } from "react-native";

import { SlotPicker } from "@/components/slot-picker";
import { Button, ErrorText, Loading, s } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/format";
import type { Appointment } from "@/lib/types";

export default function Reschedule() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const qc = useQueryClient();
  const appt = useQuery({ queryKey: ["appointment", code], queryFn: () => api<Appointment>(`/me/appointments/${code}/`) });
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const onDate = useCallback((d: string) => setDate(d), []);
  const onTime = useCallback((t: string | null) => setTime(t), []);
  const move = useMutation({
    mutationFn: () => api(`/me/appointments/${code}/reschedule/`, { method: "POST", body: { date, time, source: "app" } }),
    onSuccess: () => {
      qc.invalidateQueries();
      router.back();
    },
  });

  if (appt.isLoading) return <Loading />;
  if (!appt.data) return <ErrorText>We couldn&apos;t find that booking.</ErrorText>;
  const a = appt.data;
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingBottom: 40 }]}>
      <Text style={s.h2}>Pick a new time with {a.doctor.name}</Text>
      <Text style={s.muted}>
        Currently {a.when}, for {a.patient.name}.
      </Text>
      <SlotPicker slug={a.doctor.slug} date={date} time={time} onDate={onDate} onTime={onTime} />
      <ErrorText>{move.error?.message}</ErrorText>
      <Button
        variant="primary"
        title={date && time ? `Move to ${fmtDate(date)}, ${fmtTime(time)}` : "Pick a new time"}
        disabled={!date || !time}
        loading={move.isPending}
        onPress={() => move.mutate()}
      />
    </ScrollView>
  );
}
