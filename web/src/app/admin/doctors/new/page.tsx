"use client";

import { AdminDoctorForm } from "@/components/admin-doctor-form";
import { PageHeader } from "@/components/page-header";

export default function NewDoctorPage() {
  return (
    <>
      <PageHeader back={{ href: "/admin/doctors", label: "All doctors" }} title="Add a doctor" description="After saving, set their weekly hours so patients can book." />
      <AdminDoctorForm />
    </>
  );
}
