import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from .phone import normalize_phone


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        DOCTOR = "doctor", "Doctor"
        PATIENT = "patient", "Patient"

    role = models.CharField(max_length=10, choices=Role.choices, default=Role.PATIENT)
    # Digits only with country code, e.g. 919847012345. Used for OTP login,
    # WhatsApp messages, and recognising doctors who message the bot.
    phone = models.CharField(max_length=15, unique=True, null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.phone:
            self.phone = normalize_phone(self.phone)
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    @property
    def display_name(self):
        return self.get_full_name() or self.username


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


class PhoneOTP(models.Model):
    phone = models.CharField(max_length=15, db_index=True)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    MAX_ATTEMPTS = 5

    @classmethod
    def issue(cls, phone: str) -> tuple["PhoneOTP", str]:
        code = f"{secrets.randbelow(1_000_000):06d}"
        cls.objects.filter(phone=phone, used=False).update(used=True)
        ttl = settings.CARESLOT["OTP_TTL_MINUTES"]
        otp = cls.objects.create(
            phone=phone, code_hash=_hash(code), expires_at=timezone.now() + timedelta(minutes=ttl)
        )
        return otp, code

    @classmethod
    def verify(cls, phone: str, code: str) -> bool:
        otp = cls.objects.filter(phone=phone, used=False).order_by("-created_at").first()
        if not otp or otp.expires_at < timezone.now() or otp.attempts >= cls.MAX_ATTEMPTS:
            return False
        if secrets.compare_digest(otp.code_hash, _hash(code.strip())):
            otp.used = True
            otp.save(update_fields=["used"])
            return True
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        return False
