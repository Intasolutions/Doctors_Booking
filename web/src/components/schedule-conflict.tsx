"use client";

import { ApiError } from "@/lib/api";

import { ConfirmDialog } from "./confirm-dialog";

export type AffectedBooking = { code: string; date: string; time: string; when: string; patient: string };

/** Bookings a change of hours or time per patient would cancel (the API answers 409 with them). */
export function affectedFrom(e: unknown): AffectedBooking[] | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const list = (e.data as { affected?: unknown } | null)?.affected;
  return Array.isArray(list) ? (list as AffectedBooking[]) : null;
}

/** Asks before saving hours that leave booked patients out. */
export function ScheduleConflictDialog({
  affected,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  affected: AffectedBooking[];
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const n = affected.length;
  return (
    <ConfirmDialog
      title={`Cancel ${n} booking${n > 1 ? "s" : ""}?`}
      confirmLabel={`Cancel ${n > 1 ? "them" : "it"} and save`}
      loading={loading}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="grid gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-900">
        <p className="font-semibold">
          The new times leave out {n} booked patient{n > 1 ? "s" : ""}. Saving cancels {n > 1 ? "these visits" : "this visit"} and tells{" "}
          {n > 1 ? "each patient" : "the patient"} on WhatsApp:
        </p>
        <ul className="list-disc pl-5 text-[13px]">
          {affected.slice(0, 8).map((a) => (
            <li key={a.code}>
              {a.when} · {a.patient} ({a.code})
            </li>
          ))}
          {n > 8 && <li>and {n - 8} more</li>}
        </ul>
      </div>
      <p className="text-muted">Go back to keep the current hours.</p>
    </ConfirmDialog>
  );
}
