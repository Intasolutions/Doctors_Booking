import random
from datetime import time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from clinic import services as S
from clinic.models import Appointment, Doctor, Patient, Session

DOCTORS = [
    # first, last, phone, specialty, qualifications, years, area, address, fee, slot, {weekday: [(start, end)]}
    ("Anitha", "Menon", "919800000001", "General Physician", "MBBS, MD (General Medicine)", 14, "Kadavanthra",
     "Sreevalsam, Janatha Road, Kadavanthra, Kochi", 400, 15, {d: [("07:00", "09:00"), ("17:00", "20:00")] for d in range(6)},
     "Family physician for fevers, BP and diabetes reviews and general check-ups.", "Malayalam, English, Hindi"),
    ("Rahul", "Nair", "919800000002", "Pediatrician", "MBBS, DCH", 9, "Edappally",
     "Rose Villa, North Janatha Road, Edappally, Kochi", 500, 20, {**{d: [("17:30", "20:30")] for d in range(6)}, 6: [("10:00", "12:00")]},
     "Child specialist for fevers, vaccinations, growth checks and newborn care.", "Malayalam, English"),
    ("Fathima", "Rasheed", "919800000003", "Dermatologist", "MBBS, MD (DVL)", 11, "Kakkanad",
     "Noor Manzil, Seaport-Airport Road, Kakkanad, Kochi", 600, 20, {0: [("16:00", "19:00")], 2: [("16:00", "19:00")], 4: [("16:00", "19:00")], 5: [("10:00", "13:00")]},
     "Skin, hair and nail problems, including acne, pigmentation and hair fall.", "Malayalam, English, Arabic"),
    ("Joseph", "Varghese", "919800000004", "Orthopaedic Surgeon", "MBBS, MS (Ortho)", 22, "Vyttila",
     "Kallarackal House, Thykoodam Road, Vyttila, Kochi", 700, 15, {**{d: [("18:00", "21:00")] for d in range(5)}, 5: [("09:00", "12:00")]},
     "Joint and back pain, sports injuries and fracture follow-ups.", "Malayalam, English, Tamil"),
]

# Approximate locality centres in Kochi, so "doctors near me" works with sample data.
COORDS = {
    "Kadavanthra": (9.9667, 76.2985),
    "Edappally": (10.0261, 76.3086),
    "Kakkanad": (10.0159, 76.3419),
    "Vyttila": (9.9688, 76.3209),
}

NAMES = ["Anjali Thomas", "Rohan Das", "Fathima Beevi", "Sreekumar P", "Neha Joseph", "Abdul Rahman", "Lakshmi Iyer",
         "Vishnu Prasad", "Mariya George", "Kiran Kumar", "Divya Menon", "Shabeer Ali", "Gopika R", "Thomas Mathew"]
REASONS = ["Fever", "Follow-up", "Cough and cold", "Body pain", "BP review", "Check-up"]


class Command(BaseCommand):
    help = "Create an admin, sample doctors with hours, and sample bookings for local testing."

    def add_arguments(self, parser):
        parser.add_argument("--password", default="careslot123", help="Password for the admin and doctor logins")
        parser.add_argument("--no-bookings", action="store_true")

    @transaction.atomic
    def handle(self, *args, password, no_bookings, **opts):
        from whatsapp.client import console_mode

        if not console_mode():
            raise CommandError("WhatsApp is live (WHATSAPP_TOKEN is set). The sample doctors have placeholder "
                               "phone numbers, so seed only a local or staging database in console mode.")
        if not User.objects.filter(username="admin").exists():
            User.objects.create_superuser("admin", "", password, first_name="Clinic", last_name="Admin")
            self.stdout.write("Created admin login: admin")
        created = []
        for (first, last, phone, spec, qual, yrs, area, addr, fee, slot, hours, about, langs) in DOCTORS:
            user, new = User.objects.get_or_create(
                username=f"dr.{first.lower()}", defaults={"first_name": first, "last_name": last, "phone": phone, "role": "doctor"})
            if new:
                user.set_password(password)
                user.save()
            doc, dnew = Doctor.objects.get_or_create(user=user, defaults=dict(
                specialty=spec, qualifications=qual, experience_years=yrs, area=area, address=addr, fee=fee,
                slot_minutes=slot, about=about, languages=langs))
            if doc.latitude is None and area in COORDS:
                doc.latitude, doc.longitude = COORDS[area]
                doc.save(update_fields=["latitude", "longitude"])
            if dnew:
                for wd, spans in hours.items():
                    for a, b in spans:
                        Session.objects.create(doctor=doc, weekday=wd, start=S.parse_time(a), end=S.parse_time(b))
                created.append(doc)
        self.stdout.write(f"Doctors: {', '.join(f'{d.name} ({d.code})' for d in Doctor.objects.all())}")

        if no_bookings or not created:
            return
        rnd = random.Random(42)
        made = 0
        for d in created:
            for i, day in enumerate(S.booking_days(5)):
                for t in S.free_slots(d, day):
                    if rnd.random() < [0.5, 0.35, 0.25, 0.2, 0.15][i]:
                        # No phone: sample patients must never receive real messages.
                        p = Patient.objects.create(name=rnd.choice(NAMES), age=rnd.randint(4, 75))
                        S.book(doctor=d, patient=p, day=day, start=t, notify=False,
                               source=rnd.choice(["whatsapp", "whatsapp", "app", "web"]), reason=rnd.choice(REASONS))
                        made += 1
        self.stdout.write(self.style.SUCCESS(f"Created {made} sample bookings. Doctor logins: dr.anitha, dr.rahul… "
                                             f"Password: {password}"))
