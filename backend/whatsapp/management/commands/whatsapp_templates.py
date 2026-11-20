from django.core.management.base import BaseCommand

from whatsapp.templates import TEMPLATES


class Command(BaseCommand):
    help = "Print the message templates to create in Meta WhatsApp Manager."

    def handle(self, *args, **opts):
        for name, t in TEMPLATES.items():
            self.stdout.write(self.style.MIGRATE_HEADING(f"\n{name}  ({t['category']}, language: English)"))
            self.stdout.write(t["body"])
            for i, p in enumerate(t["params"], 1):
                self.stdout.write(f"  {{{{{i}}}}} = {p}")
            if t["buttons"]:
                self.stdout.write("  Quick-reply buttons: " + ", ".join(t["buttons"]))
