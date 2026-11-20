from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

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
    path("admin/doctors/", views.AdminDoctorsView.as_view()),
]
