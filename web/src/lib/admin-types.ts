import type { DaySummary, Role } from "./types";

export type AdminStats = {
  today: string;
  bookings_today: number;
  seen_today: number;
  no_show_today: number;
  cancelled_today: number;
  fees_today: number;
  next_7_days: number;
  made_today_by_source: Record<string, number>;
  patients: number;
  patient_accounts: number;
  doctors_active: number;
  doctors_inactive: number;
  doctors_without_location: number;
  whatsapp_messages_today: number;
  whatsapp_failed_today: number;
  doctors: (DaySummary & { slug: string; name: string; specialty: string; has_location: boolean })[];
};

export type AdminDoctor = {
  slug: string;
  status: "active" | "inactive" | "deleted";
  archived_at: string | null;
  total_bookings: number;
  code: string;
  name: string;
  first_name: string;
  last_name: string;
  username: string;
  phone: string;
  phone_display: string;
  email: string;
  can_sign_in: boolean;
  has_password: boolean;
  specialty: string;
  qualifications: string;
  experience_years: number;
  about: string;
  languages: string;
  area: string;
  city: string;
  address: string;
  maps_url: string;
  latitude: number | null;
  longitude: number | null;
  fee: number;
  slot_minutes: number;
  is_active: boolean;
  notify_whatsapp: boolean;
  whatsapp_link: string;
  sessions: { weekday: number; day: string; start: string; end: string }[];
  upcoming_bookings: number;
  next_available: { label: string } | null;
};

export type AdminUser = {
  id: number;
  username: string;
  name: string;
  phone: string;
  phone_display: string;
  email: string;
  role: Role;
  is_active: boolean;
  has_password: boolean;
  profile_complete: boolean;
  date_joined: string;
  last_login: string | null;
  people: number | null;
  bookings: number;
  doctor: { slug: string; name: string; code: string } | null;
};

export type Thread = {
  phone: string;
  phone_display: string;
  name: string;
  is_doctor: boolean;
  messages: number;
  failed: number;
  last: string;
  updated_at: string;
};

export type LogMessage = { id: number; direction: "in" | "out"; kind: string; summary: string; status: string; error: string; created_at: string };

export type Page<T> = { count: number; results: T[] };
