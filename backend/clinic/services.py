"""Scheduling and booking rules. Every channel (website, app, WhatsApp, doctor
portal) goes through these functions, so the rules and notifications are the
same everywhere."""

import logging
from dataclasses import dataclass
from datetime import date as Date, datetime, time as Time, timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Appointment, Doctor, Leave, Patient, TimeBlock

log = logging.getLogger("careslot")

A = Appointment


class BookingError(Exception):
    """A booking rule was broken. The message is safe to show to users."""


# --------------------------------------------------------------------------
# time helpers
# --------------------------------------------------------------------------

def now():
    return timezone.localtime()


def today() -> Date:
    return now().date()


def booking_days(count: int | None = None) -> list[Date]:
    count = count or settings.CARESLOT["BOOKING_WINDOW_DAYS"]
    t = today()
    return [t + timedelta(days=i) for i in range(count)]


def to_minutes(t: Time) -> int:
    return t.hour * 60 + t.minute


def from_minutes(m: int) -> Time:
    return Time(m // 60, m % 60)


def parse_time(value) -> Time:
    if isinstance(value, Time):
        return value.replace(second=0, microsecond=0)
    try:
        h, m = str(value).strip()[:5].split(":")
        return Time(int(h), int(m))
    except (ValueError, TypeError):
        raise BookingError("Time must look like 17:30.")


def parse_date(value) -> Date:
    if isinstance(value, Date):
        return value
    try:
        return Date.fromisoformat(str(value))
    except ValueError:
        raise BookingError("Date must look like 2026-11-21.")


def fmt_time(t: Time) -> str:
    h = t.hour % 12 or 12
    return f"{h}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"


def fmt_date(d: Date) -> str:
    """All dates shown to people are dd/mm/yyyy."""
    return d.strftime("%d/%m/%Y")


def rel_date(d: Date) -> str:
    t = today()
    if d == t:
        return "Today"
    if d == t + timedelta(days=1):
        return "Tomorrow"
    return fmt_date(d)


def day_label(d: Date) -> str:
    """'Today (21/11/2026)', 'Tomorrow (22/11/2026)' or 'Mon 23/11/2026'."""
    r = rel_date(d)
    return f"{r} ({fmt_date(d)})" if r in ("Today", "Tomorrow") else f"{d:%a} {fmt_date(d)}"


def when_text(d: Date, t: Time) -> str:
    """'Tomorrow (22/11/2026), 5:30 PM' or 'Mon 23/11/2026, 5:30 PM'."""
    return f"{day_label(d)}, {fmt_time(t)}"


# --------------------------------------------------------------------------
# slot engine
# --------------------------------------------------------------------------

def grid_times(spans, step: int) -> list[Time]:
    """Start times of every slot of `step` minutes inside the (start, end) spans."""
    if not step or step < 1:
        # Guard: a zero slot length would loop forever and hang every page.
        log.error("Slot length %r is invalid; no slots generated", step)
        return []
    out = []
    for start, end in spans:
        m, stop = to_minutes(start), to_minutes(end)
        while m + step <= stop:
            out.append(from_minutes(m))
            m += step
    return sorted(set(out))


def slot_times(doctor: Doctor, day: Date) -> list[Time]:
    return grid_times([(s.start, s.end) for s in doctor.sessions.filter(weekday=day.weekday())], doctor.slot_minutes)


def schedule_conflicts(doctor: Doctor, sessions: list[dict] | None = None, slot_minutes: int | None = None) -> list[Appointment]:
    """Upcoming confirmed bookings that would fall outside the slots of a new
    schedule (new hours and/or a new time per patient). Either argument left
    as None keeps the doctor's current value."""
    step = slot_minutes or doctor.slot_minutes
    if sessions is None:
        spans = {}
        for s in doctor.sessions.all():
            spans.setdefault(s.weekday, []).append((s.start, s.end))
    else:
        spans = {}
        for s in sessions:
            spans.setdefault(s["weekday"], []).append((parse_time(s["start"]), parse_time(s["end"])))
    n = now()
    grid = {wd: set(grid_times(spans.get(wd, []), step)) for wd in range(7)}
    upcoming = (Appointment.objects.filter(doctor=doctor, status=A.Status.CONFIRMED, date__gte=n.date())
                .select_related("patient", "doctor__user").order_by("date", "start"))
    return [a for a in upcoming
            if (a.date > n.date() or a.start >= n.time().replace(second=0, microsecond=0))
            and a.start not in grid[a.date.weekday()]]


def cancel_for_schedule_change(affected: list[Appointment]) -> list[Appointment]:
    for a in affected:
        cancel(a, by="doctor", reason="The doctor's consultation hours changed")
    return affected


def is_on_leave(doctor: Doctor, day: Date) -> bool:
    return Leave.objects.filter(doctor=doctor, date=day).exists()


@dataclass
class Slot:
    time: Time
    status: str  # free | booked | blocked | past

    def as_dict(self):
        return {"time": self.time.strftime("%H:%M"), "label": fmt_time(self.time), "status": self.status}


def day_slots(doctor: Doctor, day: Date) -> list[Slot]:
    if is_on_leave(doctor, day):
        return []
    times = slot_times(doctor, day)
    if not times:
        return []
    booked = set(
        Appointment.objects.filter(doctor=doctor, date=day)
        .exclude(status=A.Status.CANCELLED)
        .values_list("start", flat=True)
    )
    blocks = [(to_minutes(b.start), to_minutes(b.end)) for b in TimeBlock.objects.filter(doctor=doctor, date=day)]
    cutoff = None
    if day == today():
        cutoff = to_minutes(now().time()) + settings.CARESLOT["MIN_LEAD_MINUTES"]
    out = []
    for t in times:
        m = to_minutes(t)
        if day < today() or (cutoff is not None and m < cutoff):
            st = "past"
        elif any(a <= m < b for a, b in blocks):
            st = "blocked"
        elif t in booked:
            st = "booked"
        else:
            st = "free"
        out.append(Slot(t, st))
    return out


def free_slots(doctor: Doctor, day: Date) -> list[Time]:
    return [s.time for s in day_slots(doctor, day) if s.status == "free"]


def day_overview(doctor: Doctor, days: list[Date] | None = None) -> list[dict]:
    out = []
    for d in days or booking_days():
        leave = is_on_leave(doctor, d)
        has_hours = bool(slot_times(doctor, d))
        free = [] if leave else free_slots(doctor, d)
        out.append({
            "date": d.isoformat(),
            "label": rel_date(d),
            "short": fmt_date(d),
            "weekday": d.strftime("%a"),
            "on_leave": leave,
            "closed": not has_hours,
            "free": len(free),
            "first_free": free[0].strftime("%H:%M") if free else None,
        })
    return out


def next_slots(doctor: Doctor, count: int = 4) -> dict | None:
    """The first day with free times and its first few times, for one-click booking."""
    for d in booking_days():
        f = free_slots(doctor, d)
        if f:
            return {"date": d.isoformat(), "label": day_label(d),
                    "times": [{"time": t.strftime("%H:%M"), "label": fmt_time(t)} for t in f[:count]]}
    return None


def next_available(doctor: Doctor) -> dict | None:
    for d in booking_days():
        f = free_slots(doctor, d)
        if f:
            return {"date": d.isoformat(), "time": f[0].strftime("%H:%M"), "label": when_text(d, f[0])}
    return None


# --------------------------------------------------------------------------
# booking operations
# --------------------------------------------------------------------------

def _check_bookable(doctor: Doctor, day: Date, start: Time, *, allow_past=False, ignore: Appointment | None = None):
    if not doctor.is_active:
        raise BookingError("This doctor is not taking bookings right now.")
    window = booking_days()
    if not allow_past and (day < window[0] or day > window[-1]):
        raise BookingError(f"You can book up to {len(window)} days ahead.")
    if is_on_leave(doctor, day):
        raise BookingError(f"{doctor.name} is on leave on {fmt_date(day)}.")
    if start not in slot_times(doctor, day):
        raise BookingError(f"{fmt_time(start)} is not one of {doctor.name}'s consultation times.")
    slot = next((s for s in day_slots(doctor, day) if s.time == start), None)
    status = slot.status if slot else "free"
    if status == "past" and not allow_past:
        raise BookingError("That time has already passed. Please pick a later slot.")
    if status == "blocked":
        raise BookingError("The doctor is not available at that time.")
    if status == "booked":
        taken = Appointment.objects.filter(doctor=doctor, date=day, start=start).exclude(status=A.Status.CANCELLED)
        if ignore is None or taken.exclude(pk=ignore.pk).exists():
            raise BookingError("Sorry, that slot was just booked by someone else. Please pick another time.")


def check_reopen(appt: Appointment):
    """A cancelled visit can come back only if its time is still bookable: the
    doctor takes bookings, works then, isn't on leave or blocked, and nobody
    else has the slot. Past dates are allowed (closing an old visit)."""
    _check_bookable(appt.doctor, appt.date, appt.start, allow_past=True, ignore=appt)


def book(*, doctor: Doctor, patient: Patient, day, start, source: str, reason: str = "", notify=True) -> Appointment:
    day, start = parse_date(day), parse_time(start)
    staff_entry = source in (A.Source.WALKIN, A.Source.ADMIN)
    _check_bookable(doctor, day, start, allow_past=staff_entry)
    try:
        with transaction.atomic():
            appt = Appointment.objects.create(
                doctor=doctor, patient=patient, date=day, start=start, source=source,
                reason=(reason or "").strip()[:200], fee=doctor.fee,
            )
    except IntegrityError:
        raise BookingError("Sorry, that slot was just booked by someone else. Please pick another time.")
    log.info("Booked %s via %s", appt, source)
    if notify:
        from . import notifications
        notifications.appointment_booked(appt)
    return appt


def reschedule(appt: Appointment, day, start, *, source: str) -> Appointment:
    if not appt.is_active or appt.status != A.Status.CONFIRMED:
        raise BookingError("Only upcoming confirmed bookings can be moved.")
    day, start = parse_date(day), parse_time(start)
    _check_bookable(appt.doctor, day, start, ignore=appt)
    old = (appt.date, appt.start)
    appt.date, appt.start = day, start
    appt.reminder_sent_at = None
    appt.patient_confirmed = False
    try:
        with transaction.atomic():
            appt.save()
    except IntegrityError:
        appt.date, appt.start = old
        raise BookingError("Sorry, that slot was just booked by someone else. Please pick another time.")
    from . import notifications
    notifications.appointment_rescheduled(appt, source=source)
    return appt


def cancel(appt: Appointment, *, by: str, reason: str = "", source: str = "", notify=True) -> Appointment:
    """by: 'patient' | 'doctor' | 'admin'."""
    if not appt.is_active:
        raise BookingError("This booking is already cancelled.")
    if appt.status in (A.Status.COMPLETED, A.Status.NO_SHOW):
        raise BookingError("This visit is already closed.")
    appt.status = A.Status.CANCELLED
    appt.cancelled_by = by
    appt.cancel_reason = reason[:200]
    appt.save(update_fields=["status", "cancelled_by", "cancel_reason", "updated_at"])
    if notify:
        from . import notifications
        notifications.appointment_cancelled(appt, source=source)
    return appt


def set_status(appt: Appointment, status: str) -> Appointment:
    allowed = {
        A.Status.CONFIRMED: {A.Status.CHECKED_IN, A.Status.NO_SHOW, A.Status.COMPLETED},
        A.Status.CHECKED_IN: {A.Status.COMPLETED, A.Status.CONFIRMED, A.Status.NO_SHOW},
        A.Status.NO_SHOW: {A.Status.CONFIRMED},
        A.Status.COMPLETED: {A.Status.CHECKED_IN},
    }
    if status not in allowed.get(appt.status, set()):
        raise BookingError(f"Cannot change a {appt.get_status_display().lower()} visit to {status}.")
    appt.status = status
    appt.save(update_fields=["status", "updated_at"])
    return appt


def _cancel_for_doctor(qs, reason: str) -> list[Appointment]:
    affected = list(qs.filter(status=A.Status.CONFIRMED).select_related("patient", "doctor__user"))
    for a in affected:
        cancel(a, by="doctor", reason=reason)
    return affected


def add_block(doctor: Doctor, day, start, end, reason: str = "") -> tuple[TimeBlock, list[Appointment]]:
    day, start, end = parse_date(day), parse_time(start), parse_time(end)
    if end <= start:
        raise BookingError("The end time must be after the start time.")
    if day < today():
        raise BookingError("You cannot block time in the past.")
    block = TimeBlock.objects.create(doctor=doctor, date=day, start=start, end=end, reason=reason[:120])
    affected = _cancel_for_doctor(
        Appointment.objects.filter(doctor=doctor, date=day, start__gte=start, start__lt=end),
        reason or "Doctor unavailable",
    )
    return block, affected


def add_leave(doctor: Doctor, day, reason: str = "") -> tuple[Leave, list[Appointment]]:
    day = parse_date(day)
    if day < today():
        raise BookingError("You cannot add leave in the past.")
    if Leave.objects.filter(doctor=doctor, date=day).exists():
        raise BookingError(f"You are already on leave on {fmt_date(day)}.")
    leave = Leave.objects.create(doctor=doctor, date=day, reason=reason[:120])
    affected = _cancel_for_doctor(Appointment.objects.filter(doctor=doctor, date=day), reason or "Doctor on leave")
    return leave, affected


def day_summary(doctor: Doctor, day: Date) -> dict:
    qs = Appointment.objects.filter(doctor=doctor, date=day).exclude(status=A.Status.CANCELLED)
    seen = qs.filter(status=A.Status.COMPLETED).count()
    upcoming = qs.filter(status__in=[A.Status.CONFIRMED, A.Status.CHECKED_IN])
    return {
        "date": day.isoformat(),
        "booked": qs.count(),
        "seen": seen,
        "waiting": qs.filter(status=A.Status.CHECKED_IN).count(),
        "remaining": upcoming.count(),
        "no_show": qs.filter(status=A.Status.NO_SHOW).count(),
        "collected": sum(qs.filter(status=A.Status.COMPLETED).values_list("fee", flat=True)),
        "expected": sum(qs.exclude(status=A.Status.NO_SHOW).values_list("fee", flat=True)),
        "on_leave": is_on_leave(doctor, day),
    }


def ensure_patient_account(phone: str, name: str = ""):
    """Get or create the patient login for a phone, so WhatsApp bookings show
    up when the same person signs in on the website or app."""
    from accounts.models import User

    user = User.objects.filter(phone=phone).first()
    if user:
        return user
    first, _, last = (name or "").strip().partition(" ")
    user = User(username=phone, phone=phone, role=User.Role.PATIENT, first_name=first[:150], last_name=last[:150])
    user.set_unusable_password()
    user.save()
    return user


def appointments_for_phone(phone: str):
    from django.db.models import Q

    return Appointment.objects.filter(Q(patient__phone=phone) | Q(patient__account__phone=phone)).select_related(
        "doctor__user", "patient"
    )


def upcoming_for_phone(phone: str):
    n = now()
    return [
        a for a in appointments_for_phone(phone).filter(status=A.Status.CONFIRMED, date__gte=n.date()).order_by("date", "start")
        if a.date > n.date() or to_minutes(a.start) >= to_minutes(n.time()) - 30
    ]


def appointment_datetime(a: Appointment) -> datetime:
    return timezone.make_aware(datetime.combine(a.date, a.start), timezone.get_current_timezone())
