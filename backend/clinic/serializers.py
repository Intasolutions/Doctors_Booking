from rest_framework import serializers

from accounts.phone import is_valid_phone, normalize_phone, pretty_phone

from . import services as S
from .models import Appointment, Doctor, Leave, Patient, Session, TimeBlock


class DoctorPublicSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    whatsapp_link = serializers.CharField(read_only=True)
    directions_url = serializers.CharField(read_only=True)
    next_available = serializers.SerializerMethodField()
    hours = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()
    next_slots = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = ["slug", "code", "name", "specialty", "qualifications", "experience_years", "about", "languages",
                  "area", "city", "address", "directions_url", "latitude", "longitude", "fee", "slot_minutes",
                  "whatsapp_link", "next_available", "next_slots", "hours", "distance_km"]

    def get_next_slots(self, d):
        return S.next_slots(d)

    def get_distance_km(self, d):
        km = self.context.get("distances", {}).get(d.id)
        return round(km, 1) if km is not None else None

    def get_next_available(self, d):
        return S.next_available(d)

    def get_hours(self, d):
        days = {}
        for s in d.sessions.all():
            days.setdefault(s.get_weekday_display(), []).append(f"{S.fmt_time(s.start)} – {S.fmt_time(s.end)}")
        return [{"day": k, "sessions": v} for k, v in days.items()]


class DoctorProfileSerializer(DoctorPublicSerializer):
    class Meta(DoctorPublicSerializer.Meta):
        fields = DoctorPublicSerializer.Meta.fields + ["is_active", "notify_whatsapp"]
        read_only_fields = ["slug", "code", "is_active"]


class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ["id", "name", "age", "date_of_birth", "gender", "relation"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["age"] = instance.current_age
        return data

    def validate_name(self, v):
        v = " ".join(v.split())
        if len(v) < 2:
            raise serializers.ValidationError("Enter the patient's name.")
        return v


class MiniDoctorSerializer(serializers.ModelSerializer):
    name = serializers.CharField(read_only=True)
    directions_url = serializers.CharField(read_only=True)

    class Meta:
        model = Doctor
        fields = ["slug", "name", "specialty", "area", "address", "directions_url", "fee"]


class AppointmentSerializer(serializers.ModelSerializer):
    doctor = MiniDoctorSerializer(read_only=True)
    patient = PatientSerializer(read_only=True)
    time = serializers.SerializerMethodField()
    when = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    source_label = serializers.CharField(source="get_source_display", read_only=True)
    upcoming = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = ["code", "doctor", "patient", "date", "time", "when", "status", "status_label", "source",
                  "source_label", "reason", "fee", "patient_confirmed", "cancelled_by", "upcoming", "created_at"]

    def get_time(self, a):
        return a.start.strftime("%H:%M")

    def get_when(self, a):
        return S.when_text(a.date, a.start)

    def get_upcoming(self, a):
        n = S.now()
        return a.status == "confirmed" and (a.date > n.date() or (a.date == n.date() and a.start >= n.time()))


class DoctorAppointmentSerializer(AppointmentSerializer):
    patient_phone = serializers.SerializerMethodField()

    class Meta(AppointmentSerializer.Meta):
        fields = AppointmentSerializer.Meta.fields + ["patient_phone"]

    def get_patient_phone(self, a):
        return pretty_phone(a.patient.phone)


class NewPatientSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    age = serializers.IntegerField(min_value=0, max_value=120)
    relation = serializers.CharField(max_length=30, required=False, default="family")
    gender = serializers.ChoiceField(choices=["male", "female", "other", ""], required=False, default="")


class BookSerializer(serializers.Serializer):
    doctor = serializers.SlugRelatedField(slug_field="slug", queryset=Doctor.objects.filter(is_active=True))
    date = serializers.DateField()
    time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])
    patient_id = serializers.IntegerField(required=False)
    patient = NewPatientSerializer(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")
    source = serializers.ChoiceField(choices=["web", "app"], default="web")

    def validate(self, attrs):
        if not attrs.get("patient_id") and not attrs.get("patient"):
            raise serializers.ValidationError("Choose who the visit is for.")
        return attrs


class RescheduleSerializer(serializers.Serializer):
    date = serializers.DateField()
    time = serializers.TimeField(input_formats=["%H:%M", "%H:%M:%S"])


class WalkinSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    age = serializers.IntegerField(min_value=0, max_value=120, required=False, allow_null=True)
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, max_length=200, default="")
    date = serializers.DateField()
    time = serializers.TimeField(input_formats=["%H:%M", "%H:%M:%S"])

    def validate_phone(self, v):
        if v and not is_valid_phone(v):
            raise serializers.ValidationError("Enter a valid mobile number or leave it empty.")
        return normalize_phone(v) if v else ""


class SessionItemSerializer(serializers.ModelSerializer):
    start = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])
    end = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])

    class Meta:
        model = Session
        fields = ["weekday", "start", "end"]

    def validate(self, attrs):
        if attrs["end"] <= attrs["start"]:
            raise serializers.ValidationError("A session must end after it starts.")
        return attrs


class ScheduleSerializer(serializers.Serializer):
    slot_minutes = serializers.ChoiceField(choices=[5, 10, 15, 20, 30, 45, 60])
    sessions = SessionItemSerializer(many=True)

    def validate_sessions(self, items):
        by_day = {}
        for s in items:
            by_day.setdefault(s["weekday"], []).append((s["start"], s["end"]))
        for day, spans in by_day.items():
            spans.sort()
            for (a1, b1), (a2, b2) in zip(spans, spans[1:]):
                if a2 < b1:
                    raise serializers.ValidationError("Two sessions on the same day overlap.")
        return items


class TimeBlockSerializer(serializers.ModelSerializer):
    start = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])
    end = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])

    class Meta:
        model = TimeBlock
        fields = ["id", "date", "start", "end", "reason"]


class LeaveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Leave
        fields = ["id", "date", "reason"]
