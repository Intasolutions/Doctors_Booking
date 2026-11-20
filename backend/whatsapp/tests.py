import hashlib
import hmac
import json
from datetime import timedelta

from django.test import TestCase, override_settings
from django.conf import settings

from clinic import services as S
from clinic.models import Appointment, Patient
from clinic.tests import make_doctor
from whatsapp.bot import handle_incoming
from whatsapp.models import MessageLog

PHONE = "919847012345"


def last_out(phone=PHONE) -> MessageLog:
    return MessageLog.objects.filter(phone=phone, direction="out").latest("id")


def reply_ids(m: MessageLog) -> list[str]:
    inter = m.payload.get("interactive", {})
    if inter.get("type") == "button":
        return [b["reply"]["id"] for b in inter["action"]["buttons"]]
    if inter.get("type") == "list":
        return [r["id"] for s in inter["action"]["sections"] for r in s["rows"]]
    return []


class PatientBotTests(TestCase):
    def setUp(self):
        self.d = make_doctor()

    def say(self, text):
        handle_incoming(PHONE, text=text, profile_name="Arjun")
        return last_out()

    def tap(self, rid):
        handle_incoming(PHONE, reply_id=rid, reply_title=rid)
        return last_out()

    def test_full_booking_flow(self):
        m = self.say("dr-anitha")
        self.assertIn("Dr. Anitha Menon", m.summary)
        self.assertEqual(reply_ids(m)[0], "book")
        m = self.tap("book")
        day_id = next(i for i in reply_ids(m) if i.startswith("date:") and i != f"date:{S.today().isoformat()}")
        m = self.tap(day_id)
        time_id = reply_ids(m)[0]
        self.assertTrue(time_id.startswith("time:"))
        m = self.tap(time_id)
        self.assertIn("full name", m.summary)
        self.assertIn("age", self.say("meera arjun").summary)
        self.assertIn("reason", self.say("6").summary)
        m = self.say("Fever since two days")
        self.assertIn("Patient: Meera Arjun, 6", m.summary)
        m = self.tap("confirm")
        self.assertIn("Booking confirmed", m.summary)
        a = Appointment.objects.get()
        self.assertEqual((a.source, a.patient.name, a.reason), ("whatsapp", "Meera Arjun", "Fever since two days"))
        self.assertEqual(a.patient.account.phone, PHONE)
        # The doctor got an alert.
        self.assertTrue(MessageLog.objects.filter(phone=self.d.user.phone, summary__icontains=a.code).exists())

        # Second booking offers the saved patient as a button.
        self.say("hi")
        m = self.tap("book")
        m = self.tap(reply_ids(m)[-1])
        m = self.tap(reply_ids(m)[0])
        self.assertIn(f"pt:{a.patient_id}", reply_ids(m))

        # Cancel through "my bookings".
        self.tap("mine")
        m = self.tap(f"cancel:{a.code}")
        self.assertEqual(reply_ids(m), [f"cyes:{a.code}", "keep"])
        self.tap(f"cyes:{a.code}")
        a.refresh_from_db()
        self.assertEqual(a.status, "cancelled")

    def test_cannot_cancel_someone_elses_booking(self):
        other = Patient.objects.create(name="Other", phone="919000000111")
        a = S.book(doctor=self.d, patient=other, day=S.today() + timedelta(days=2), start="17:00", source="web")
        self.tap(f"cyes:{a.code}")
        a.refresh_from_db()
        self.assertEqual(a.status, "confirmed")

    def test_unknown_text_gets_menu(self):
        m = self.say("what is this")
        self.assertEqual(reply_ids(m), ["book", "mine", "other"])

    def test_reschedule_flow(self):
        p = Patient.objects.create(name="Arjun K", phone=PHONE)
        day = S.today() + timedelta(days=2)
        a = S.book(doctor=self.d, patient=p, day=day, start="17:00", source="web")
        self.tap(f"resch:{a.code}")
        self.tap(f"date:{day.isoformat()}")
        m = self.tap("time:17:45")
        self.assertIn("Move booking", m.summary)
        self.tap("rconfirm")
        a.refresh_from_db()
        self.assertEqual(a.start.strftime("%H:%M"), "17:45")

    def test_list_limits_respected(self):
        make_doctor("Rahul", phone="919800000002", slot=5, hours=(("08:00", "20:00"),))
        self.say("DR-RAHUL")
        self.tap("book")
        m = self.tap(f"date:{(S.today() + timedelta(days=1)).isoformat()}")
        rows = [r for s in m.payload["interactive"]["action"]["sections"] for r in s["rows"]]
        self.assertLessEqual(len(rows), 10)
        self.assertTrue(all(len(r["title"]) <= 24 for r in rows))


class DoctorBotTests(TestCase):
    def setUp(self):
        self.d = make_doctor()
        self.p = Patient.objects.create(name="Arjun K", phone=PHONE)
        self.tomorrow = S.today() + timedelta(days=1)
        self.a = S.book(doctor=self.d, patient=self.p, day=self.tomorrow, start="17:30", source="web")

    def cmd(self, text):
        handle_incoming(self.d.user.phone, text=text)
        return last_out(self.d.user.phone)

    def test_tomorrow_list(self):
        self.assertIn("Arjun K", self.cmd("tomorrow").summary)

    def test_block_informs_patient(self):
        m = self.cmd("block 5:15pm-6pm tomorrow")
        self.assertIn("1 patient was told", m.summary)
        self.a.refresh_from_db()
        self.assertEqual(self.a.status, "cancelled")
        self.assertIn("rebook:", json.dumps(last_out(PHONE).payload))

    def test_done_and_help(self):
        self.assertIn("Marked", self.cmd(f"done {self.a.code.lower()}").summary)
        self.assertIn("Commands you can send", self.cmd("blah").summary)


@override_settings(WHATSAPP={**settings.WHATSAPP, "APP_SECRET": "s3cret"})
class WebhookTests(TestCase):
    def post(self, body: dict, secret="s3cret"):
        raw = json.dumps(body).encode()
        sig = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        return self.client.post("/api/whatsapp/webhook/", raw, content_type="application/json", HTTP_X_HUB_SIGNATURE_256=sig)

    def payload(self, msg_id="wamid.1", text="hi"):
        return {"entry": [{"changes": [{"value": {
            "contacts": [{"wa_id": PHONE, "profile": {"name": "Arjun"}}],
            "messages": [{"from": PHONE, "id": msg_id, "type": "text", "text": {"body": text}}]}}]}]}

    def test_verify_handshake(self):
        r = self.client.get("/api/whatsapp/webhook/", {"hub.mode": "subscribe", "hub.verify_token": settings.WHATSAPP["VERIFY_TOKEN"], "hub.challenge": "42"})
        self.assertEqual(r.content, b"42")
        r = self.client.get("/api/whatsapp/webhook/", {"hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "42"})
        self.assertEqual(r.status_code, 403)

    def test_bad_signature_rejected(self):
        self.assertEqual(self.post(self.payload(), secret="wrong").status_code, 403)

    def test_message_answered_once(self):
        self.assertEqual(self.post(self.payload()).status_code, 200)
        self.post(self.payload())  # Meta retry with the same id
        self.assertEqual(MessageLog.objects.filter(direction="in").count(), 1)
        self.assertEqual(MessageLog.objects.filter(direction="out", phone=PHONE).count(), 1)
