from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services as S
from .geo import by_distance, parse_point
from .models import Appointment, Doctor, Leave, Patient, Session, TimeBlock
from .serializers import (
    AppointmentSerializer, BookSerializer, DoctorAppointmentSerializer, DoctorProfileSerializer,
    DoctorPublicSerializer, LeaveSerializer, PatientSerializer, RescheduleSerializer, ScheduleSerializer,
    SessionItemSerializer, TimeBlockSerializer, WalkinSerializer,
)


def booking_error(exc: S.BookingError):
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


# ==========================================================================
# Public
# ==========================================================================

class MetaView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        active = Doctor.objects.filter(is_active=True)
        return Response({
            "brand": settings.CARESLOT["BRAND"],
            "whatsapp_number": settings.WHATSAPP["BUSINESS_NUMBER"],
            "booking_window_days": settings.CARESLOT["BOOKING_WINDOW_DAYS"],
            "specialties": sorted(set(active.values_list("specialty", flat=True))),
            "areas": sorted(set(active.values_list("area", flat=True))),
            "today": S.today().isoformat(),
        })


class DoctorViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    serializer_class = DoctorPublicSerializer
    lookup_field = "slug"
    pagination_class = None

    def get_queryset(self):
        qs = Doctor.objects.filter(is_active=True).select_related("user").prefetch_related("sessions")
        p = self.request.query_params
        if p.get("specialty"):
            qs = qs.filter(specialty=p["specialty"])
        if p.get("area"):
            qs = qs.filter(area=p["area"])
        if p.get("q"):
            q = p["q"].strip()
            qs = qs.filter(Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q)
                           | Q(specialty__icontains=q) | Q(area__icontains=q) | Q(code__iexact=q))
        return qs

    def list(self, request, *args, **kwargs):
        """?lat=&lng= sorts doctors nearest first; &radius_km= keeps only those within it."""
        p = request.query_params
        point = parse_point(p.get("lat"), p.get("lng"))
        doctors, km = by_distance(self.get_queryset(), point)
        try:
            radius = float(p["radius_km"]) if point and p.get("radius_km") else None
        except ValueError:
            radius = None
        if radius:
            doctors = [d for d in doctors if km.get(d.id, float("inf")) <= radius]
        ctx = {**self.get_serializer_context(), "distances": km}
        return Response(DoctorPublicSerializer(doctors, many=True, context=ctx).data)

    @action(detail=True)
    def days(self, request, slug=None):
        return Response(S.day_overview(self.get_object()))

    @action(detail=True)
    def slots(self, request, slug=None):
        d = self.get_object()
        try:
            day = S.parse_date(request.query_params.get("date") or S.today().isoformat())
        except S.BookingError as exc:
            return booking_error(exc)
        return Response({
            "date": day.isoformat(), "label": S.rel_date(day), "on_leave": S.is_on_leave(d, day),
            "slots": [s.as_dict() for s in S.day_slots(d, day)],
        })


# ==========================================================================
# Patient (any signed-in user can book for themselves and family)
# ==========================================================================

def account_appointments(user):
    q = Q(patient__account=user)
    if user.phone:
        q |= Q(patient__phone=user.phone)
    return Appointment.objects.filter(q).select_related("doctor__user", "patient").distinct()


class MyPatientsViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = PatientSerializer
    pagination_class = None

    def get_queryset(self):
        return Patient.objects.filter(account=self.request.user, removed_at__isnull=True).order_by("id")

    def perform_create(self, serializer):
        has_self = Patient.objects.filter(account=self.request.user).exists()
        serializer.save(account=self.request.user, phone=self.request.user.phone or "",
                        relation=serializer.validated_data.get("relation") or ("self" if not has_self else "family"))

    def destroy(self, request, *args, **kwargs):
        """Soft delete: hidden from the account, past visits keep their name."""
        from django.utils import timezone

        p = self.get_object()
        if p.relation == "self":
            return Response({"detail": "You can't remove yourself. Edit your details instead."}, status=400)
        if p.appointments.filter(status="confirmed", date__gte=S.today()).exists():
            return Response({"detail": f"{p.name} has an upcoming visit. Cancel it first, then remove them."}, status=400)
        p.removed_at = timezone.now()
        p.save(update_fields=["removed_at"])
        return Response(status=204)


class MyAppointmentsViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = AppointmentSerializer
    lookup_field = "code"
    pagination_class = None

    def get_queryset(self):
        return account_appointments(self.request.user).order_by("-date", "-start")

    def create(self, request):
        s = BookSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        user = request.user
        if d.get("patient_id"):
            patient = get_object_or_404(Patient.objects.filter(Q(account=user) | Q(phone=user.phone or "-"), removed_at__isnull=True), pk=d["patient_id"])
        else:
            np = d["patient"]
            has_self = Patient.objects.filter(account=user).exists()
            patient = Patient.objects.create(account=user, phone=user.phone or "", name=" ".join(np["name"].split()),
                                             age=np["age"], gender=np.get("gender", ""),
                                             relation=np.get("relation") if has_self else "self")
        if not patient.phone and user.phone:
            patient.phone = user.phone
            patient.save(update_fields=["phone"])
        try:
            appt = S.book(doctor=d["doctor"], patient=patient, day=d["date"], start=d["time"],
                          source=d["source"], reason=d.get("reason", ""))
        except S.BookingError as exc:
            return booking_error(exc)
        if not patient.consent_at:
            from django.utils import timezone

            patient.consent_at = timezone.now()
            patient.save(update_fields=["consent_at"])
        return Response(AppointmentSerializer(appt).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, code=None):
        appt = self.get_object()
        try:
            S.cancel(appt, by="patient", source=request.data.get("source", "web"))
        except S.BookingError as exc:
            return booking_error(exc)
        return Response(AppointmentSerializer(appt).data)

    @action(detail=True, methods=["post"])
    def reschedule(self, request, code=None):
        appt = self.get_object()
        s = RescheduleSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            S.reschedule(appt, s.validated_data["date"], s.validated_data["time"], source=request.data.get("source", "web"))
        except S.BookingError as exc:
            return booking_error(exc)
        return Response(AppointmentSerializer(appt).data)


# ==========================================================================
# Doctor portal (doctors see their own data; admins pass ?doctor=<slug>)
# ==========================================================================

class IsDoctorOrAdmin(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role in ("doctor", "admin"))


class DoctorScoped(APIView):
    permission_classes = [IsDoctorOrAdmin]

    def doctor(self) -> Doctor:
        u = self.request.user
        if u.role == "doctor":
            d = getattr(u, "doctor", None)
            if not d:
                raise PermissionDenied("Your login is not linked to a doctor profile yet.")
            return d
        slug = self.request.query_params.get("doctor")
        if not slug and isinstance(self.request.data, dict):
            slug = self.request.data.get("doctor")
        if not slug:
            raise ValidationError({"doctor": "Admins must pass ?doctor=<slug>."})
        return get_object_or_404(Doctor, slug=slug)

    def day(self):
        try:
            return S.parse_date(self.request.query_params.get("date") or S.today().isoformat())
        except S.BookingError as exc:
            raise ValidationError({"date": str(exc)})

    def appt(self, code) -> Appointment:
        return get_object_or_404(Appointment.objects.select_related("patient", "doctor__user"), doctor=self.doctor(), code=code)


class DoctorProfileView(DoctorScoped):
    def get(self, request):
        return Response(DoctorProfileSerializer(self.doctor()).data)

    def patch(self, request):
        allowed = {"about", "languages", "fee", "address", "maps_url", "notify_whatsapp", "qualifications",
                   "latitude", "longitude"}
        d = self.doctor()
        s = DoctorProfileSerializer(d, data={k: v for k, v in request.data.items() if k in allowed}, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(DoctorProfileSerializer(d).data)


class DoctorDayView(DoctorScoped):
    def get(self, request):
        d, day = self.doctor(), self.day()
        appts = (Appointment.objects.filter(doctor=d, date=day).select_related("patient", "doctor__user")
                 .order_by("start"))
        live = [a for a in appts if a.status != "cancelled"] + [a for a in appts if a.status == "cancelled"]
        return Response({
            "summary": S.day_summary(d, day),
            "label": S.rel_date(day),
            "days": S.day_overview(d, S.booking_days(7)),
            "blocks": TimeBlockSerializer(TimeBlock.objects.filter(doctor=d, date=day), many=True).data,
            "free_slots": [t.strftime("%H:%M") for t in S.free_slots(d, day)] if day >= S.today() else [],
            "appointments": DoctorAppointmentSerializer(live, many=True).data,
        })


class DoctorAppointmentStatusView(DoctorScoped):
    def post(self, request, code):
        a = self.appt(code)
        new = request.data.get("status", "")
        try:
            if new == "cancelled":
                S.cancel(a, by="doctor", reason=request.data.get("reason", "") or "Cancelled by doctor")
            else:
                S.set_status(a, new)
        except S.BookingError as exc:
            return booking_error(exc)
        return Response(DoctorAppointmentSerializer(a).data)


class DoctorWalkinView(DoctorScoped):
    def post(self, request):
        d = self.doctor()
        s = WalkinSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        v = s.validated_data
        patient = None
        if v["phone"]:
            patient = Patient.objects.filter(phone=v["phone"], name__iexact=v["name"].strip()).first()
        if not patient:
            patient = Patient.objects.create(name=" ".join(v["name"].split()), age=v.get("age"), phone=v["phone"])
        try:
            a = S.book(doctor=d, patient=patient, day=v["date"], start=v["time"], source="walkin", reason=v["reason"])
        except S.BookingError as exc:
            return booking_error(exc)
        if a.date == S.today():
            S.set_status(a, "checked_in")
        return Response(DoctorAppointmentSerializer(a).data, status=201)


class DoctorScheduleView(DoctorScoped):
    def get(self, request):
        d = self.doctor()
        return Response({"slot_minutes": d.slot_minutes,
                         "sessions": SessionItemSerializer(d.sessions.all(), many=True).data})

    def put(self, request):
        """Replace the weekly hours. Bookings the new hours would leave out are
        cancelled (patients told on WhatsApp) only when the request says
        cancel_affected=true; otherwise they are listed back with a 409."""
        d = self.doctor()
        s = ScheduleSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        v = s.validated_data
        affected = S.schedule_conflicts(d, v["sessions"], v["slot_minutes"])
        if affected and not schedule_change_confirmed(request):
            return schedule_conflict_response(affected)
        with transaction.atomic():
            d.slot_minutes = v["slot_minutes"]
            d.save(update_fields=["slot_minutes"])
            d.sessions.all().delete()
            Session.objects.bulk_create([Session(doctor=d, **x) for x in v["sessions"]])
            S.cancel_for_schedule_change(affected)
        data = self.get(request).data
        return Response({**data, "cancelled": [a.code for a in affected]})


def schedule_change_confirmed(request) -> bool:
    flag = request.data.get("cancel_affected") if isinstance(request.data, dict) else None
    return flag is True or str(flag).lower() in ("1", "true")


def schedule_conflict_response(affected: list[Appointment]) -> Response:
    n = len(affected)
    return Response({
        "detail": f"{n} booked patient{'s' if n > 1 else ''} would fall outside the new times. "
                  f"Confirm to cancel {'them' if n > 1 else 'it'} (patients are told on WhatsApp), or keep the old hours.",
        "code": "bookings_affected",
        "affected": [{"code": a.code, "date": a.date.isoformat(), "time": a.start.strftime("%H:%M"),
                      "when": S.when_text(a.date, a.start), "patient": a.patient.name} for a in affected],
    }, status=status.HTTP_409_CONFLICT)


class DoctorBlocksView(DoctorScoped):
    def get(self, request):
        qs = TimeBlock.objects.filter(doctor=self.doctor(), date__gte=S.today())
        return Response(TimeBlockSerializer(qs, many=True).data)

    def post(self, request):
        s = TimeBlockSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        v = s.validated_data
        try:
            block, hit = S.add_block(self.doctor(), v["date"], v["start"], v["end"], v.get("reason", ""))
        except S.BookingError as exc:
            return booking_error(exc)
        return Response({"block": TimeBlockSerializer(block).data, "cancelled": [a.code for a in hit]}, status=201)


class DoctorBlockDeleteView(DoctorScoped):
    def delete(self, request, pk):
        get_object_or_404(TimeBlock, pk=pk, doctor=self.doctor()).delete()
        return Response(status=204)


class DoctorLeavesView(DoctorScoped):
    def get(self, request):
        qs = Leave.objects.filter(doctor=self.doctor(), date__gte=S.today())
        return Response(LeaveSerializer(qs, many=True).data)

    def post(self, request):
        s = LeaveSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            leave, hit = S.add_leave(self.doctor(), s.validated_data["date"], s.validated_data.get("reason", ""))
        except S.BookingError as exc:
            return booking_error(exc)
        return Response({"leave": LeaveSerializer(leave).data, "cancelled": [a.code for a in hit]}, status=201)


class DoctorLeaveDeleteView(DoctorScoped):
    def delete(self, request, pk):
        get_object_or_404(Leave, pk=pk, doctor=self.doctor()).delete()
        return Response(status=204)
