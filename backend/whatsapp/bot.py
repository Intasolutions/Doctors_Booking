"""WhatsApp conversation engine.

`handle_incoming` is called for every message from the webhook (and from the
admin simulator). Messages from a registered doctor's phone go to DoctorBot;
everyone else is a patient.

Button and list replies carry ids such as "date:2026-11-21" or "cancel:CS-1042".
The same ids are used as payloads on template quick-reply buttons, so a tap on
a reminder sent days ago still lands in the right place.
"""

import logging
import re
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from clinic import services as S
from clinic.geo import by_distance
from clinic.models import Appointment, Doctor, Patient
from clinic.notifications import confirmation_text, patient_buttons, summary_text

from . import client as wa
from .models import Conversation, MessageLog

log = logging.getLogger("careslot")

GREETINGS = {"hi", "hello", "hey", "hai", "helo", "menu", "start", "restart", "hii", "namaste"}


def handle_incoming(phone: str, *, text: str = "", reply_id: str = "", reply_title: str = "",
                    profile_name: str = "", wa_id: str = "", kind: str = "text",
                    location: tuple[float, float] | None = None) -> None:
    conv, _ = Conversation.objects.get_or_create(phone=phone)
    conv.last_inbound_at = timezone.now()
    if profile_name:
        conv.profile_name = profile_name[:120]
    conv.save()
    MessageLog.objects.create(
        direction="in", phone=phone, kind=kind,
        summary=reply_title or text or (f"Shared location {location[0]:.5f}, {location[1]:.5f}" if location else ""),
        payload={"text": text, "reply_id": reply_id, "reply_title": reply_title,
                 **({"location": {"latitude": location[0], "longitude": location[1]}} if location else {})},
        wa_id=wa_id, status="received",
    )
    doctor = Doctor.objects.filter(user__phone=phone, is_active=True).select_related("user").first()
    bot = DoctorBot(conv, doctor) if doctor else PatientBot(conv)
    try:
        if location and isinstance(bot, PatientBot):
            bot.on_location(*location)
        elif location:
            bot.on_text("help")
        elif reply_id:
            bot.on_reply(reply_id)
        else:
            bot.on_text(text or "")
    except S.BookingError as exc:
        wa.send_text(phone, str(exc))
    except Exception:  # noqa: BLE001 - never leave the user without a reply
        log.exception("Bot error for %s", phone)
        wa.send_text(phone, "Sorry, something went wrong on our side. Please send MENU to start again.")
    conv.save(update_fields=["state", "updated_at"])


def split_id(rid: str) -> tuple[str, str]:
    k, _, v = (rid or "").partition(":")
    return k, v


def spread(items: list, n: int) -> list:
    """Pick n items evenly across the list (keeps first and last)."""
    if len(items) <= n:
        return items
    idx = sorted({round(i * (len(items) - 1) / (n - 1)) for i in range(n)})
    return [items[i] for i in idx]


def period(t) -> str:
    return "Morning" if t.hour < 12 else "Afternoon" if t.hour < 16 else "Evening"


# ==========================================================================
# Patient bot
# ==========================================================================

class PatientBot:
    def __init__(self, conv: Conversation):
        self.c = conv
        self.phone = conv.phone
        self.st: dict = conv.state if isinstance(conv.state, dict) else {}
        conv.state = self.st

    # ---------------------------------------------------------------- utils
    def text(self, body):
        wa.send_text(self.phone, body)

    def buttons(self, body, btns, **kw):
        wa.send_buttons(self.phone, body, btns, **kw)

    def doctor(self) -> Doctor | None:
        did = self.st.get("doctor_id")
        return Doctor.objects.filter(pk=did, is_active=True).select_related("user").first() if did else None

    def reset(self, keep_doctor=True):
        did, loc = self.st.get("doctor_id"), self.st.get("loc")
        self.st.clear()
        if keep_doctor and did:
            self.st["doctor_id"] = did
        if loc:
            self.st["loc"] = loc  # remember where the patient is for the next search

    def name(self) -> str:
        p = self.patients()
        if p:
            return p[0].name.split()[0]
        return (self.c.profile_name or "").split()[0] if self.c.profile_name else "there"

    def patients(self) -> list[Patient]:
        seen, out = set(), []
        for p in Patient.objects.filter(Q(account__phone=self.phone) | Q(phone=self.phone)).order_by("id"):
            key = p.name.strip().lower()
            if key not in seen:
                seen.add(key)
                out.append(p)
        return out

    def own(self, code: str) -> Appointment | None:
        return S.appointments_for_phone(self.phone).filter(code__iexact=code).first()

    # --------------------------------------------------------------- inputs
    def on_text(self, raw: str):
        t = raw.strip()
        low = t.lower()
        step = self.st.get("step")

        code = re.sub(r"\s+", "", t).upper()
        doc = Doctor.objects.filter(code=code, is_active=True).select_related("user").first()
        if doc:
            self.reset(keep_doctor=False)
            self.st["doctor_id"] = doc.id
            return self.welcome(doc)
        if low in GREETINGS or low.split(" ")[0] in GREETINGS:
            self.reset()
            return self.menu()
        if step == "ask_name":
            return self.got_name(t)
        if step == "ask_age":
            return self.got_age(t)
        if step == "ask_reason":
            self.st["reason"] = t[:200]
            self.st.pop("step", None)
            return self.summary()
        if re.search(r"cancel|reschedul|my booking|bookings|change", low):
            return self.my_bookings()
        if re.search(r"where|location|address|direction|map", low):
            return self.on_reply("loc:")
        if re.search(r"book|appointment|slot|consult", low):
            return self.on_reply("book")
        if re.search(r"doctor|specialist|near|nearby|close", low):
            return self.on_reply("other")
        return self.buttons(
            "Sorry, I didn't catch that. I can book, change or cancel your appointments.",
            [("book", "Book appointment"), ("mine", "My bookings"), ("other", "Find a doctor")],
        )

    def on_reply(self, rid: str):
        k, v = split_id(rid)
        handler = getattr(self, f"r_{k}", None)
        if not handler:
            return self.on_text(rid)
        return handler(v)

    # -------------------------------------------------------------- screens
    def welcome(self, d: Doctor):
        nxt = S.next_available(d)
        self.buttons(
            f"Welcome to *{d.name}*'s booking line.\n{d.specialty} · {d.experience_years} yrs experience\n"
            f"{d.area}, {d.city} · Fee ₹{d.fee}\nNext free: {nxt['label'] if nxt else 'no slots this week'}\n\n"
            f"What would you like to do?",
            [("book", "Book appointment"), ("mine", "My bookings"), (f"loc:{d.id}", "Clinic location")],
        )

    def menu(self):
        brand = settings.CARESLOT["BRAND"]
        self.buttons(
            f"Hi {self.name()}! I'm the {brand} booking assistant. What would you like to do?",
            [("book", "Book appointment"), ("mine", "My bookings"), ("other", "Find a doctor")],
        )

    def doctor_list(self, intent="doc", specialty="", intro=""):
        qs = Doctor.objects.filter(is_active=True).select_related("user")
        if specialty:
            qs = qs.filter(specialty=specialty)
        point = tuple(self.st["loc"]) if self.st.get("loc") else None
        doctors, km = by_distance(qs, point)
        if not doctors:
            return self.text("No doctors are taking bookings right now. Please try again later.")
        if len(doctors) > 10 and not specialty and not point:
            specs = sorted({d.specialty for d in doctors})[:10]
            return wa.send_list(self.phone, "Which kind of doctor do you need?", "Choose specialty",
                                [{"title": "Specialties", "rows": [{"id": f"spec:{s}", "title": s} for s in specs]}])
        text = intro or ("Which doctor's clinic are you looking for?" if intent == "loc" else "Choose a doctor.")

        def desc(d):
            near = f"{km[d.id]:.1f} km · " if d.id in km else ""
            return f"{near}{d.specialty} · {d.area} · ₹{d.fee}"

        wa.send_list(self.phone, text, "Choose a doctor", [{
            "title": "Nearest first" if point else (specialty or "Doctors"),
            "rows": [{"id": f"{intent}:{d.id}", "title": d.name, "description": desc(d)} for d in doctors[:10]],
        }])

    def find_doctor(self):
        """Ask for the patient's location first; offer the full list as well."""
        if self.st.get("loc"):
            return self.doctor_list(intro="Doctors nearest to the location you shared:")
        wa.send_location_request(self.phone, "Share your location and I'll show the doctors nearest to you.")
        self.doctor_list(intro="Or choose from all our doctors:")

    def on_location(self, lat: float, lng: float):
        keep = {k: self.st[k] for k in ("reschedule",) if k in self.st}
        self.st.clear()
        self.st.update(keep, loc=[round(lat, 5), round(lng, 5)])
        self.doctor_list(intro="Here are the doctors nearest to you. Pick one to see free times.")

    def date_list(self, intro=""):
        d = self.doctor()
        if not d:
            return self.doctor_list()
        rows = []
        for day in S.booking_days():
            f = S.free_slots(d, day)
            if f:
                r = S.rel_date(day)
                rows.append({
                    "id": f"date:{day.isoformat()}",
                    "title": f"{r} · {S.fmt_date(day)}" if r in ("Today", "Tomorrow") else S.fmt_date(day),
                    "description": f"{len(f)} slots free · from {S.fmt_time(f[0])}",
                })
            if len(rows) == 10:
                break
        if not rows:
            return self.buttons(f"{d.name} has no free slots in the next {len(S.booking_days())} days.",
                                [("other", "Other doctors"), ("menu", "Main menu")])
        wa.send_list(self.phone, intro or f"Pick a day for your visit with *{d.name}*.", "Choose a day",
                     [{"title": "Available days", "rows": rows}])

    def time_list(self):
        d = self.doctor()
        day = self.st.get("date")
        if not d or not day:
            return self.date_list()
        day = S.parse_date(day)
        free = spread(S.free_slots(d, day), 10)
        if not free:
            return self.buttons(f"No free slots left on {S.rel_date(day)}.", [("pickday", "Pick another day")])
        sections = {}
        for t in free:
            sections.setdefault(period(t), []).append({"id": f"time:{t:%H:%M}", "title": S.fmt_time(t)})
        wa.send_list(
            self.phone,
            f"*{S.rel_date(day)}, {S.fmt_date(day)}*\nFree times with {d.name}. Each visit is about {d.slot_minutes} minutes.",
            "Choose a time",
            [{"title": k, "rows": v} for k, v in sections.items()],
        )

    def who_for(self):
        people = self.patients()
        if not people:
            self.st["step"] = "ask_name"
            return self.text("Who is the appointment for? Please type the patient's full name.")
        if len(people) <= 2:
            return self.buttons("Who is the appointment for?",
                                [(f"pt:{p.id}", p.name) for p in people] + [("pt:new", "Someone else")])
        wa.send_list(self.phone, "Who is the appointment for?", "Choose patient", [{
            "title": "Patients",
            "rows": [{"id": f"pt:{p.id}", "title": p.name, "description": f"{p.age} yrs" if p.age else ""} for p in people[:9]]
            + [{"id": "pt:new", "title": "Someone else"}],
        }])

    def ask_reason(self):
        self.st["step"] = "ask_reason"
        self.buttons("In a few words, what is the reason for the visit?\nType it below, or tap Skip.", [("skip", "Skip")])

    def summary(self):
        d, p = self.doctor(), Patient.objects.filter(pk=self.st.get("patient_id")).first()
        if not (d and p and self.st.get("date") and self.st.get("time")):
            return self.menu()
        day, t = S.parse_date(self.st["date"]), S.parse_time(self.st["time"])
        self.buttons(
            f"Please check your booking:\n\n*{d.name}*\n{S.when_text(day, t)}\nPatient: {p.name}{', ' + str(p.age) if p.age else ''}\n"
            f"Reason: {self.st.get('reason') or 'Consultation'}\nFee: ₹{d.fee}, pay at the clinic",
            [("confirm", "Confirm booking"), ("change", "Change time")],
            footer="Details are shared only with the doctor",
        )

    def my_bookings(self):
        up = S.upcoming_for_phone(self.phone)
        if not up:
            return self.buttons("You have no upcoming bookings.", [("book", "Book appointment")])
        self.text(f"You have {len(up)} upcoming booking{'s' if len(up) > 1 else ''}:")
        for a in up[:3]:
            self.buttons(
                f"*{a.code}* · {a.doctor.name}\n{S.when_text(a.date, a.start)}\nPatient: {a.patient.name}",
                [(f"resch:{a.code}", "Reschedule"), (f"cancel:{a.code}", "Cancel"), (f"loc:{a.doctor_id}", "Directions")],
            )

    # ------------------------------------------------------------ name/age
    def got_name(self, t: str):
        name = re.sub(r"\s+", " ", t).strip()
        if not (2 <= len(name) <= 60) or not re.search(r"[A-Za-zഀ-ൿऀ-ॿ]", name):
            return self.text("Please type the patient's full name, for example: Meera Arjun")
        self.st["new_name"] = name.title() if name.islower() else name
        self.st["step"] = "ask_age"
        self.text(f"How old is {self.st['new_name'].split()[0]}? Type the age in years.")

    def got_age(self, t: str):
        m = re.search(r"\d{1,3}", t)
        age = int(m.group()) if m else -1
        if not 0 <= age <= 120:
            return self.text("Please type the age as a number, for example: 34")
        existing = self.patients()
        account = S.ensure_patient_account(self.phone, self.st["new_name"] if not existing else "")
        p = Patient.objects.create(account=account, name=self.st.pop("new_name"), age=age, phone=self.phone,
                                   relation="self" if not existing else "family")
        self.st["patient_id"] = p.id
        self.ask_reason()

    # -------------------------------------------------------------- replies
    def r_menu(self, v):
        self.reset()
        self.menu()

    def r_book(self, v):
        self.st.pop("reschedule", None)
        self.date_list() if self.doctor() else self.find_doctor()

    def r_other(self, v):
        self.reset(keep_doctor=False)
        self.find_doctor()

    def r_spec(self, v):
        self.doctor_list(specialty=v)

    def r_doc(self, v):
        d = Doctor.objects.filter(pk=v, is_active=True).first() if v.isdigit() else None
        if not d:
            return self.doctor_list()
        self.reset(keep_doctor=False)
        self.st["doctor_id"] = d.id
        self.date_list(f"*{d.name}*\n{d.specialty} · {d.area} · Fee ₹{d.fee}\n\nPick a day for your visit.")

    def r_rebook(self, v):
        self.reset(keep_doctor=False)
        if v.isdigit():
            self.st["doctor_id"] = int(v)
        self.date_list()

    def r_pickday(self, v):
        self.date_list()

    def r_date(self, v):
        day = S.parse_date(v)
        if day not in S.booking_days():
            return self.date_list("That day is no longer available. Pick another day:")
        self.st["date"] = day.isoformat()
        self.st.pop("time", None)
        self.time_list()

    def r_time(self, v):
        if not self.st.get("date"):
            return self.date_list()
        t = S.parse_time(v)
        self.st["time"] = t.strftime("%H:%M")
        if self.st.get("reschedule"):
            return self.buttons(
                f"Move booking *{self.st['reschedule']}* to *{S.when_text(S.parse_date(self.st['date']), t)}*?",
                [("rconfirm", "Yes, move it"), ("change", "Pick another time")],
            )
        if self.st.get("patient_id"):
            return self.summary()
        self.who_for()

    def r_change(self, v):
        self.time_list()

    def r_pt(self, v):
        if v == "new":
            self.st["step"] = "ask_name"
            return self.text("Please type the patient's full name.")
        p = next((x for x in self.patients() if str(x.id) == v), None)
        if not p:
            return self.who_for()
        self.st["patient_id"] = p.id
        self.ask_reason()

    def r_skip(self, v):
        self.st.pop("step", None)
        self.st["reason"] = ""
        self.summary()

    def r_confirm(self, v):
        d, p = self.doctor(), Patient.objects.filter(pk=self.st.get("patient_id")).first()
        if not (d and p and self.st.get("date") and self.st.get("time")):
            return self.buttons("That booking is already done or has expired.", [("book", "Book again"), ("mine", "My bookings")])
        try:
            a = S.book(doctor=d, patient=p, day=self.st["date"], start=self.st["time"],
                       source=Appointment.Source.WHATSAPP, reason=self.st.get("reason", ""))
        except S.BookingError as exc:
            self.st.pop("time", None)
            self.text(str(exc))
            return self.time_list()
        if not p.consent_at:
            p.consent_at = timezone.now()
            p.save(update_fields=["consent_at"])
        if not p.account_id:
            p.account = S.ensure_patient_account(self.phone, p.name)
            p.save(update_fields=["account"])
        self.reset()
        self.buttons(confirmation_text(a), patient_buttons(a))

    def r_mine(self, v):
        self.my_bookings()

    def r_cancel(self, v):
        a = self.own(v)
        if not a or not a.is_active:
            return self.text("That booking is already cancelled.")
        if a.status != Appointment.Status.CONFIRMED:
            return self.text("That visit is already closed.")
        self.buttons(f"Cancel *{a.code}* with {a.doctor.name} on {S.when_text(a.date, a.start)}?",
                     [(f"cyes:{a.code}", "Yes, cancel"), ("keep", "Keep booking")])

    def r_cyes(self, v):
        a = self.own(v)
        if not a or not a.is_active:
            return self.text("That booking is already cancelled.")
        S.cancel(a, by="patient", source=Appointment.Source.WHATSAPP)
        self.buttons(f"Cancelled. {a.doctor.name} has been told and the slot is open for others.",
                     [(f"rebook:{a.doctor_id}", "Book again"), ("menu", "Main menu")])

    def r_keep(self, v):
        self.text("Okay, your booking stays as it is.")

    def r_resch(self, v):
        a = self.own(v)
        if not a or a.status != Appointment.Status.CONFIRMED:
            return self.buttons("That booking can't be moved any more.", [("book", "New booking")])
        self.reset(keep_doctor=False)
        self.st.update(doctor_id=a.doctor_id, reschedule=a.code)
        self.date_list(f"Let's move *{a.code}*. Pick a new day:")

    def r_rconfirm(self, v):
        a = self.own(self.st.get("reschedule", ""))
        if not a or not self.st.get("date") or not self.st.get("time"):
            return self.buttons("That change has expired.", [("mine", "My bookings")])
        try:
            S.reschedule(a, self.st["date"], self.st["time"], source=Appointment.Source.WHATSAPP)
        except S.BookingError as exc:
            self.st.pop("time", None)
            self.text(str(exc))
            return self.time_list()
        self.reset()
        self.buttons(confirmation_text(a, rescheduled=True), patient_buttons(a))

    def r_loc(self, v):
        d = Doctor.objects.filter(pk=v).first() if v.isdigit() else self.doctor()
        if not d:
            return self.doctor_list(intent="loc")
        wa.send_link(self.phone, f"*{d.name}'s clinic*\n{d.address}", "Open in Maps", d.directions_url)

    def r_remok(self, v):
        a = self.own(v)
        if a and a.status == Appointment.Status.CONFIRMED:
            a.patient_confirmed = True
            a.save(update_fields=["patient_confirmed"])
        self.text("Thank you! See you then. Please arrive 5 minutes early and bring any old prescriptions.")

    def r_cmd(self, v):
        self.menu()


# ==========================================================================
# Doctor bot
# ==========================================================================

MARK = {"completed": " ✓", "no_show": " (no-show)", "checked_in": " (waiting)"}

HELP = (
    "Commands you can send:\n"
    "*today* · today's patients\n"
    "*tomorrow* · tomorrow's list\n"
    "*next* · who is next\n"
    "*block 6pm-7pm* · block time today (add 'tomorrow' for tomorrow)\n"
    "*leave tomorrow* or *leave 25 nov* · take a day off\n"
    "*done CS-1042* · mark a visit as seen\n"
    "*cancel CS-1042* · cancel a booking (patient is told)"
)

BLOCK_RE = re.compile(
    r"^block\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:\s+(today|tomorrow))?"
)
LEAVE_RE = re.compile(r"^leave\s+(today|tomorrow|(\d{1,2})\s*([a-z]{3})[a-z]*)")
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def parse_clock(h, m, ap) -> str:
    h, m = int(h), int(m or 0)
    if ap == "pm" and h < 12:
        h += 12
    elif ap == "am" and h == 12:
        h = 0
    elif not ap and h <= 8:
        h += 12  # "block 6-7" in a clinic almost always means evening
    return f"{min(h, 23):02d}:{m:02d}"


class DoctorBot:
    def __init__(self, conv: Conversation, doctor: Doctor):
        self.c, self.d, self.phone = conv, doctor, conv.phone

    def say(self, body):
        wa.send_text(self.phone, body)

    def on_reply(self, rid):
        k, v = split_id(rid)
        self.on_text(v if k == "cmd" else rid)

    def day_list(self, day):
        if S.is_on_leave(self.d, day):
            return self.say(f"You are on leave on {S.fmt_date(day)}. No bookings are taken.")
        appts = list(Appointment.objects.filter(doctor=self.d, date=day).exclude(status="cancelled")
                     .select_related("patient").order_by("start"))
        if not appts:
            return self.say(f"*{S.rel_date(day)} · {S.fmt_date(day)}*\nNo appointments yet.")
        lines = [f"{S.fmt_time(a.start)} · {a.patient.name}{' (' + str(a.patient.age) + ')' if a.patient.age else ''}"
                 f" · {a.reason or 'Consultation'}{MARK.get(a.status, '')}" for a in appts]
        self.say(f"*{S.rel_date(day)} · {S.fmt_date(day)}* · {len(appts)} patients\n\n" + "\n".join(lines))

    def on_text(self, raw: str):
        t = raw.strip().lower()
        today = S.today()
        if t.startswith("today") or t == "list":
            return self.day_list(today)
        if t.startswith("tomorrow"):
            return self.day_list(today + timedelta(days=1))
        if t in ("summary", "good morning"):
            return self.say(summary_text(self.d))
        if t.startswith("next"):
            now_m = S.to_minutes(S.now().time())
            n = next((a for a in Appointment.objects.filter(doctor=self.d, date=today, status__in=["confirmed", "checked_in"])
                      .select_related("patient").order_by("start") if S.to_minutes(a.start) >= now_m - 20), None)
            if not n:
                return self.say("No more patients today.")
            return self.say(f"Next: *{S.fmt_time(n.start)}* · {n.patient.name}{' (' + str(n.patient.age) + ')' if n.patient.age else ''}\n"
                            f"Reason: {n.reason or 'Consultation'}\nBooking {n.code} via {n.get_source_display()}"
                            + ("\nPatient confirmed they are coming" if n.patient_confirmed else ""))
        m = BLOCK_RE.match(t)
        if m:
            day = today + timedelta(days=1) if m.group(7) == "tomorrow" else today
            start = parse_clock(m.group(1), m.group(2), m.group(3) or m.group(6))
            end = parse_clock(m.group(4), m.group(5), m.group(6) or m.group(3))
            block, hit = S.add_block(self.d, day, start, end, reason="Blocked on WhatsApp")
            return self.say(f"Done. Blocked *{S.fmt_time(block.start)} – {S.fmt_time(block.end)}* {S.rel_date(day).lower()}.\n"
                            + (f"{len(hit)} patient{'s were' if len(hit) > 1 else ' was'} told on WhatsApp and offered new slots."
                               if hit else "No patients were booked in that time."))
        m = LEAVE_RE.match(t)
        if m:
            if m.group(1) in ("today", "tomorrow"):
                day = today + timedelta(days=0 if m.group(1) == "today" else 1)
            else:
                mon = m.group(3)[:3]
                if mon not in MONTHS:
                    return self.say("I couldn't read that date. Example: leave 25 nov")
                year = today.year
                try:
                    day = today.replace(year=year, month=MONTHS.index(mon) + 1, day=int(m.group(2)))
                    if day < today:
                        day = day.replace(year=year + 1)
                except ValueError:
                    return self.say("That date doesn't exist. Example: leave 25 nov")
            _, hit = S.add_leave(self.d, day, reason="Leave set on WhatsApp")
            return self.say(f"Leave marked for *{S.fmt_date(day)}*. Booking is closed for that day.\n"
                            + (f"{len(hit)} patient{'s were' if len(hit) > 1 else ' was'} told on WhatsApp and offered new slots."
                               if hit else "No patients were booked that day."))
        m = re.match(r"^(done|seen|cancel)\s+(cs-?\d+)", t)
        if m:
            code = "CS-" + re.sub(r"\D", "", m.group(2))
            a = Appointment.objects.filter(doctor=self.d, code=code).select_related("patient").first()
            if not a:
                return self.say(f"I couldn't find {code} in your bookings.")
            if m.group(1) == "cancel":
                S.cancel(a, by="doctor", reason="Cancelled by doctor")
                return self.say(f"Cancelled *{a.code}* ({a.patient.name}). The patient has been told.")
            S.set_status(a, Appointment.Status.COMPLETED)
            return self.say(f"Marked *{a.code}* ({a.patient.name}) as seen.")
        known = t.split(" ")[0] in GREETINGS or t in ("help", "commands")
        self.say(("" if known else "I didn't understand that.\n\n") + HELP)
