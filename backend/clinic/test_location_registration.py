import json
from datetime import date, timedelta

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from clinic.geo import distance_km
from clinic.tests import make_doctor
from whatsapp.bot import handle_incoming
from whatsapp.models import MessageLog

KADAVANTHRA = (9.9667, 76.2985)
KAKKANAD = (10.0159, 76.3419)
PHONE = "919847012345"


def otp_code():
    m = MessageLog.objects.filter(payload__template__name="login_otp").latest("id")
    return m.payload["template"]["components"][0]["parameters"][0]["text"]


class NearbyDoctorsTests(TestCase):
    def setUp(self):
        self.near = make_doctor("Anitha", phone="919800000001")
        self.near.latitude, self.near.longitude, self.near.area = *KADAVANTHRA, "Kadavanthra"
        self.near.save()
        self.far = make_doctor("Fathima", phone="919800000003")
        self.far.latitude, self.far.longitude, self.far.area = *KAKKANAD, "Kakkanad"
        self.far.save()
        self.unplaced = make_doctor("Rahul", phone="919800000002")  # no coordinates yet

    def test_distance_is_sane(self):
        self.assertAlmostEqual(distance_km(*KADAVANTHRA, *KAKKANAD), 7.1, delta=0.5)

    def test_nearest_first_with_distance(self):
        # Patient standing in Kakkanad.
        r = APIClient().get("/api/doctors/", {"lat": KAKKANAD[0], "lng": KAKKANAD[1]})
        self.assertEqual([d["code"] for d in r.data], ["DR-FATHIMA", "DR-ANITHA", "DR-RAHUL"])
        self.assertEqual(r.data[0]["distance_km"], 0.0)
        self.assertIsNone(r.data[2]["distance_km"])

    def test_radius_filter(self):
        r = APIClient().get("/api/doctors/", {"lat": KAKKANAD[0], "lng": KAKKANAD[1], "radius_km": 3})
        self.assertEqual([d["code"] for d in r.data], ["DR-FATHIMA"])

    def test_bad_location_ignored(self):
        r = APIClient().get("/api/doctors/", {"lat": "abc", "lng": "200"})
        self.assertEqual(len(r.data), 3)
        self.assertTrue(all(d["distance_km"] is None for d in r.data))

    def test_whatsapp_location_lists_nearest(self):
        handle_incoming(PHONE, text="hi")
        handle_incoming(PHONE, reply_id="other", reply_title="Find a doctor")
        asks = MessageLog.objects.filter(phone=PHONE, kind="location_request")
        self.assertEqual(asks.count(), 1)
        handle_incoming(PHONE, location=KAKKANAD, kind="location")
        m = MessageLog.objects.filter(phone=PHONE, direction="out").latest("id")
        rows = m.payload["interactive"]["action"]["sections"][0]["rows"]
        self.assertEqual(rows[0]["id"], f"doc:{self.far.id}")
        self.assertTrue(rows[0]["description"].startswith("0.0 km"))

    def test_webhook_location_message(self):
        body = {"entry": [{"changes": [{"value": {"messages": [{
            "from": PHONE, "id": "wamid.loc1", "type": "location",
            "location": {"latitude": KADAVANTHRA[0], "longitude": KADAVANTHRA[1]}}]}}]}]}
        with self.settings(WHATSAPP={**settings.WHATSAPP, "APP_SECRET": ""}, DEBUG=True):
            r = self.client.post("/api/whatsapp/webhook/", json.dumps(body), content_type="application/json")
        self.assertEqual(r.status_code, 200)
        m = MessageLog.objects.filter(phone=PHONE, direction="out").latest("id")
        self.assertEqual(m.payload["interactive"]["action"]["sections"][0]["rows"][0]["id"], f"doc:{self.near.id}")


@override_settings(CARESLOT={**settings.CARESLOT, "OTP_ECHO": False})
class RegistrationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.api = APIClient()
        self.profile = {"name": "Arjun K", "gender": "male", "date_of_birth": "1992-03-14",
                        "email": "arjun@example.com", "consent": True}

    def register(self, **over):
        sent = self.api.post("/api/auth/otp/request/", {"phone": "9847012345"}, format="json").data
        return sent, self.api.post("/api/auth/register/", {**self.profile, "phone": "9847012345", "code": otp_code(), **over}, format="json")

    def test_register_creates_complete_profile(self):
        sent, r = self.register()
        self.assertFalse(sent["registered"])
        self.assertEqual(r.status_code, 201, r.data)
        u = r.data["user"]
        self.assertTrue(u["profile_complete"])
        self.assertEqual((u["name"], u["gender"], u["date_of_birth"], u["email"]), ("Arjun K", "male", "1992-03-14", "arjun@example.com"))
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        me = self.api.get("/api/me/patients/").data
        self.assertEqual(me[0]["relation"], "self")
        self.assertEqual(me[0]["age"], date.today().year - 1992 - ((date.today().month, date.today().day) < (3, 14)))

    def test_second_registration_rejected(self):
        self.register()
        sent, r = self.register()
        self.assertTrue(sent["registered"])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["code"], "already_registered")

    def test_consent_and_dob_required(self):
        _, r = self.register(consent=False)
        self.assertEqual(r.status_code, 400)
        self.assertIn("consent", r.data)
        _, r = self.register(date_of_birth=(date.today() + timedelta(days=3)).isoformat())
        self.assertIn("date_of_birth", r.data)

    def test_whatsapp_user_completes_profile(self):
        # Someone who booked on WhatsApp has an account without a full profile.
        from clinic.services import ensure_patient_account

        ensure_patient_account(PHONE, "Arjun")
        sent, r = self.register()
        self.assertFalse(sent["registered"])
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(User.objects.filter(phone=PHONE).count(), 1)

    def test_sign_in_shows_incomplete_then_patch_completes(self):
        self.api.post("/api/auth/otp/request/", {"phone": "9847012345"}, format="json")
        r = self.api.post("/api/auth/otp/verify/", {"phone": "9847012345", "code": otp_code()}, format="json")
        self.assertFalse(r.data["user"]["profile_complete"])
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        r = self.api.patch("/api/auth/me/", self.profile, format="json")
        self.assertTrue(r.data["profile_complete"])


class FamilySoftDeleteTests(TestCase):
    def test_removed_member_hidden_but_kept(self):
        from clinic import services as S
        from clinic.models import Patient

        d = make_doctor()
        u = S.ensure_patient_account(PHONE, "Arjun")
        me = Patient.objects.create(account=u, name="Arjun", phone=PHONE, relation="self")
        kid = Patient.objects.create(account=u, name="Meera", phone=PHONE, relation="daughter")
        past = S.book(doctor=d, patient=kid, day=S.today() + timedelta(days=1), start="17:00", source="web", notify=False)
        api = APIClient()
        api.force_authenticate(u)
        self.assertEqual(api.delete(f"/api/me/patients/{me.id}/").status_code, 400)  # can't remove yourself
        self.assertEqual(api.delete(f"/api/me/patients/{kid.id}/").status_code, 400)  # upcoming visit
        S.cancel(past, by="patient", notify=False)
        self.assertEqual(api.delete(f"/api/me/patients/{kid.id}/").status_code, 204)
        self.assertEqual([p["name"] for p in api.get("/api/me/patients/").data], ["Arjun"])
        kid.refresh_from_db()
        self.assertIsNotNone(kid.removed_at)  # still in the database
