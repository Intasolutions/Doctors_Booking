"""Thin wrapper over the WhatsApp Cloud API.

With no WHATSAPP_TOKEN configured the client runs in console mode: messages are
written to MessageLog (status "console") and printed, nothing goes to Meta.
WhatsApp limits are enforced here so the bot can never send a payload Meta
would reject (3 reply buttons, 20-char button titles, 10 list rows, …).
"""

import logging

import requests
from django.conf import settings

from .models import MessageLog

log = logging.getLogger("careslot")


def clip(s: str, n: int) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def console_mode() -> bool:
    cfg = settings.WHATSAPP
    return not (cfg["TOKEN"] and cfg["PHONE_NUMBER_ID"])


def _post(phone: str, body: dict, kind: str, summary: str) -> MessageLog:
    entry = MessageLog(direction="out", phone=phone, kind=kind, summary=summary, payload=body)
    if console_mode():
        entry.status = "console"
        entry.save()
        log.info("[whatsapp console] to %s: %s", phone, summary.replace("\n", " | "))
        return entry
    cfg = settings.WHATSAPP
    url = f"https://graph.facebook.com/{cfg['API_VERSION']}/{cfg['PHONE_NUMBER_ID']}/messages"
    try:
        r = requests.post(
            url,
            json={"messaging_product": "whatsapp", "recipient_type": "individual", "to": phone, **body},
            headers={"Authorization": f"Bearer {cfg['TOKEN']}"},
            timeout=15,
        )
        data = r.json() if r.content else {}
        if r.ok:
            entry.status = "sent"
            entry.wa_id = (data.get("messages") or [{}])[0].get("id", "")
        else:
            entry.status = "failed"
            entry.error = str(data.get("error") or data)[:2000]
            log.warning("WhatsApp send failed to %s: %s", phone, entry.error)
    except requests.RequestException as exc:
        entry.status = "failed"
        entry.error = str(exc)[:2000]
        log.warning("WhatsApp send error to %s: %s", phone, exc)
    entry.save()
    return entry


def send_text(phone: str, text: str) -> MessageLog:
    return _post(phone, {"type": "text", "text": {"body": clip(text, 4096), "preview_url": False}}, "text", text)


def send_buttons(phone: str, text: str, buttons: list[tuple[str, str]], *, header: str = "", footer: str = "") -> MessageLog:
    """buttons: [(id, title)], at most 3, titles up to 20 characters."""
    buttons = buttons[:3]
    interactive = {
        "type": "button",
        "body": {"text": clip(text, 1024)},
        "action": {"buttons": [{"type": "reply", "reply": {"id": bid[:256], "title": clip(t, 20)}} for bid, t in buttons]},
    }
    if header:
        interactive["header"] = {"type": "text", "text": clip(header, 60)}
    if footer:
        interactive["footer"] = {"text": clip(footer, 60)}
    summary = (f"*{header}*\n" if header else "") + text + "\n" + " ".join(f"[{t}]" for _, t in buttons)
    return _post(phone, {"type": "interactive", "interactive": interactive}, "buttons", summary)


def send_list(phone: str, text: str, button: str, sections: list[dict]) -> MessageLog:
    """sections: [{"title": str, "rows": [{"id", "title", "description"}]}]; 10 rows max in total."""
    left = 10
    clean = []
    for s in sections:
        rows = []
        for r in s["rows"][:left]:
            row = {"id": r["id"][:200], "title": clip(r["title"], 24)}
            if r.get("description"):
                row["description"] = clip(r["description"], 72)
            rows.append(row)
        left -= len(rows)
        if rows:
            clean.append({"title": clip(s.get("title", ""), 24), "rows": rows})
        if left <= 0:
            break
    interactive = {
        "type": "list",
        "body": {"text": clip(text, 4096)},
        "action": {"button": clip(button, 20), "sections": clean},
    }
    summary = text + f"\n[{button}: " + ", ".join(r["title"] for s in clean for r in s["rows"]) + "]"
    return _post(phone, {"type": "interactive", "interactive": interactive}, "list", summary)


def send_link(phone: str, text: str, label: str, url: str) -> MessageLog:
    interactive = {
        "type": "cta_url",
        "body": {"text": clip(text, 1024)},
        "action": {"name": "cta_url", "parameters": {"display_text": clip(label, 20), "url": url}},
    }
    return _post(phone, {"type": "interactive", "interactive": interactive}, "link", f"{text}\n[{label}: {url}]")


def send_location_request(phone: str, text: str) -> MessageLog:
    """Ask the user to share their location with WhatsApp's native button."""
    interactive = {"type": "location_request_message", "body": {"text": clip(text, 1024)}, "action": {"name": "send_location"}}
    return _post(phone, {"type": "interactive", "interactive": interactive}, "location_request", f"{text}\n[Send location]")


def send_template(phone: str, name: str, params: list[str], *, button_payloads: list[str] | None = None,
                  url_button_param: str | None = None, summary: str = "") -> MessageLog:
    """Send an approved template. Body variables {{1}}.. are filled from params.

    button_payloads fill quick-reply buttons in order; their payload comes back
    to the webhook when the user taps the button.
    """
    components = []
    if params:
        components.append({"type": "body", "parameters": [{"type": "text", "text": clip(str(p), 1000)} for p in params]})
    for i, payload in enumerate(button_payloads or []):
        components.append({"type": "button", "sub_type": "quick_reply", "index": str(i),
                           "parameters": [{"type": "payload", "payload": payload}]})
    if url_button_param is not None:
        components.append({"type": "button", "sub_type": "url", "index": "0",
                           "parameters": [{"type": "text", "text": url_button_param}]})
    body = {"type": "template", "template": {
        "name": name, "language": {"code": settings.WHATSAPP["TEMPLATE_LANGUAGE"]}, "components": components}}
    return _post(phone, body, "template", summary or f"[template {name}] " + " | ".join(map(str, params)))
