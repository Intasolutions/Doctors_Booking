from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import admin_api, views

router = DefaultRouter()
router.register("doctors", views.DoctorViewSet, basename="doctor")
router.register("me/patients", views.MyPatientsViewSet, basename="my-patient")
router.register("me/appointments", views.MyAppointmentsViewSet, basename="my-appointment")

urlpatterns = [
    path("meta/", views.MetaView.as_view(), name="meta"),
    path("", include(router.urls)),
    path("doctor/profile/", views.DoctorProfileView.as_view()),
    path("doctor/day/", views.DoctorDayView.as_view()),
    path("doctor/appointments/<str:code>/status/", views.DoctorAppointmentStatusView.as_view()),
    path("doctor/walkins/", views.DoctorWalkinView.as_view()),
    path("doctor/schedule/", views.DoctorScheduleView.as_view()),
    path("doctor/blocks/", views.DoctorBlocksView.as_view()),
    path("doctor/blocks/<int:pk>/", views.DoctorBlockDeleteView.as_view()),
    path("doctor/leaves/", views.DoctorLeavesView.as_view()),
    path("doctor/leaves/<int:pk>/", views.DoctorLeaveDeleteView.as_view()),
    # Admin portal ("god mode")
    path("admin/stats/", admin_api.StatsView.as_view()),
    path("admin/doctors/", admin_api.AdminDoctorsView.as_view()),
    path("admin/doctors/<slug:slug>/", admin_api.AdminDoctorDetailView.as_view()),
    path("admin/doctors/<slug:slug>/restore/", admin_api.AdminDoctorRestoreView.as_view()),
    path("admin/appointments/", admin_api.AdminAppointmentsView.as_view()),
    path("admin/appointments/<str:code>/<str:action>/", admin_api.AdminAppointmentActionView.as_view()),
    path("admin/patients/lookup/", admin_api.AdminPatientLookupView.as_view()),
    path("admin/users/", admin_api.AdminUsersView.as_view()),
    path("admin/users/<int:pk>/", admin_api.AdminUserDetailView.as_view()),
    path("admin/messages/", admin_api.AdminMessagesView.as_view()),
]
