"use client";

/** Opens the doctor portal (queue, hours, leave) for one doctor. */
export function openDoctorPortal(slug: string) {
  try {
    localStorage.setItem("careslot.portal.doctor", slug);
  } catch {}
}
