from django.core.management.base import BaseCommand

from clinic import notifications
from clinic.models import Doctor
from clinic.services import slot_times, today


class Command(BaseCommand):
    help = "Send each doctor their morning WhatsApp summary. Run once a day, e.g. 7:00 AM IST."

    def handle(self, *args, **opts):
        n = 0
        for d in Doctor.objects.filter(is_active=True, notify_whatsapp=True).select_related("user"):
            if not d.user.phone or not slot_times(d, today()):
                continue  # no phone, or not a working day
            notifications.doctor_daily_summary(d)
            n += 1
        self.stdout.write(self.style.SUCCESS(f"Sent {n} summary message(s)."))
