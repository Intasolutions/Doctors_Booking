"use client";

import { DateInput } from "./date-time-inputs";
import { Field, Segmented, useFocusOnMount } from "./ui";

export type ProfileValues = { name: string; gender: string; date_of_birth: string; email: string; consent: boolean };

export const emptyProfile: ProfileValues = { name: "", gender: "", date_of_birth: "", email: "", consent: false };

export function profileErrors(v: ProfileValues): string {
  if (v.name.trim().length < 2) return "Enter your full name.";
  if (!v.gender) return "Choose your gender.";
  if (!v.date_of_birth) return "Enter your date of birth.";
  if (!v.consent) return "Please agree to share your details with the doctors you book.";
  return "";
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The registration details every patient account needs. */
export function ProfileFields({
  value,
  onChange,
  errors = {},
  showConsent = true,
  afterName,
  autoFocus,
}: {
  value: ProfileValues;
  onChange: (v: ProfileValues) => void;
  errors?: Record<string, string>;
  showConsent?: boolean;
  afterName?: React.ReactNode;
  /** Put the cursor in the name field straight away (registration). */
  autoFocus?: boolean;
}) {
  const nameRef = useFocusOnMount<HTMLInputElement>(!!autoFocus);
  const set = (k: keyof ProfileValues, v: string | boolean) => onChange({ ...value, [k]: v });
  return (
    <>
      <Field label="Full name" htmlFor="rname" error={errors.name}>
        <input id="rname" className="input" autoComplete="name" value={value.name} onChange={(e) => set("name", e.target.value)} required ref={nameRef} />
      </Field>
      {afterName}
      <div className="grid gap-1.5">
        <span className="text-[13px] font-semibold">Gender</span>
        <Segmented
          value={value.gender}
          onChange={(g) => set("gender", g)}
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
            { value: "other", label: "Other" },
          ]}
        />
        {errors.gender && <p className="text-xs font-medium text-red-700">{errors.gender}</p>}
      </div>
      <Field label="Date of birth" htmlFor="rdob" error={errors.date_of_birth} hint="Doctors use your age when they see you.">
        <DateInput id="rdob" value={value.date_of_birth} onChange={(v) => set("date_of_birth", v)} min="1900-01-01" max={todayISO()} required />
      </Field>
      <Field label="Email (optional)" htmlFor="remail" error={errors.email}>
        <input id="remail" type="email" className="input" autoComplete="email" value={value.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      {showConsent && (
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={value.consent} onChange={(e) => set("consent", e.target.checked)} />
          <span>
            I agree to share these details with the doctors I book, and to get booking messages on WhatsApp.
            {errors.consent && <span className="block text-xs font-medium text-red-700">{errors.consent}</span>}
          </span>
        </label>
      )}
    </>
  );
}
