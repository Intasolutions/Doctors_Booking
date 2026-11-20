import hashlib
import hmac
import json
import logging

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import serializers, status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.phone import is_valid_phone, normalize_phone

from . import client
from .bot import handle_incoming
from .models import MessageLog

log = logging.getLogger("careslot")


def _signature_ok(request) -> bool:
    secret = settings.WHATSAPP["APP_SECRET"]
    if not secret:
        # Allowed only while testing locally; set WHATSAPP_APP_SECRET in production.
        return settings.DEBUG
    sent = request.headers.get("X-Hub-Signature-256", "")
    expected = "sha256=" + hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sent, expected)


def _parse_message(msg: dict) -> dict:
    t = msg.get("type")
    out = {"wa_id": msg.get("id", ""), "kind": t or "unknown", "text": "", "reply_id": "", "reply_title": "", "location": None}
    if t == "text":
        out["text"] = msg.get("text", {}).get("body", "")
    elif t == "interactive":
        inter = msg.get("interactive", {})
        reply = inter.get("button_reply") or inter.get("list_reply") or {}
        out.update(reply_id=reply.get("id", ""), reply_title=reply.get("title", ""))
    elif t == "location":
        loc = msg.get("location", {})
        try:
            out["location"] = (float(loc["latitude"]), float(loc["longitude"]))
        except (KeyError, TypeError, ValueError):
            out["kind"] = "unknown"
    elif t == "button":  # quick-reply on a template
        b = msg.get("button", {})
        out.update(reply_id=b.get("payload", ""), reply_title=b.get("text", ""))
    else:
        out["text"] = ""
    return out


@csrf_exempt
def webhook(request):
    cfg = settings.WHATSAPP
    if request.method == "GET":
        # Meta's one-time verification handshake.
        if (request.GET.get("hub.mode") == "subscribe"
                and request.GET.get("hub.verify_token") == cfg["VERIFY_TOKEN"]):
            return HttpResponse(request.GET.get("hub.challenge", ""), content_type="text/plain")
        return HttpResponseForbidden("Verification failed")

    if request.method != "POST":
        return HttpResponse(status=405)
    if not _signature_ok(request):
        log.warning("Rejected WhatsApp webhook with a bad signature")
        return HttpResponseForbidden("Bad signature")

    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return HttpResponse(status=400)

    # Always answer 200 quickly: Meta retries anything else, which would make
    # the bot reply twice.
    for entry in data.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            names = {c.get("wa_id"): c.get("profile", {}).get("name", "") for c in value.get("contacts", [])}
            for st in value.get("statuses", []):
                MessageLog.objects.filter(wa_id=st.get("id", ""), direction="out").update(status=st.get("status", ""))
            for msg in value.get("messages", []):
                phone = normalize_phone(msg.get("from", ""))
                m = _parse_message(msg)
                if m["wa_id"] and MessageLog.objects.filter(direction="in", wa_id=m["wa_id"]).exists():
                    continue  # duplicate delivery
                if m["kind"] not in ("text", "interactive", "button", "location"):
                    client.send_text(phone, "I can only read text and button replies. Send MENU to see the options.")
                    MessageLog.objects.create(direction="in", phone=phone, kind=m["kind"], wa_id=m["wa_id"], status="received")
                    continue
                handle_incoming(phone, text=m["text"], reply_id=m["reply_id"], reply_title=m["reply_title"],
                                profile_name=names.get(msg.get("from"), ""), wa_id=m["wa_id"], kind=m["kind"],
                                location=m["location"])
    return JsonResponse({"ok": True})


# --------------------------------------------------------------------------
# Admin simulator: chat with the bot as any phone number, without Meta.
# --------------------------------------------------------------------------

class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.role == "admin" or u.is_superuser))


class SimulateSerializer(serializers.Serializer):
    phone = serializers.CharField()
    text = serializers.CharField(required=False, allow_blank=True, default="")
    reply_id = serializers.CharField(required=False, allow_blank=True, default="")
    reply_title = serializers.CharField(required=False, allow_blank=True, default="")
    profile_name = serializers.CharField(required=False, allow_blank=True, default="")
    latitude = serializers.FloatField(required=False, min_value=-90, max_value=90)
    longitude = serializers.FloatField(required=False, min_value=-180, max_value=180)

    def validate_phone(self, v):
        if not is_valid_phone(v):
            raise serializers.ValidationError("Enter a phone number with country code.")
        return normalize_phone(v)


def _log_json(m: MessageLog):
    return {"id": m.id, "direction": m.direction, "kind": m.kind, "summary": m.summary, "payload": m.payload,
            "status": m.status, "created_at": m.created_at.isoformat()}


class SimulatorView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        phone = normalize_phone(request.query_params.get("phone", ""))
        msgs = MessageLog.objects.filter(phone=phone).order_by("-created_at", "-id")[:150] if phone else []
        return Response({"console_mode": client.console_mode(), "messages": [_log_json(m) for m in reversed(list(msgs))]})

    def post(self, request):
        if not client.console_mode():
            return Response({"detail": "The simulator only works while WhatsApp is in console mode (no WHATSAPP_TOKEN). "
                                       "With a live number, test from a real phone."}, status=status.HTTP_400_BAD_REQUEST)
        s = SimulateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        loc = (d["latitude"], d["longitude"]) if "latitude" in d and "longitude" in d else None
        if not (d["text"].strip() or d["reply_id"] or loc):
            return Response({"detail": "Send text, a reply_id or a location."}, status=status.HTTP_400_BAD_REQUEST)
        last = MessageLog.objects.filter(phone=d["phone"]).order_by("-id").values_list("id", flat=True).first() or 0
        handle_incoming(d["phone"], text=d["text"], reply_id=d["reply_id"], reply_title=d["reply_title"],
                        profile_name=d["profile_name"], location=loc,
                        kind="location" if loc else "interactive" if d["reply_id"] else "text")
        new = MessageLog.objects.filter(phone=d["phone"], id__gt=last).order_by("id")
        return Response({"messages": [_log_json(m) for m in new]})
