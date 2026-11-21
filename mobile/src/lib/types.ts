export type Role = "admin" | "doctor" | "patient";

export type User = {
  id: number;
  name: string;
  phone: string;
  phone_display: string;
  role: Role;
  email: string;
  gender: string;
  date_of_birth: string | null;
  profile_complete: boolean;
  doctor: { slug: string; name: string; code: string } | null;
};

export type TokenResponse = { access: string; refresh: string; user: User };

export type Meta = {
  brand: string;
  whatsapp_number: string;
  booking_window_days: number;
  specialties: string[];
  areas: string[];
  today: string;
};

export type Doctor = {
  slug: string;
  code: string;
  name: string;
  specialty: string;
  qualifications: string;
  experience_years: number;
  about: string;
  languages: string;
  area: string;
  city: string;
  address: string;
  directions_url: string;
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
  fee: number;
  slot_minutes: number;
  whatsapp_link: string;
  next_available: { date: string; time: string; label: string } | null;
  hours: { day: string; sessions: string[] }[];
  is_active?: boolean;
  notify_whatsapp?: boolean;
};

export type DayInfo = {
  date: string;
  label: string;
  short: string;
  on_leave: boolean;
  closed: boolean;
  free: number;
  first_free: string | null;
};

export type SlotStatus = "free" | "booked" | "blocked" | "past";
export type Slot = { time: string; label: string; status: SlotStatus };
export type DaySlots = { date: string; label: string; on_leave: boolean; slots: Slot[] };

export type Patient = { id: number; name: string; age: number | null; date_of_birth: string | null; gender: string; relation: string };

export type ApptStatus = "confirmed" | "checked_in" | "completed" | "no_show" | "cancelled";

export type Appointment = {
  code: string;
  doctor: { slug: string; name: string; specialty: string; area: string; address: string; directions_url: string; fee: number };
  patient: Patient;
  date: string;
  time: string;
  when: string;
  status: ApptStatus;
  status_label: string;
  source: "web" | "app" | "whatsapp" | "walkin" | "admin";
  source_label: string;
  reason: string;
  fee: number;
  patient_confirmed: boolean;
  cancelled_by: string;
  upcoming: boolean;
  created_at: string;
  patient_phone?: string;
};

export type DaySummary = {
  date: string;
  booked: number;
  seen: number;
  waiting: number;
  remaining: number;
  no_show: number;
  collected: number;
  expected: number;
  on_leave: boolean;
};

export type DoctorDay = {
  summary: DaySummary;
  label: string;
  days: DayInfo[];
  blocks: TimeBlock[];
  free_slots: string[];
  appointments: Appointment[];
};

export type TimeBlock = { id: number; date: string; start: string; end: string; reason: string };
export type Leave = { id: number; date: string; reason: string };
export type Schedule = { slot_minutes: number; sessions: { weekday: number; start: string; end: string }[] };
