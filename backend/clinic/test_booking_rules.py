from datetime import timedelta

from django.forms import modelform_factory
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from clinic import services as S
from clinic.models import Doctor, Patient
from clinic.tests import make_doctor
from whatsapp.models import MessageLog


def admin_client():
    api = APIClient()
    api.force_authenticate(User.objects.create_superuser("boss", "", "pass12345!"))
    return api


class SlotLengthTests(TestCase):
    def setUp(self):
        self.d = make_doctor()

    def test_only_listed_lengths_accepted(self):
        api = admin_client()
        for bad in (0, 7):
            r = api.patch(f"/api/admin/doctors/{self.d.slug}/", {"slot_minutes": bad}, format="json")
            self.assertEqual(r.status_code, 400, r.data)
        # Django admin (/admin/) builds its form from the model field.
        form = modelform_factory(Doctor, fields=["slot_minutes"])(data={"slot_minutes": 0}, instance=self.d)
        self.assertFalse(form.is_valid())

    def test_slot_engine_never_loops_on_a_bad_row(self):
        self.d.slot_minutes = 0  # in memory only, like an old row saved before the fix
        self.assertEqual(S.slot_times(self.d, S.today()), [])


class DoctorCodeTests(TestCase):
    def test_code_with_spaces_is_a_duplicate_not_a_crash(self):
        make_doctor()  # DR-ANITHA
        api = admin_client()
        base = {"first_name": "Code", "specialty": "GP", "area": "A", "address": "B", "fee": 1}
        r = api.post("/api/admin/doctors/", {**base, "code": "dr- anitha"}, format="json")
        self.assertEqual(r.status_code, 400, r.data)
        self.assertIn("code", r.data)
        r = api.post("/api/admin/doctors/", {**base, "code": "dr new"}, format="json")
        self.assertEqual((r.status_code, r.data.get("code")), (201, "DRNEW"))


class ScheduleChangeTests(TestCase):
    def setUp(self):
        self.d = make_doctor(slot=15, hours=(("17:00", "18:00"),))
        self.day = S.today() + timedelta(days=2)
        self.p = Patient.objects.create(name="Arjun K", age=34, phone="919847012345")
        self.a = S.book(doctor=self.d, patient=self.p, day=self.day, start="17:15", source="web")
        self.api = APIClient()
        self.api.force_authenticate(self.d.user)
        self.hours = [{"weekday": wd, "start": "17:00", "end": "18:00"} for wd in range(7)]

    def put(self, **body):
        return self.api.put("/api/doctor/schedule/", {"slot_minutes": 15, "sessions": self.hours, **body}, format="json")

    def told_unavailable(self):
        return MessageLog.objects.filter(phone=self.p.phone, direction="out", summary__contains="not available").exists()

    def test_new_slot_length_asks_before_cancelling(self):
        r = self.put(slot_minutes=20)  # 17:00, 17:20, 17:40: the 17:15 booking is off the grid
        self.assertEqual(r.status_code, 409, r.data)
        self.assertEqual([x["code"] for x in r.data["affected"]], [self.a.code])
        self.d.refresh_from_db()
        self.assertEqual(self.d.slot_minutes, 15)  # nothing saved
        r = self.put(slot_minutes=20, cancel_affected=True)
        self.assertEqual((r.status_code, r.data["cancelled"]), (200, [self.a.code]))
        self.a.refresh_from_db()
        self.assertEqual((self.a.status, self.a.cancelled_by), ("cancelled", "doctor"))
        self.assertTrue(self.told_unavailable())

    def test_removing_hours_asks_first(self):
        r = self.put(sessions=[])
        self.assertEqual(r.status_code, 409, r.data)
        self.assertEqual(self.d.sessions.count(), 7)

    def test_change_that_keeps_every_booking_saves_straight_away(self):
        r = self.put(slot_minutes=5, sessions=[{"weekday": wd, "start": "16:00", "end": "19:00"} for wd in range(7)])
        self.assertEqual((r.status_code, r.data["cancelled"]), (200, []))
        self.a.refresh_from_db()
        self.assertEqual(self.a.status, "confirmed")

    def test_admin_slot_length_change_asks_first(self):
        api = admin_client()
        r = api.patch(f"/api/admin/doctors/{self.d.slug}/", {"slot_minutes": 20}, format="json")
        self.assertEqual(r.status_code, 409, r.data)
        r = api.patch(f"/api/admin/doctors/{self.d.slug}/", {"slot_minutes": 20, "cancel_affected": True}, format="json")
        self.assertEqual((r.status_code, r.data["slot_minutes"], r.data["cancelled"]), (200, 20, [self.a.code]))


class ReopenTests(TestCase):
    def setUp(self):
        self.d = make_doctor(hours=(("17:00", "18:00"),))
        self.day = S.today() + timedelta(days=2)
        self.p = Patient.objects.create(name="Arjun K", age=34, phone="919847012345")
        self.a = S.book(doctor=self.d, patient=self.p, day=self.day, start="17:15", source="web")
        self.api = admin_client()

    def reopen(self):
        return self.api.post(f"/api/admin/appointments/{self.a.code}/status/", {"status": "confirmed"}, format="json")

    def test_refused_on_a_leave_day(self):
        S.add_leave(self.d, self.day)
        r = self.reopen()
        self.assertEqual(r.status_code, 400, r.data)
        self.assertIn("leave", r.data["detail"])

    def test_refused_in_blocked_time(self):
        S.add_block(self.d, self.day, "17:00", "18:00")
        self.assertEqual(self.reopen().status_code, 400)

    def test_patient_told_when_visit_is_back_on(self):
        S.cancel(self.a, by="admin")
        before = MessageLog.objects.filter(phone=self.p.phone, summary__contains="Booking confirmed").count()
        r = self.reopen()
        self.assertEqual((r.status_code, r.data["status"]), (200, "confirmed"))
        after = MessageLog.objects.filter(phone=self.p.phone, summary__contains="Booking confirmed").count()
        self.assertEqual(after, before + 1)
