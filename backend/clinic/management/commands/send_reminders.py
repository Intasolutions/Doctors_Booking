from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from clinic import notifications
from clinic.models import Appointment
from clinic.services import appointment_datetime


class Command(BaseCommand):
    help = "Send WhatsApp reminders for visits in the next 24 hours. Run every hour (Render cron job)."

    def add_arguments(self, parser):
        parser.add_argument("--hours", type=int, default=24)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, hours, dry_run, **opts):
        now = timezone.now()
        until = now + timedelta(hours=hours)
        qs = (Appointment.objects.filter(status=Appointment.Status.CONFIRMED, reminder_sent_at__isnull=True,
                                         date__gte=timezone.localdate(), date__lte=timezone.localdate(until))
              .exclude(patient__phone="").select_related("patient", "doctor__user"))
        sent = 0
        for a in qs:
            at = appointment_datetime(a)
            # Skip visits that already started, and bookings made in the last
            # 3 hours: those patients just got a confirmation.
            if not (now < at <= until) or a.created_at > now - timedelta(hours=3):
                continue
            if dry_run:
                self.stdout.write(f"Would remind {a}")
            else:
                notifications.reminder(a)
            sent += 1
        self.stdout.write(self.style.SUCCESS(f"{'Found' if dry_run else 'Sent'} {sent} reminder(s)."))
