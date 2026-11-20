import re

from django.conf import settings


def normalize_phone(raw: str) -> str:
    """Return digits only with country code: '+91 98470 12345' -> '919847012345'.

    A 10-digit number is treated as Indian and gets the default country code.
    """
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = settings.CARESLOT["DEFAULT_COUNTRY_CODE"] + digits
    return digits


def is_valid_phone(raw: str) -> bool:
    return 11 <= len(normalize_phone(raw)) <= 15


def pretty_phone(digits: str) -> str:
    if digits and len(digits) == 12 and digits.startswith("91"):
        return f"+91 {digits[2:7]} {digits[7:]}"
    return f"+{digits}" if digits else ""
