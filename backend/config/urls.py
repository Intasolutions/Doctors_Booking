from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

admin.site.site_header = "CareSlot admin"
admin.site.site_title = "CareSlot admin"
admin.site.index_title = "Doctors, patients and bookings"


def health(_request):
    return JsonResponse({"ok": True})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    path("api/auth/", include("accounts.urls")),
    path("api/whatsapp/", include("whatsapp.urls")),
    path("api/", include("clinic.urls")),
]
