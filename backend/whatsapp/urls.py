from django.urls import path

from . import views

urlpatterns = [
    path("webhook/", views.webhook, name="whatsapp-webhook"),
    path("simulate/", views.SimulatorView.as_view(), name="whatsapp-simulate"),
]
