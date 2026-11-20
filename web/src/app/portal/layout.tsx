import { PortalShell } from "@/components/portal";
import { RequireAuth } from "@/components/require-auth";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Doctor portal" };

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6">
        <RequireAuth roles={["doctor", "admin"]}>
          <PortalShell>{children}</PortalShell>
        </RequireAuth>
      </main>
    </>
  );
}
