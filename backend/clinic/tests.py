from datetime import time, timedelta
from io import StringIO

from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import PhoneOTP, User
from clinic import services as S
from clinic.models import Appointment, Doctor, Patient, Session
from whatsapp.models import MessageLog


def make_doctor(first="Anitha", phone="919800000001", slot=15, hours=(("17:00", "18:00"),)):
    user = User.objects.create_user(f"dr.{first.lower()}", password="pass12345!", first_name=first, last_name="Menon",
                                    role="doctor", phone=phone)
    d = Doctor.objects.create(user=user, specialty="General Physician", area="Kadavanthra",
                              address="Janatha Road, Kochi", fee=400, slot_minutes=slot)
    for wd in range(7):
        for a, b in hours:
            Session.objects.create(doctor=d, weekday=wd, start=S.parse_time(a), end=S.parse_time(b))
    return d


class SlotEngineTests(TestCase):
    def setUp(self):
        self.d = make_doctor()
        self.day = S.today() + timedelta(days=2)
        self.p = Patient.objects.create(name="Arjun K", age=34, phone="919847012345")

    def test_slots_follow_sessions(self):
        times = [s.time for s in S.day_slots(self.d, self.day)]
        self.assertEqual(times, [time(17, 0), time(17, 15), time(17, 30), time(17, 45)])

    def test_code_generated(self):
        self.assertEqual(self.d.code, "DR-ANITHA")
        self.assertEqual(self.d.slug, "dr-anitha-menon")

    def test_double_booking_rejected(self):
        a = S.book(doctor=self.d, patient=self.p, day=self.day, start="17:15", source="web")
        self.assertTrue(a.code.startswith("CS-"))
        other = Patient.objects.create(name="Someone", age=20)
        with self.assertRaises(S.BookingError):
            S.book(doctor=self.d, patient=other, day=self.day, start="17:15", source="web")
        self.assertEqual({s.time: s.status for s in S.day_slots(self.d, self.day)}[time(17, 15)], "booked")

    def test_cancelled_slot_is_free_again(self):
        a = S.book(doctor=self.d, patient=self.p, day=self.day, start="17:15", source="web")
        S.cancel(a, by="patient")
        S.book(doctor=self.d, patient=self.p, day=self.day, start="17:15", source="web")

    def test_off_grid_time_rejected(self):
        with self.assertRaises(S.BookingError):
            S.book(doctor=self.d, patient=self.p, day=self.day, start="17:05", source="web")

    def test_outside_window_rejected(self):
        with self.assertRaises(S.BookingError):
            S.book(doctor=self.d, patient=self.p, day=S.today() + timedelta(days=60), start="17:00", source="web")

    def test_block_cancels_and_notifies_patient(self):
        a = S.book(doctor=self.d, patient=self.p, day=self.day, start="17:30", source="web")
        _, hit = S.add_block(self.d, self.day, "17:15", "17:45")
        self.assertEqual([x.code for x in hit], [a.code])
        a.refresh_from_db()
        self.assertEqual((a.status, a.cancelled_by), ("cancelled", "doctor"))
        self.assertTrue(MessageLog.objects.filter(phone=self.p.phone, summary__icontains="not available").exists())
        self.assertEqual(S.free_slots(self.d, self.day), [time(17, 0), time(17, 45)])

    def test_leave_closes_day(self):
        S.book(doctor=self.d, patient=self.p, day=self.day, start="17:30", source="web")
        _, hit = S.add_leave(self.d, self.day)
        self.assertEqual(len(hit), 1)
        self.assertEqual(S.day_slots(self.d, self.day), [])

    def test_reschedule_moves_booking(self):
        a = S.book(doctor=self.d, patient=self.p, day=self.day, start="17:00", source="web")
        S.reschedule(a, self.day + timedelta(days=1), "17:45", source="web")
        a.refresh_from_db()
        self.assertEqual((a.date, a.start), (self.day + timedelta(days=1), time(17, 45)))
        self.assertIn(time(17, 0), S.free_slots(self.d, self.day))

    def test_doctor_alerted_on_new_booking(self):
        S.book(doctor=self.d, patient=self.p, day=self.day, start="17:00", source="app")
        self.assertTrue(MessageLog.objects.filter(phone=self.d.user.phone, summary__icontains="New booking").exists())
        # Outside the 24h window, the patient's confirmation must be a template.
        m = MessageLog.objects.get(phone=self.p.phone)
        self.assertEqual(m.kind, "template")
        self.assertEqual(m.payload["template"]["name"], "appointment_confirmed")


@override_settings(CARESLOT={**settings.CARESLOT, "OTP_ECHO": False})
class ApiTests(TestCase):
    def setUp(self):
        self.d = make_doctor()
        self.day = (S.today() + timedelta(days=2)).isoformat()
        self.api = APIClient()
        cache.clear()  # reset OTP rate limits between tests

    def login_patient(self, phone="9847012345"):
        self.api.post("/api/auth/otp/request/", {"phone": phone}, format="json")
        # Read the code from the console WhatsApp log, as a phone would.
        code = MessageLog.objects.filter(kind="template").latest("id").payload["template"]["components"][0]["parameters"][0]["text"]
        r = self.api.post("/api/auth/otp/verify/", {"phone": phone, "code": code, "name": "Arjun K"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return r.data

    def test_public_doctor_list_and_slots(self):
        r = self.api.get("/api/doctors/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data[0]["code"], "DR-ANITHA")
        r = self.api.get(f"/api/doctors/{self.d.slug}/slots/?date={self.day}")
        self.assertEqual(len(r.data["slots"]), 4)

    def test_wrong_otp_rejected(self):
        self.api.post("/api/auth/otp/request/", {"phone": "9847012345"}, format="json")
        r = self.api.post("/api/auth/otp/verify/", {"phone": "9847012345", "code": "000000"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_patient_books_for_family_and_cancels(self):
        me = self.login_patient()
        self.assertEqual(me["user"]["phone"], "919847012345")
        r = self.api.post("/api/me/appointments/", {"doctor": self.d.slug, "date": self.day, "time": "17:15",
                                                    "patient": {"name": "Meera Arjun", "age": 6, "relation": "daughter"},
                                                    "reason": "Fever", "source": "app"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        code = r.data["code"]
        self.assertEqual(r.data["patient"]["name"], "Meera Arjun")
        r = self.api.post("/api/me/appointments/", {"doctor": self.d.slug, "date": self.day, "time": "17:15",
                                                    "patient_id": r.data["patient"]["id"]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("just booked", r.data["detail"])
        r = self.api.post(f"/api/me/appointments/{code}/cancel/", format="json")
        self.assertEqual(r.data["status"], "cancelled")

    def test_patient_cannot_touch_others_booking(self):
        other = Patient.objects.create(name="Other", phone="919000000111")
        a = S.book(doctor=self.d, patient=other, day=self.day, start="17:00", source="web")
        self.login_patient()
        self.assertEqual(self.api.post(f"/api/me/appointments/{a.code}/cancel/").status_code, 404)

    def test_doctor_portal(self):
        r = self.api.post("/api/auth/login/", {"username": "919800000001", "password": "pass12345!"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["user"]["doctor"]["code"], "DR-ANITHA")
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        r = self.api.post("/api/doctor/walkins/", {"name": "Walk In", "age": 40, "date": self.day, "time": "17:30"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        code = r.data["code"]
        r = self.api.get(f"/api/doctor/day/?date={self.day}")
        self.assertEqual(r.data["summary"]["booked"], 1)
        r = self.api.post(f"/api/doctor/appointments/{code}/status/", {"status": "completed"}, format="json")
        self.assertEqual(r.data["status"], "completed")
        r = self.api.put("/api/doctor/schedule/", {"slot_minutes": 20, "sessions": [
            {"weekday": 0, "start": "09:00", "end": "10:00"}, {"weekday": 0, "start": "09:30", "end": "11:00"}]}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.api.post("/api/doctor/leaves/", {"date": self.day}, format="json")
        self.assertEqual(r.status_code, 201)

    def test_patient_cannot_open_doctor_portal(self):
        self.login_patient()
        self.assertEqual(self.api.get("/api/doctor/day/").status_code, 403)


class ReminderTests(TestCase):
    def test_reminder_sent_once(self):
        d = make_doctor(hours=(("00:00", "23:45"),))
        p = Patient.objects.create(name="Arjun K", phone="919847012345")
        t = (timezone.localtime() + timedelta(hours=5)).replace(second=0, microsecond=0)
        t = t.replace(minute=(t.minute // 15) * 15)
        if t.date() != S.today():
            self.skipTest("Too close to midnight for a same-day reminder test.")
        a = S.book(doctor=d, patient=p, day=t.date(), start=t.time(), source="web", notify=False)
        Appointment.objects.filter(pk=a.pk).update(created_at=timezone.now() - timedelta(days=1))
        call_command("send_reminders", stdout=StringIO())
        call_command("send_reminders", stdout=StringIO())
        self.assertEqual(MessageLog.objects.filter(phone=p.phone, payload__template__name="appointment_reminder").count(), 1)
