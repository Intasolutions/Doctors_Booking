import { PortalShell } from "@/components/portal";
import { RequireAuth } from "@/components/require-auth";
import { WorkspaceShell } from "@/components/workspace-shell";

export const metadata = { title: "Doctor portal" };

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <RequireAuth roles={["doctor", "admin"]}>
      <WorkspaceShell>
        <PortalShell>{children}</PortalShell>
      </WorkspaceShell>
    </RequireAuth>
  );
}
