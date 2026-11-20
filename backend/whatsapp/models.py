from datetime import timedelta

from django.db import models
from django.utils import timezone


class Conversation(models.Model):
    """Bot state for one WhatsApp number."""

    phone = models.CharField(max_length=15, unique=True)
    profile_name = models.CharField(max_length=120, blank=True)
    state = models.JSONField(default=dict, blank=True)
    # Meta allows free-form (non-template) messages only within 24 hours of
    # the user's last message.
    last_inbound_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.phone

    @property
    def window_open(self) -> bool:
        return bool(self.last_inbound_at and timezone.now() - self.last_inbound_at < timedelta(hours=23, minutes=50))


class MessageLog(models.Model):
    class Direction(models.TextChoices):
        IN = "in", "Incoming"
        OUT = "out", "Outgoing"

    direction = models.CharField(max_length=3, choices=Direction.choices)
    phone = models.CharField(max_length=15, db_index=True)
    kind = models.CharField(max_length=20, help_text="text, interactive, template, button…")
    summary = models.TextField(blank=True, help_text="Readable text of the message")
    payload = models.JSONField(default=dict, blank=True)
    wa_id = models.CharField(max_length=128, blank=True, db_index=True)
    status = models.CharField(max_length=20, blank=True, help_text="console, sent, delivered, read, failed")
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.direction} {self.phone} {self.kind}"
