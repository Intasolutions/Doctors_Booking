from django.contrib import admin

from .models import Appointment, Doctor, Leave, Patient, Session, TimeBlock


class SessionInline(admin.TabularInline):
    model = Session
    extra = 1


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "specialty", "area", "fee", "slot_minutes", "is_active")
    list_filter = ("is_active", "specialty", "area")
    search_fields = ("user__first_name", "user__last_name", "code", "specialty", "area")
    autocomplete_fields = ("user",)
    inlines = [SessionInline]
    readonly_fields = ("whatsapp_link",)
    fieldsets = (
        (None, {"fields": ("user", "code", "slug", "is_active", "notify_whatsapp", "whatsapp_link")}),
        ("Profile", {"fields": ("specialty", "qualifications", "experience_years", "languages", "about")}),
        ("Clinic", {"fields": ("area", "city", "address", "maps_url", ("latitude", "longitude"), "fee", "slot_minutes"),
                    "description": "Latitude and longitude put the clinic in 'doctors near me'. Copy them from Google Maps "
                                   "(right-click the clinic → the numbers at the top), or let the doctor set them from the portal."}),
    )

    def get_readonly_fields(self, request, obj=None):
        return self.readonly_fields + (("slug",) if obj else ())


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("name", "age", "phone", "relation", "account", "created_at")
    search_fields = ("name", "phone")
    raw_id_fields = ("account",)


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("code", "date", "start", "doctor", "patient", "status", "source", "patient_confirmed")
    list_filter = ("status", "source", "doctor", "date")
    search_fields = ("code", "patient__name", "patient__phone")
    date_hierarchy = "date"
    raw_id_fields = ("patient",)
    readonly_fields = ("code", "created_at", "updated_at", "reminder_sent_at")


@admin.register(TimeBlock)
class TimeBlockAdmin(admin.ModelAdmin):
    list_display = ("doctor", "date", "start", "end", "reason")
    list_filter = ("doctor",)


@admin.register(Leave)
class LeaveAdmin(admin.ModelAdmin):
    list_display = ("doctor", "date", "reason")
    list_filter = ("doctor",)
