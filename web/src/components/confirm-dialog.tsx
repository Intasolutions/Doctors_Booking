"use client";

import { useState } from "react";

import { Button, ErrorNote, Modal } from "./ui";

/**
 * Asks before anything that can't be undone. With `typeToConfirm`, the button
 * stays disabled until that word is typed, for the most dangerous actions.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = true,
  typeToConfirm,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  typeToConfirm?: string;
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ready = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm;
  return (
    <Modal title={title} onClose={onClose}>
      <div className="grid gap-3 text-sm leading-relaxed">{children}</div>
      {typeToConfirm && (
        <label className="grid gap-1.5 text-sm">
          <span>
            Type <b className="font-mono">{typeToConfirm}</b> to confirm
          </span>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
        </label>
      )}
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>Go back</Button>
        <Button variant={danger ? "dangerSolid" : "primary"} disabled={!ready} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
