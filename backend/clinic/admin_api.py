"""Admin portal API ("god mode"). Every endpoint here requires an admin login.

Covers: overview numbers, doctors (create/edit/disable, login), all bookings
(search, book on behalf, reschedule, any status), all users (role, disable,
password, erase personal data) and the WhatsApp message log.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import PhoneOTP, User
from accounts.phone import is_valid_phone, normalize_phone, pretty_phone
from whatsapp.models import Conversation, MessageLog

from . import services as S
from .models import Appointment, Doctor, Patient
from .serializers import DoctorAppointmentSerializer

A = Appointment


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_active and (u.role == "admin" or u.is_superuser))


class AdminView(APIView):
    permission_classes = [IsAdmin]


def page_params(request, default=50, maximum=200):
    try:
        limit = max(1, min(int(request.query_params.get("limit", default)), maximum))
        offset = max(0, int(request.query_params.get("offset", 0)))
    except ValueError:
        limit, offset = default, 0
    return limit, offset


def bad(msg, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": msg}, status=code)


def phone_or_error(raw, *, exclude_user=None):
    """Normalises a phone and checks no other login uses it."""
    if not raw:
        return "", None
    if not is_valid_phone(raw):
        return None, "Enter a valid mobile number with 10 digits."
    phone = normalize_phone(raw)
    other = User.objects.filter(phone=phone)
    if exclude_user is not None:
        other = other.exclude(pk=exclude_user.pk)
    other = other.first()
    if other:
        doc = getattr(other, "doctor", None) if other.role == "doctor" else None
        if doc and doc.archived_at:
            return None, f"{pretty_phone(phone)} belongs to {doc.name}, who was deleted. Restore them from the Deleted tab instead."
        return None, f"{pretty_phone(phone)} already belongs to {other.get_full_name() or other.username} ({other.role})."
    return phone, None


# ==========================================================================
# Overview
# ==========================================================================

class StatsView(AdminView):
    def get(self, request):
        today = S.today()
        week = today + timedelta(days=6)
        todays = A.objects.filter(date=today)
        live = todays.exclude(status=A.Status.CANCELLED)
        by_source = dict(A.objects.filter(created_at__date=today).values_list("source").annotate(n=Count("id")))
        doctors = []
        for d in Doctor.objects.filter(is_active=True).select_related("user"):
            s = S.day_summary(d, today)
            doctors.append({"slug": d.slug, "name": d.name, "specialty": d.specialty, **s,
                            "has_location": d.latitude is not None})
        return Response({
            "today": today.isoformat(),
            "bookings_today": live.count(),
            "seen_today": live.filter(status=A.Status.COMPLETED).count(),
            "no_show_today": live.filter(status=A.Status.NO_SHOW).count(),
            "cancelled_today": todays.filter(status=A.Status.CANCELLED).count(),
            "fees_today": sum(live.filter(status=A.Status.COMPLETED).values_list("fee", flat=True)),
            "next_7_days": A.objects.filter(date__range=(today, week), status=A.Status.CONFIRMED).count(),
            "made_today_by_source": {src: by_source.get(src, 0) for src, _ in A.Source.choices},
            "patients": Patient.objects.count(),
            "patient_accounts": User.objects.filter(role="patient").count(),
            "doctors_active": Doctor.objects.filter(is_active=True).count(),
            "doctors_inactive": Doctor.objects.filter(is_active=False, archived_at__isnull=True).count(),
            "doctors_without_location": Doctor.objects.filter(is_active=True, latitude__isnull=True).count(),
            "whatsapp_messages_today": MessageLog.objects.filter(created_at__date=today).count(),
            "whatsapp_failed_today": MessageLog.objects.filter(created_at__date=today, status="failed").count(),
            "doctors": doctors,
        })


# ==========================================================================
# Doctors
# ==========================================================================

DOCTOR_FIELDS = ["specialty", "qualifications", "experience_years", "about", "languages", "area", "city", "address",
                 "maps_url", "latitude", "longitude", "fee", "slot_minutes", "is_active", "notify_whatsapp", "code"]


class DoctorInSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    username = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    password = serializers.CharField(required=False, allow_blank=True, default="", write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True, default="")

    class Meta:
        model = Doctor
        fields = ["first_name", "last_name", "phone", "username", "password", "email"] + DOCTOR_FIELDS
        extra_kwargs = {"code": {"required": False, "allow_blank": True}}

    def validate_password(self, v):
        if v and len(v) < 8:
            raise serializers.ValidationError("Use at least 8 characters.")
        return v

    def validate(self, attrs):
        lat, lng = attrs.get("latitude"), attrs.get("longitude")
        if (lat is None) != (lng is None) and ("latitude" in attrs or "longitude" in attrs):
            raise serializers.ValidationError({"latitude": "Enter both latitude and longitude, or neither."})
        if lat is not None and not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise serializers.ValidationError({"latitude": "Those numbers aren't a place on the map."})
        return attrs


def doctor_status(d: Doctor) -> str:
    return "deleted" if d.archived_at else ("active" if d.is_active else "inactive")


def doctor_out(d: Doctor) -> dict:
    u = d.user
    upcoming = A.objects.filter(doctor=d, status=A.Status.CONFIRMED, date__gte=S.today()).count()
    return {
        "slug": d.slug, "code": d.code, "name": d.name,
        "status": doctor_status(d),
        "archived_at": d.archived_at.isoformat() if d.archived_at else None,
        "total_bookings": A.objects.filter(doctor=d).count(),
        "first_name": u.first_name, "last_name": u.last_name, "username": u.username,
        "phone": u.phone or "", "phone_display": pretty_phone(u.phone or ""), "email": u.email,
        "can_sign_in": u.is_active, "has_password": u.has_usable_password(),
        **{f: getattr(d, f) for f in DOCTOR_FIELDS},
        "whatsapp_link": d.whatsapp_link,
        "sessions": [{"weekday": s.weekday, "day": s.get_weekday_display(), "start": s.start.strftime("%H:%M"),
                      "end": s.end.strftime("%H:%M")} for s in d.sessions.all()],
        "upcoming_bookings": upcoming,
        "next_available": S.next_available(d) if d.is_active and not d.archived_at else None,
    }


class AdminDoctorsView(AdminView):
    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        qs = Doctor.objects.select_related("user").prefetch_related("sessions")
        st = request.query_params.get("status")
        if st == "deleted":
            qs = qs.filter(archived_at__isnull=False)
        elif st == "active":
            qs = qs.filter(archived_at__isnull=True, is_active=True)
        elif st == "inactive":
            qs = qs.filter(archived_at__isnull=True, is_active=False)
        if q:
            qs = qs.filter(Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q) | Q(specialty__icontains=q)
                           | Q(area__icontains=q) | Q(code__icontains=q) | Q(user__phone__icontains=q))
        return Response([doctor_out(d) for d in qs])

    @transaction.atomic
    def post(self, request):
        s = DoctorInSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        v = dict(s.validated_data)
        phone, err = phone_or_error(v.pop("phone"))
        if err:
            return Response({"phone": [err]}, status=400)
        username = (v.pop("username") or f"dr.{v['first_name'].split()[0].lower()}").strip()
        base, n = username, 2
        while User.objects.filter(username=username).exists():
            username, n = f"{base}{n}", n + 1
        password = v.pop("password")
        user = User(username=username, first_name=v.pop("first_name"), last_name=v.pop("last_name"),
                    email=v.pop("email"), phone=phone or None, role=User.Role.DOCTOR)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()  # can still sign in with a WhatsApp code to their phone
        user.save()
        if not v.get("code"):
            v.pop("code", None)
        elif Doctor.objects.filter(code=v["code"].upper()).exists():
            raise serializers.ValidationError({"code": ["Another doctor already uses this code."]})
        d = Doctor.objects.create(user=user, **v)
        return Response(doctor_out(d), status=201)


class AdminDoctorDetailView(AdminView):
    def get(self, request, slug):
        return Response(doctor_out(get_object_or_404(Doctor.objects.select_related("user"), slug=slug)))

    @transaction.atomic
    def patch(self, request, slug):
        d = get_object_or_404(Doctor.objects.select_related("user"), slug=slug)
        if d.archived_at:
            return bad("This doctor is deleted. Restore them first to make changes.")
        s = DoctorInSerializer(d, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        v = dict(s.validated_data)
        u = d.user
        if "phone" in v:
            phone, err = phone_or_error(v.pop("phone"), exclude_user=u)
            if err:
                return Response({"phone": [err]}, status=400)
            u.phone = phone or None
        if v.get("username"):
            name = v.pop("username").strip()
            if User.objects.filter(username=name).exclude(pk=u.pk).exists():
                return Response({"username": ["That username is taken."]}, status=400)
            u.username = name
        v.pop("username", None)
        for f in ("first_name", "last_name", "email"):
            if f in v:
                setattr(u, f, v.pop(f))
        if v.get("password"):
            u.set_password(v["password"])
        v.pop("password", None)
        u.save()
        if "code" in v:
            code = (v.pop("code") or "").upper().replace(" ", "")
            if code and Doctor.objects.filter(code=code).exclude(pk=d.pk).exists():
                return Response({"code": ["Another doctor already uses this code."]}, status=400)
            if code:
                d.code = code
        for f, val in v.items():
            setattr(d, f, val)
        d.save()
        return Response(doctor_out(d))

    @transaction.atomic
    def delete(self, request, slug):
        """Delete a doctor (soft delete: nothing is removed from the database).

        The doctor is archived: login off, hidden from patients and WhatsApp,
        everything kept so they can be restored. Upcoming bookings must be
        cancelled first (?cancel_upcoming=1), which tells each patient on WhatsApp.
        """
        d = get_object_or_404(Doctor.objects.select_related("user"), slug=slug)
        if d.archived_at:
            return bad("This doctor is already deleted.")
        upcoming = A.objects.filter(doctor=d, status=A.Status.CONFIRMED, date__gte=S.today())
        n_up = upcoming.count()
        if n_up and request.query_params.get("cancel_upcoming") != "1":
            return Response({"detail": f"{d.name} has {n_up} upcoming booking{'s' if n_up > 1 else ''}. "
                                       "Cancel them (patients are told on WhatsApp) to delete this doctor.",
                             "upcoming": n_up}, status=status.HTTP_409_CONFLICT)
        cancelled = 0
        for a in upcoming.select_related("patient", "doctor__user"):
            S.cancel(a, by="admin", reason="Doctor no longer available")
            cancelled += 1
        name = d.name
        from django.utils import timezone

        d.archived_at = timezone.now()
        d.is_active = False
        d.save(update_fields=["archived_at", "is_active"])
        d.user.is_active = False
        d.user.save(update_fields=["is_active"])
        return Response({"result": "archived", "name": name, "cancelled": cancelled})


class AdminDoctorRestoreView(AdminView):
    def post(self, request, slug):
        d = get_object_or_404(Doctor.objects.select_related("user"), slug=slug)
        if not d.archived_at:
            return bad("This doctor isn't deleted.")
        d.archived_at = None
        d.is_active = False  # back as Inactive: check the details, then switch bookings on
        d.save(update_fields=["archived_at", "is_active"])
        d.user.is_active = True
        d.user.save(update_fields=["is_active"])
        return Response(doctor_out(d))


# ==========================================================================
# Bookings
# ==========================================================================

class AdminAppointmentsView(AdminView):
    def get(self, request):
        p = request.query_params
        qs = A.objects.select_related("doctor__user", "patient")
        try:
            if p.get("date_from"):
                qs = qs.filter(date__gte=S.parse_date(p["date_from"]))
            if p.get("date_to"):
                qs = qs.filter(date__lte=S.parse_date(p["date_to"]))
        except S.BookingError as exc:
            return bad(str(exc))
        if p.get("doctor"):
            qs = qs.filter(doctor__slug=p["doctor"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("source"):
            qs = qs.filter(source=p["source"])
        if p.get("q"):
            q = p["q"].strip()
            digits = "".join(c for c in q if c.isdigit())
            cond = Q(code__iexact=q) | Q(patient__name__icontains=q) | Q(reason__icontains=q)
            if len(digits) >= 4:
                cond |= Q(patient__phone__contains=digits)
            qs = qs.filter(cond)
        order = ("-date", "-start") if p.get("order") == "latest" else ("date", "start")
        qs = qs.order_by(*order)
        limit, offset = page_params(request)
        return Response({"count": qs.count(),
                         "results": DoctorAppointmentSerializer(qs[offset:offset + limit], many=True).data})

    def post(self, request):
        """Book on someone's behalf (phone call, front desk)."""
        d = request.data
        doctor = Doctor.objects.filter(slug=d.get("doctor")).first()
        if not doctor:
            return Response({"doctor": ["Choose a doctor."]}, status=400)
        name = " ".join(str(d.get("name", "")).split())
        if len(name) < 2:
            return Response({"name": ["Enter the patient's name."]}, status=400)
        phone = ""
        if d.get("phone"):
            if not is_valid_phone(d["phone"]):
                return Response({"phone": ["Enter a valid mobile number or leave it empty."]}, status=400)
            phone = normalize_phone(d["phone"])
        try:
            age = int(d["age"]) if str(d.get("age", "")).strip() else None
        except ValueError:
            return Response({"age": ["Age must be a number."]}, status=400)
        patient = Patient.objects.filter(phone=phone, name__iexact=name, removed_at__isnull=True).first() if phone else None
        if not patient:
            account = User.objects.filter(phone=phone).first() if phone else None
            patient = Patient.objects.create(name=name, age=age, phone=phone, account=account,
                                             relation="self" if account and not account.patients.exists() else "family")
        try:
            a = S.book(doctor=doctor, patient=patient, day=d.get("date"), start=d.get("time"),
                       source=A.Source.ADMIN, reason=str(d.get("reason", "")))
        except S.BookingError as exc:
            return bad(str(exc))
        return Response(DoctorAppointmentSerializer(a).data, status=201)


class AdminAppointmentActionView(AdminView):
    def post(self, request, code, action):
        a = get_object_or_404(A.objects.select_related("doctor__user", "patient"), code=code)
        try:
            if action == "cancel":
                S.cancel(a, by="admin", reason=request.data.get("reason", "") or "Cancelled by the clinic")
            elif action == "reschedule":
                S.reschedule(a, request.data.get("date"), request.data.get("time"), source=A.Source.ADMIN)
            elif action == "status":
                new = request.data.get("status")
                if new not in A.Status.values or new == A.Status.CANCELLED:
                    return bad("Choose confirmed, checked_in, completed or no_show. Use cancel to cancel.")
                # God mode: any status, including reopening a cancelled visit if its slot is still free.
                if a.status == A.Status.CANCELLED:
                    if A.objects.filter(doctor=a.doctor, date=a.date, start=a.start).exclude(pk=a.pk).exclude(status="cancelled").exists():
                        return bad("That time has been booked by someone else since, so this visit can't be reopened.")
                    a.cancelled_by, a.cancel_reason = "", ""
                a.status = new
                a.save()
            else:
                return bad("Unknown action.", 404)
        except S.BookingError as exc:
            return bad(str(exc))
        return Response(DoctorAppointmentSerializer(a).data)


class AdminPatientLookupView(AdminView):
    """Patients already known for a phone number, so the desk doesn't retype them."""

    def get(self, request):
        raw = request.query_params.get("phone", "")
        if not is_valid_phone(raw):
            return Response([])
        phone = normalize_phone(raw)
        qs = Patient.objects.filter(Q(phone=phone) | Q(account__phone=phone), removed_at__isnull=True).order_by("id")[:10]
        return Response([{"id": p.id, "name": p.name, "age": p.current_age, "relation": p.relation} for p in qs])


# ==========================================================================
# Users
# ==========================================================================

def user_out(u: User) -> dict:
    from accounts.views import user_payload

    data = user_payload(u)
    data.update({
        "username": u.username,
        "is_active": u.is_active,
        "has_password": u.has_usable_password(),
        "date_joined": u.date_joined.isoformat(),
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "people": getattr(u, "people_count", None),
        "bookings": A.objects.filter(Q(patient__account=u) | (Q(patient__phone=u.phone) if u.phone else Q(pk__in=[]))).count(),
    })
    return data


class AdminUsersView(AdminView):
    def get(self, request):
        p = request.query_params
        qs = User.objects.annotate(people_count=Count("patients", filter=Q(patients__removed_at__isnull=True))).order_by("-date_joined")
        qs = qs.exclude(username__startswith="erased-user-")  # erased on request: no personal data left to show
        if p.get("role"):
            qs = qs.filter(role=p["role"])
        if p.get("q"):
            q = p["q"].strip()
            digits = "".join(c for c in q if c.isdigit())
            cond = Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(username__icontains=q) | Q(email__icontains=q)
            if len(digits) >= 4:
                cond |= Q(phone__contains=digits)
            qs = qs.filter(cond)
        limit, offset = page_params(request)
        return Response({"count": qs.count(), "results": [user_out(u) for u in qs[offset:offset + limit]]})

    def post(self, request):
        """Create a staff or admin login (doctors are created under Doctors)."""
        d = request.data
        role = d.get("role", "admin")
        if role not in ("admin",):
            return bad("Create doctors from the Doctors page. Patients register themselves.")
        username = str(d.get("username", "")).strip()
        password = str(d.get("password", ""))
        if not username:
            return Response({"username": ["Choose a username."]}, status=400)
        if User.objects.filter(username=username).exists():
            return Response({"username": ["That username is taken."]}, status=400)
        if len(password) < 8:
            return Response({"password": ["Use at least 8 characters."]}, status=400)
        phone, err = phone_or_error(d.get("phone", ""))
        if err:
            return Response({"phone": [err]}, status=400)
        first, _, last = str(d.get("name", "")).strip().partition(" ")
        u = User(username=username, first_name=first, last_name=last, phone=phone or None, role="admin",
                 is_staff=True, email=str(d.get("email", "")))
        u.set_password(password)
        u.save()
        return Response(user_out(u), status=201)


class AdminUserDetailView(AdminView):
    def patch(self, request, pk):
        u = get_object_or_404(User, pk=pk)
        d = request.data
        me = request.user.pk == u.pk
        if "is_active" in d and me and not d["is_active"]:
            return bad("You can't disable your own login.")
        if "role" in d:
            role = d["role"]
            if role not in ("admin", "patient", "doctor"):
                return bad("Unknown role.")
            if me and role != "admin":
                return bad("You can't remove your own admin rights.")
            if role == "doctor" and not hasattr(u, "doctor"):
                return bad("To make someone a doctor, add them on the Doctors page.")
            if u.role == "doctor" and role != "doctor":
                return bad("Turn off this doctor's bookings on the Doctors page instead of changing the role.")
            u.role = role
            u.is_staff = role == "admin"
        if "name" in d:
            u.first_name, _, u.last_name = str(d["name"]).strip().partition(" ")
        if "email" in d:
            u.email = str(d["email"]).strip()
        if "phone" in d:
            phone, err = phone_or_error(d["phone"], exclude_user=u)
            if err:
                return Response({"phone": [err]}, status=400)
            if not phone and u.role == "patient":
                return bad("Patients sign in with their phone, so it can't be empty.")
            u.phone = phone or None
        if "is_active" in d:
            u.is_active = bool(d["is_active"])
        if d.get("password"):
            if len(d["password"]) < 8:
                return Response({"password": ["Use at least 8 characters."]}, status=400)
            u.set_password(d["password"])
        u.save()
        return Response(user_out(User.objects.annotate(people_count=Count("patients")).get(pk=u.pk)))

    @transaction.atomic
    def delete(self, request, pk):
        """Erase a person's data (DPDP request) without deleting any rows.

        Personal details are wiped from the account, its patients and the
        WhatsApp log, and the login is switched off. Visits stay in the
        doctors' records as "Erased patient"."""
        u = get_object_or_404(User, pk=pk)
        if u.pk == request.user.pk:
            return bad("You can't erase your own login.")
        if u.role != "patient":
            return bad("Only patient accounts can be erased. Disable doctor or admin logins instead.")
        phone = u.phone or ""
        for p in Patient.objects.filter(Q(account=u) | (Q(phone=phone) if phone else Q(pk__in=[]))):
            p.name, p.phone, p.date_of_birth, p.gender, p.account = "Erased patient", "", None, "", None
            p.save()
        A.objects.filter(patient__name="Erased patient", reason__gt="").update(reason="")
        if phone:
            MessageLog.objects.filter(phone=phone).update(phone="erased", summary="[erased at the patient's request]", payload={}, error="")
            Conversation.objects.filter(phone=phone).update(phone=f"erased-{u.pk}"[:15], profile_name="", state={})
            PhoneOTP.objects.filter(phone=phone).update(phone="erased", used=True)
        u.username = f"erased-user-{u.pk}"
        u.first_name = u.last_name = u.email = ""
        u.phone = None
        u.is_active = False
        u.set_unusable_password()
        u.save()
        return Response(status=204)


# ==========================================================================
# WhatsApp log
# ==========================================================================

class AdminMessagesView(AdminView):
    def get(self, request):
        p = request.query_params
        phone = normalize_phone(p.get("phone", "")) if p.get("phone") else ""
        if phone:
            qs = MessageLog.objects.filter(phone=phone).order_by("-id")
            limit, offset = page_params(request, default=100)
            rows = list(qs[offset:offset + limit])
            return Response({"count": qs.count(), "results": [
                {"id": m.id, "direction": m.direction, "kind": m.kind, "summary": m.summary, "status": m.status,
                 "error": m.error, "created_at": m.created_at.isoformat()} for m in reversed(rows)]})
        # One row per phone that has sent or received anything, most recent first.
        # Built from the log, so patients who only received confirmations appear too.
        from django.db.models import Max

        q = (p.get("q") or "").strip()
        threads = MessageLog.objects.values("phone").annotate(
            last_id=Max("id"), messages=Count("id"), failed=Count("id", filter=Q(status="failed"))
        ).order_by("-last_id")
        if q:
            digits = "".join(c for c in q if c.isdigit())
            names_match = list(User.objects.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q))
                               .exclude(phone=None).values_list("phone", flat=True))
            threads = threads.filter(Q(phone__contains=digits) if digits else Q(phone__in=names_match))
        limit, offset = page_params(request)
        page = list(threads[offset:offset + limit])
        phones = [t["phone"] for t in page]
        names = {u.phone: u.get_full_name() for u in User.objects.filter(phone__in=phones)}
        profiles = dict(Conversation.objects.filter(phone__in=phones).values_list("phone", "profile_name"))
        doctors = set(Doctor.objects.filter(user__phone__in=phones).values_list("user__phone", flat=True))
        lasts = {m.id: m for m in MessageLog.objects.filter(id__in=[t["last_id"] for t in page])}
        rows = [{
            "phone": t["phone"], "phone_display": pretty_phone(t["phone"]),
            "name": names.get(t["phone"]) or profiles.get(t["phone"], ""),
            "is_doctor": t["phone"] in doctors, "messages": t["messages"], "failed": t["failed"],
            "last": lasts[t["last_id"]].summary[:120], "updated_at": lasts[t["last_id"]].created_at.isoformat(),
        } for t in page]
        return Response({"count": threads.count(), "results": rows,
                         "failed_total": MessageLog.objects.filter(status="failed").count()})
