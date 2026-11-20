"""Outgoing WhatsApp notifications for booking events.

Inside the 24-hour customer-service window we send interactive messages with
buttons; outside it we must use an approved template (see whatsapp/templates.py).
"""

import logging

from django.utils import timezone

from whatsapp import client as wa
from whatsapp.models import Conversation

from .models import Appointment, Doctor
from .services import day_summary, fmt_time, rel_date, today, when_text

log = logging.getLogger("careslot")


def window_open(phone: str) -> bool:
    c = Conversation.objects.filter(phone=phone).first()
    return bool(c and c.window_open)


def first_name(name: str) -> str:
    return (name or "").split()[0] if (name or "").strip() else "there"


def _safe(fn):
    """Notifications must never break a booking: log and carry on."""

    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except Exception:  # noqa: BLE001
            log.exception("Notification %s failed", fn.__name__)

    wrapper.__name__ = fn.__name__
    return wrapper


# ---------------------------------------------------------------- texts

def confirmation_text(a: Appointment, rescheduled=False) -> str:
    d = a.doctor
    return (
        f"{'Booking moved' if rescheduled else 'Booking confirmed'} ✅\n\n"
        f"*{d.name}* · {d.specialty}\n"
        f"*{when_text(a.date, a.start)}*\n"
        f"Patient: {a.patient.name}\n"
        f"Booking ID: {a.code}\n"
        f"Fee: ₹{a.fee} (pay at the clinic)\n"
        f"Address: {d.address}\n\n"
        f"Please arrive 5 minutes early."
    )


def patient_buttons(a: Appointment):
    return [(f"loc:{a.doctor_id}", "Directions"), (f"resch:{a.code}", "Reschedule"), (f"cancel:{a.code}", "Cancel")]


# ---------------------------------------------------------------- patient

@_safe
def patient_confirmation(a: Appointment, rescheduled=False):
    phone = a.patient.phone
    if not phone:
        return
    if window_open(phone):
        wa.send_buttons(phone, confirmation_text(a, rescheduled), patient_buttons(a))
        return
    d = a.doctor
    if rescheduled:
        wa.send_template(phone, "appointment_rescheduled",
                         [first_name(a.patient.name), a.code, d.name, when_text(a.date, a.start), d.address],
                         button_payloads=[f"resch:{a.code}", f"cancel:{a.code}"],
                         summary=confirmation_text(a, True))
    else:
        wa.send_template(phone, "appointment_confirmed",
                         [first_name(a.patient.name), d.name, when_text(a.date, a.start), a.code, d.address],
                         button_payloads=[f"resch:{a.code}", f"cancel:{a.code}"],
                         summary=confirmation_text(a))


@_safe
def patient_cancelled(a: Appointment):
    phone = a.patient.phone
    if not phone:
        return
    d = a.doctor
    if a.cancelled_by in ("doctor", "admin"):
        text = (f"Sorry {first_name(a.patient.name)}, *{d.name}* is not available on {when_text(a.date, a.start)}. "
                f"Your booking {a.code} has been cancelled and no fee applies.\n\nTap below to pick a new time.")
        if window_open(phone):
            wa.send_buttons(phone, text, [(f"rebook:{d.id}", "Pick a new time")])
        else:
            wa.send_template(phone, "doctor_unavailable",
                             [first_name(a.patient.name), d.name, when_text(a.date, a.start), a.code],
                             button_payloads=[f"rebook:{d.id}"], summary=text)
    else:
        text = f"Your appointment {a.code} with {d.name} on {when_text(a.date, a.start)} has been cancelled."
        if window_open(phone):
            wa.send_buttons(phone, text, [(f"rebook:{d.id}", "Book again"), ("menu", "Main menu")])
        else:
            wa.send_template(phone, "appointment_cancelled", [a.code, d.name, when_text(a.date, a.start)],
                             button_payloads=[f"rebook:{d.id}"], summary=text)


@_safe
def reminder(a: Appointment):
    phone = a.patient.phone
    if not phone:
        return
    d = a.doctor
    text = (f"Reminder: {first_name(a.patient.name)}, you have an appointment with *{d.name}* on "
            f"*{when_text(a.date, a.start)}*.\n\nBooking ID: {a.code}\nAddress: {d.address}\n\nWill you be coming?")
    payloads = [f"remok:{a.code}", f"resch:{a.code}", f"cancel:{a.code}"]
    if window_open(phone):
        wa.send_buttons(phone, text, list(zip(payloads, ["Yes, I will come", "Reschedule", "Cancel"])))
    else:
        wa.send_template(phone, "appointment_reminder",
                         [first_name(a.patient.name), d.name, when_text(a.date, a.start), a.code, d.address],
                         button_payloads=payloads, summary=text)
    a.reminder_sent_at = timezone.now()
    a.save(update_fields=["reminder_sent_at"])


@_safe
def send_otp(phone: str, code: str):
    wa.send_template(phone, "login_otp", [code], url_button_param=code,
                     summary=f"{code} is your verification code. Do not share it.")


# ---------------------------------------------------------------- doctor

def _doctor_phone(d: Doctor) -> str:
    return d.user.phone if d.notify_whatsapp and d.user.phone else ""


@_safe
def doctor_new_booking(a: Appointment):
    phone = _doctor_phone(a.doctor)
    if not phone or a.source == Appointment.Source.WALKIN:
        return
    who = f"{a.patient.name}{', ' + str(a.patient.age) if a.patient.age else ''}"
    params = [a.code, who, when_text(a.date, a.start), a.reason or "Consultation", a.get_source_display()]
    text = f"*New booking* {a.code}\n{who} · {when_text(a.date, a.start)}\nReason: {params[3]}\nBooked via {params[4]}"
    if window_open(phone):
        wa.send_text(phone, text)
    else:
        wa.send_template(phone, "doctor_new_booking", params, summary=text)


@_safe
def doctor_booking_changed(a: Appointment, change: str):
    phone = _doctor_phone(a.doctor)
    if not phone:
        return
    text = f"Booking {a.code} ({a.patient.name}) {change}."
    if window_open(phone):
        wa.send_text(phone, text)
    else:
        wa.send_template(phone, "doctor_booking_changed", [a.code, a.patient.name, change], summary=text)


def summary_text(d: Doctor) -> str:
    s = day_summary(d, today())
    first = (Appointment.objects.filter(doctor=d, date=today(), status=Appointment.Status.CONFIRMED)
             .select_related("patient").order_by("start").first())
    line = f"First: {fmt_time(first.start)} · {first.patient.name}." if first else "No bookings yet."
    if s["on_leave"]:
        line = "You are marked on leave today."
    return f"Good morning {d.name}. Today you have {s['booked']} appointments. {line}\n\nReply TODAY for the full list."


@_safe
def doctor_daily_summary(d: Doctor):
    phone = _doctor_phone(d)
    if not phone:
        return
    s = day_summary(d, today())
    text = summary_text(d)
    if window_open(phone):
        wa.send_buttons(phone, text, [("cmd:today", "Today's list"), ("cmd:tomorrow", "Tomorrow"), ("cmd:help", "Commands")])
    else:
        first_line = text.split(". ", 2)[-1].split("\n")[0]
        wa.send_template(phone, "doctor_daily_summary", [d.name, str(s["booked"]), first_line], summary=text)


# ---------------------------------------------------------------- events

def appointment_booked(a: Appointment):
    # WhatsApp bookings get their confirmation from the bot conversation itself.
    if a.source != Appointment.Source.WHATSAPP:
        patient_confirmation(a)
    doctor_new_booking(a)


def appointment_rescheduled(a: Appointment, source: str = ""):
    if source != Appointment.Source.WHATSAPP:
        patient_confirmation(a, rescheduled=True)
    doctor_booking_changed(a, f"was moved to {rel_date(a.date)}, {fmt_time(a.start)}")


def appointment_cancelled(a: Appointment, source: str = ""):
    if a.cancelled_by == "patient":
        doctor_booking_changed(a, f"was cancelled by the patient. The {fmt_time(a.start)} slot on {rel_date(a.date)} is open again")
        if source != Appointment.Source.WHATSAPP:
            patient_cancelled(a)
    else:
        patient_cancelled(a)
