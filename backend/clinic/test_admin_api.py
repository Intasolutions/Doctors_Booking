from datetime import timedelta

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from clinic import services as S
from clinic.models import Appointment, Patient
from clinic.tests import make_doctor
from whatsapp.models import MessageLog


class AdminApiTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("boss", "", "pass12345!")
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.doc = make_doctor()
        self.day = (S.today() + timedelta(days=2)).isoformat()

    def test_only_admins(self):
        for user in (self.doc.user, User.objects.create_user("p", phone="919000000999", role="patient")):
            c = APIClient()
            c.force_authenticate(user)
            self.assertEqual(c.get("/api/admin/stats/").status_code, 403)
            self.assertEqual(c.get("/api/admin/users/").status_code, 403)

    def test_create_and_edit_doctor(self):
        r = self.api.post("/api/admin/doctors/", {
            "first_name": "Meera", "last_name": "Iyer", "phone": "98470 55555", "password": "longpassword1",
            "specialty": "Dentist", "area": "Aluva", "address": "Bank Road, Aluva", "fee": 300, "slot_minutes": 20,
            "latitude": 10.1, "longitude": 76.35}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual((r.data["code"], r.data["username"], r.data["phone"]), ("DR-MEERA", "dr.meera", "919847055555"))
        c = APIClient()
        self.assertEqual(c.post("/api/auth/login/", {"username": "dr.meera", "password": "longpassword1"}, format="json").status_code, 200)
        r = self.api.patch(f"/api/admin/doctors/{r.data['slug']}/", {"fee": 350, "is_active": False}, format="json")
        self.assertEqual((r.data["fee"], r.data["is_active"]), (350, False))
        # Phone already used by another login is refused.
        r = self.api.post("/api/admin/doctors/", {"first_name": "X", "phone": "919800000001", "specialty": "GP",
                                                  "area": "A", "address": "B", "fee": 1}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("phone", r.data)

    def test_book_on_behalf_reschedule_reopen(self):
        r = self.api.post("/api/admin/appointments/", {"doctor": self.doc.slug, "date": self.day, "time": "17:15",
                                                       "name": "Phone Caller", "age": 50, "phone": "9847000111"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        code = r.data["code"]
        self.assertEqual(r.data["source"], "admin")
        self.assertTrue(MessageLog.objects.filter(phone="919847000111").exists())  # patient got a confirmation
        r = self.api.post(f"/api/admin/appointments/{code}/reschedule/", {"date": self.day, "time": "17:45"}, format="json")
        self.assertEqual(r.data["time"], "17:45")
        self.api.post(f"/api/admin/appointments/{code}/cancel/", {}, format="json")
        r = self.api.post(f"/api/admin/appointments/{code}/status/", {"status": "confirmed"}, format="json")
        self.assertEqual(r.data["status"], "confirmed")
        r = self.api.get("/api/admin/appointments/", {"q": "caller"})
        self.assertEqual(r.data["count"], 1)

    def test_users_roles_and_erase(self):
        p = User.objects.create_user("919847099999", phone="919847099999", role="patient", first_name="Ravi")
        pat = Patient.objects.create(account=p, name="Ravi K", phone=p.phone, age=40)
        a = S.book(doctor=self.doc, patient=pat, day=self.day, start="17:00", source="web", reason="Back pain")
        r = self.api.get("/api/admin/users/", {"role": "patient"})
        self.assertEqual(r.data["count"], 1)
        self.assertEqual(r.data["results"][0]["bookings"], 1)
        self.assertEqual(self.api.patch(f"/api/admin/users/{self.admin.pk}/", {"role": "patient"}, format="json").status_code, 400)
        self.assertEqual(self.api.patch(f"/api/admin/users/{p.pk}/", {"is_active": False}, format="json").data["is_active"], False)
        self.assertEqual(self.api.delete(f"/api/admin/users/{p.pk}/").status_code, 204)
        a.refresh_from_db()
        self.assertEqual((a.patient.name, a.patient.phone, a.reason), ("Erased patient", "", ""))
        self.assertFalse(MessageLog.objects.filter(phone="919847099999").exists())
        p.refresh_from_db()  # row kept, personal data gone, login off
        self.assertEqual((p.first_name, p.phone, p.is_active), ("", None, False))
        self.assertEqual(self.api.get("/api/admin/users/", {"role": "patient"}).data["count"], 0)
        r = self.api.post("/api/admin/users/", {"username": "desk", "password": "deskpass123", "name": "Front Desk"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["role"], "admin")

    def test_stats_and_messages(self):
        r = self.api.get("/api/admin/stats/")
        self.assertEqual(r.data["doctors_active"], 1)
        S.book(doctor=self.doc, patient=Patient.objects.create(name="Z", phone="919847011111"), day=self.day,
               start="17:00", source="web")
        r = self.api.get("/api/admin/messages/")
        self.assertTrue(any(t["phone"] == "919847011111" for t in r.data["results"]))
        r = self.api.get("/api/admin/messages/", {"phone": "919847011111"})
        self.assertGreaterEqual(r.data["count"], 1)
        self.assertEqual(Appointment.objects.count(), 1)


class DoctorDeleteTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("boss", "", "pass12345!")
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.day = (S.today() + timedelta(days=2)).isoformat()

    def test_delete_is_always_soft(self):
        d = make_doctor()
        r = self.api.delete(f"/api/admin/doctors/{d.slug}/")
        self.assertEqual(r.data["result"], "archived")
        d.refresh_from_db()  # still in the database
        self.assertIsNotNone(d.archived_at)
        self.assertFalse(User.objects.get(username="dr.anitha").is_active)

    def test_upcoming_bookings_must_be_cancelled_first(self):
        d = make_doctor()
        p = Patient.objects.create(name="Ravi", phone="919847022222")
        a = S.book(doctor=d, patient=p, day=self.day, start="17:00", source="web")
        r = self.api.delete(f"/api/admin/doctors/{d.slug}/")
        self.assertEqual((r.status_code, r.data["upcoming"]), (409, 1))
        r = self.api.delete(f"/api/admin/doctors/{d.slug}/?cancel_upcoming=1")
        self.assertEqual((r.data["result"], r.data["cancelled"]), ("archived", 1))
        a.refresh_from_db()
        self.assertEqual(a.status, "cancelled")
        self.assertTrue(MessageLog.objects.filter(phone=p.phone, summary__icontains="not available").exists())
        # Gone for patients, login off, visit record kept.
        self.assertEqual(APIClient().get("/api/doctors/").data, [])
        self.assertEqual(APIClient().post("/api/auth/login/", {"username": "dr.anitha", "password": "pass12345!"}, format="json").status_code, 401)
        self.assertEqual(Appointment.objects.count(), 1)
        self.assertEqual(self.api.get("/api/admin/doctors/", {"status": "deleted"}).data[0]["status"], "deleted")
        self.assertEqual(self.api.patch(f"/api/admin/doctors/{d.slug}/", {"fee": 1}, format="json").status_code, 400)
        # Restore comes back inactive with login on.
        r = self.api.post(f"/api/admin/doctors/{d.slug}/restore/")
        self.assertEqual(r.data["status"], "inactive")
        self.assertEqual(APIClient().post("/api/auth/login/", {"username": "dr.anitha", "password": "pass12345!"}, format="json").status_code, 200)

    def test_active_toggle(self):
        d = make_doctor()
        r = self.api.patch(f"/api/admin/doctors/{d.slug}/", {"is_active": False}, format="json")
        self.assertEqual(r.data["status"], "inactive")
        self.assertEqual(APIClient().get("/api/doctors/").data, [])


class QuickBookingTests(TestCase):
    def test_next_slots_and_phone_lookup(self):
        d = make_doctor()
        r = APIClient().get("/api/doctors/")
        ns = r.data[0]["next_slots"]
        self.assertTrue(1 <= len(ns["times"]) <= 4)
        self.assertRegex(ns["label"], r"\d{2}/\d{2}/\d{4}")
        Patient.objects.create(name="Ravi K", age=40, phone="919847033333")
        admin = User.objects.create_superuser("boss", "", "pass12345!")
        api = APIClient()
        api.force_authenticate(admin)
        self.assertEqual([p["name"] for p in api.get("/api/admin/patients/lookup/", {"phone": "98470 33333"}).data], ["Ravi K"])
        self.assertEqual(api.get("/api/admin/patients/lookup/", {"phone": "123"}).data, [])
