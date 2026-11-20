from math import asin, cos, radians, sin, sqrt


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points (haversine)."""
    lat1, lng1, lat2, lng2 = map(radians, (lat1, lng1, lat2, lng2))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(a))


def parse_point(lat, lng) -> tuple[float, float] | None:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def by_distance(doctors, point: tuple[float, float] | None) -> tuple[list, dict]:
    """Sort doctors nearest first. Doctors without a clinic position go last.

    Returns (doctors, {doctor_id: km})."""
    doctors = list(doctors)
    if not point:
        return doctors, {}
    km = {d.id: distance_km(point[0], point[1], d.latitude, d.longitude)
          for d in doctors if d.latitude is not None and d.longitude is not None}
    doctors.sort(key=lambda d: (d.id not in km, km.get(d.id, 0)))
    return doctors, km


def age_from_dob(dob, today) -> int:
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
