"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

import { Spinner } from "./ui";

export function RequireAuth({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const allowed = !!user && (!roles || roles.includes(user.role));
  const incomplete = !!user && user.role === "patient" && !user.profile_complete;

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(path)}${roles && !roles.includes("patient") ? "&as=staff" : ""}`);
    else if (incomplete) router.replace(`/register?next=${encodeURIComponent(path)}`);
  }, [ready, user, router, path, roles, incomplete]);

  if (!ready || !user || incomplete) return <Spinner />;
  if (!allowed)
    return <p className="py-10 text-sm text-muted">This page is for {roles?.join(" or ")} accounts. Sign in with a different account to open it.</p>;
  return <>{children}</>;
}
