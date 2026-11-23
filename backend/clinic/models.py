from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils.text import slugify

from accounts.phone import normalize_phone

WEEKDAYS = [(0, "Mon"), (1, "Tue"), (2, "Wed"), (3, "Thu"), (4, "Fri"), (5, "Sat"), (6, "Sun")]
# Minutes per patient. Every form (Django admin, admin portal, doctor portal)
# offers only these; 0 would make the slot list endless.
SLOT_MINUTES = [5, 10, 15, 20, 30, 45, 60]


class Doctor(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="doctor")
    slug = models.SlugField(unique=True, blank=True)
    # The code patients send on WhatsApp, e.g. DR-ANITHA. Upper case, unique.
    code = models.CharField(max_length=20, unique=True, blank=True, help_text="Left empty, it is made from the first name, e.g. DR-ANITHA")
    specialty = models.CharField(max_length=80)
    qualifications = models.CharField(max_length=160, blank=True)
    experience_years = models.PositiveSmallIntegerField(default=0)
    about = models.TextField(blank=True)
    languages = models.CharField(max_length=120, blank=True, default="English")
    area = models.CharField(max_length=80, help_text="Locality shown to patients, e.g. Kadavanthra")
    city = models.CharField(max_length=80, default="Kochi")
    address = models.CharField(max_length=255)
    maps_url = models.URLField(blank=True, help_text="Google Maps link to the clinic")
    # Clinic position, used to show patients the doctors nearest to them.
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    fee = models.PositiveIntegerField(help_text="Consultation fee in rupees")
    slot_minutes = models.PositiveSmallIntegerField(default=15, choices=[(m, f"{m} minutes") for m in SLOT_MINUTES])
    is_active = models.BooleanField(default=True)
    notify_whatsapp = models.BooleanField(default=True, help_text="Send booking alerts to the doctor's WhatsApp")
    # Set when an admin deletes a doctor who has booking history: the doctor
    # disappears everywhere but past visits keep their records.
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["user__first_name"]

    def __str__(self):
        return self.name

    @property
    def name(self):
        return f"Dr. {self.user.get_full_name()}".strip()

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(f"dr-{self.user.first_name}-{self.user.last_name}") or "doctor"
            slug, n = base, 2
            while Doctor.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug, n = f"{base}-{n}", n + 1
            self.slug = slug
        if not self.code:
            base = f"DR-{slugify(self.user.first_name).upper() or 'DOC'}"
            code, n = base, 2
            while Doctor.objects.filter(code=code).exclude(pk=self.pk).exists():
                code, n = f"{base}{n}", n + 1
            self.code = code
        self.code = self.code.upper().replace(" ", "")
        super().save(*args, **kwargs)

    @property
    def whatsapp_link(self):
        return f"https://wa.me/{settings.WHATSAPP['BUSINESS_NUMBER']}?text={self.code}"

    @property
    def directions_url(self):
        if self.maps_url:
            return self.maps_url
        from urllib.parse import quote

        return f"https://www.google.com/maps/search/?api=1&query={quote(self.address)}"


class Session(models.Model):
    """A weekly consultation window, e.g. Mon 17:00-20:00."""

    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="sessions")
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAYS)
    start = models.TimeField()
    end = models.TimeField()

    class Meta:
        ordering = ["weekday", "start"]
        constraints = [models.CheckConstraint(condition=Q(end__gt=models.F("start")), name="session_end_after_start")]

    def __str__(self):
        return f"{self.get_weekday_display()} {self.start:%I:%M %p}-{self.end:%I:%M %p}".replace(" 0", " ")


class TimeBlock(models.Model):
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="blocks")
    date = models.DateField()
    start = models.TimeField()
    end = models.TimeField()
    reason = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "start"]
        constraints = [models.CheckConstraint(condition=Q(end__gt=models.F("start")), name="block_end_after_start")]


class Leave(models.Model):
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="leaves")
    date = models.DateField()
    reason = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]
        constraints = [models.UniqueConstraint(fields=["doctor", "date"], name="one_leave_per_day")]


class Patient(models.Model):
    """A person who sees the doctor. One account (phone) can hold several, e.g. family."""

    account = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="patients"
    )
    name = models.CharField(max_length=120)
    age = models.PositiveSmallIntegerField(null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, blank=True, choices=[("male", "Male"), ("female", "Female"), ("other", "Other")])
    relation = models.CharField(max_length=30, default="self", help_text="self, daughter, father…")
    # WhatsApp number that receives confirmations. Empty for some walk-ins.
    phone = models.CharField(max_length=15, blank=True, db_index=True)
    consent_at = models.DateTimeField(null=True, blank=True, help_text="When the patient agreed to data use (DPDP)")
    # Soft delete: a removed family member is hidden, but their past visits keep their name.
    removed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.phone:
            self.phone = normalize_phone(self.phone)
        if self.date_of_birth:
            from django.utils import timezone

            from .geo import age_from_dob

            self.age = age_from_dob(self.date_of_birth, timezone.localdate())
        super().save(*args, **kwargs)

    @property
    def current_age(self):
        if self.date_of_birth:
            from django.utils import timezone

            from .geo import age_from_dob

            return age_from_dob(self.date_of_birth, timezone.localdate())
        return self.age


class Appointment(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "confirmed", "Confirmed"
        CHECKED_IN = "checked_in", "Waiting"
        COMPLETED = "completed", "Seen"
        NO_SHOW = "no_show", "No-show"
        CANCELLED = "cancelled", "Cancelled"

    class Source(models.TextChoices):
        WEB = "web", "Website"
        APP = "app", "App"
        WHATSAPP = "whatsapp", "WhatsApp"
        WALKIN = "walkin", "Walk-in"
        ADMIN = "admin", "Admin"

    code = models.CharField(max_length=12, unique=True, null=True, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name="appointments")
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="appointments")
    date = models.DateField()
    start = models.TimeField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.CONFIRMED)
    source = models.CharField(max_length=10, choices=Source.choices)
    reason = models.CharField(max_length=200, blank=True)
    fee = models.PositiveIntegerField(default=0)
    patient_confirmed = models.BooleanField(default=False, help_text="Patient tapped 'I will come' on the reminder")
    cancelled_by = models.CharField(max_length=10, blank=True)
    cancel_reason = models.CharField(max_length=200, blank=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date", "start"]
        constraints = [
            # Database-level guard against double booking: only one live
            # appointment per doctor per slot. Cancelled ones don't count.
            models.UniqueConstraint(
                fields=["doctor", "date", "start"],
                condition=~Q(status="cancelled"),
                name="one_live_booking_per_slot",
            )
        ]
        indexes = [models.Index(fields=["doctor", "date"])]

    def __str__(self):
        return f"{self.code} {self.patient} with {self.doctor} on {self.date:%d/%m/%Y} {self.start:%I:%M %p}"

    @property
    def is_active(self):
        return self.status != self.Status.CANCELLED

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.code:
            # CS-1001, CS-1002… derived from the primary key so it is unique.
            self.code = f"CS-{1000 + self.pk}"
            super().save(update_fields=["code"])
