export const PENDING_SLOT = "careslot.pending";

/** Remember a time picked on one page so the doctor page opens with it selected. */
export function rememberSlot(slug: string, date: string, time: string) {
  try {
    sessionStorage.setItem(PENDING_SLOT, JSON.stringify({ slug, date, time }));
  } catch {}
}
