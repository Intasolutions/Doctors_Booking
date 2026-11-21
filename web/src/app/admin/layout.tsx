import { RequireAuth } from "@/components/require-auth";
import { WorkspaceShell } from "@/components/workspace-shell";

export const metadata = { title: "Admin" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RequireAuth roles={["admin"]}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </RequireAuth>
  );
}
