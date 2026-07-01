import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "./sidebar";
import { getGrantedPermissions } from "@/lib/permissions";
import type { SafeUser } from "@/types";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const grantedPermissions = await getGrantedPermissions(session.user.role);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar user={session.user as unknown as SafeUser} grantedPermissions={grantedPermissions} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
