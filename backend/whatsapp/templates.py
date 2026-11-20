"""Message templates to submit in Meta WhatsApp Manager.

WhatsApp only allows free-form messages within 24 hours of the patient's last
message. Everything we send outside that window (reminders, confirmations for
website bookings, doctor alerts, login codes) must use one of these approved
templates. `python manage.py whatsapp_templates` prints them for submission.

Body variables are {{1}}, {{2}}… in the order of `params`. Quick-reply buttons
carry a payload that comes back to the webhook, e.g. "cancel:CS-1042".
"""

TEMPLATES = {
    "appointment_confirmed": {
        "category": "UTILITY",
        "body": "Hi {{1}}, your appointment with {{2}} is confirmed for {{3}}.\n\nBooking ID: {{4}}\nAddress: {{5}}\n\nPlease arrive 5 minutes early.",
        "params": ["patient first name", "doctor name", "date and time", "booking ID", "clinic address"],
        "buttons": ["Reschedule", "Cancel"],
    },
    "appointment_rescheduled": {
        "category": "UTILITY",
        "body": "Hi {{1}}, your appointment {{2}} with {{3}} has been moved to {{4}}.\n\nAddress: {{5}}",
        "params": ["patient first name", "booking ID", "doctor name", "new date and time", "clinic address"],
        "buttons": ["Reschedule", "Cancel"],
    },
    "appointment_reminder": {
        "category": "UTILITY",
        "body": "Reminder: {{1}}, you have an appointment with {{2}} on {{3}}.\n\nBooking ID: {{4}}\nAddress: {{5}}\n\nWill you be coming?",
        "params": ["patient first name", "doctor name", "date and time", "booking ID", "clinic address"],
        "buttons": ["Yes, I will come", "Reschedule", "Cancel"],
    },
    "appointment_cancelled": {
        "category": "UTILITY",
        "body": "Your appointment {{1}} with {{2}} on {{3}} has been cancelled.",
        "params": ["booking ID", "doctor name", "date and time"],
        "buttons": ["Book again"],
    },
    "doctor_unavailable": {
        "category": "UTILITY",
        "body": "Sorry {{1}}, {{2}} is not available on {{3}}. Your booking {{4}} has been cancelled and no fee applies.\n\nTap below to pick a new time.",
        "params": ["patient first name", "doctor name", "date and time", "booking ID"],
        "buttons": ["Pick a new time"],
    },
    "doctor_new_booking": {
        "category": "UTILITY",
        "body": "New booking {{1}}: {{2}} on {{3}}.\nReason: {{4}}\nBooked via {{5}}.",
        "params": ["booking ID", "patient name and age", "date and time", "reason", "channel"],
        "buttons": [],
    },
    "doctor_booking_changed": {
        "category": "UTILITY",
        "body": "Booking {{1}} ({{2}}) {{3}}.",
        "params": ["booking ID", "patient name", "what changed, e.g. 'was cancelled by the patient. The 5:30 PM slot is open again'"],
        "buttons": [],
    },
    "doctor_daily_summary": {
        "category": "UTILITY",
        "body": "Good morning {{1}}. Today you have {{2}} appointments. {{3}}\n\nReply TODAY for the full list.",
        "params": ["doctor name", "count", "first appointment line"],
        "buttons": [],
    },
    "login_otp": {
        "category": "AUTHENTICATION",
        "body": "{{1}} is your verification code. For your security, do not share this code.",
        "params": ["6-digit code"],
        "buttons": ["Copy code (OTP button)"],
    },
}
