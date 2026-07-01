import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPermissionMatrix, PERMISSIONS, ROLES } from "@/lib/permissions";
import { AccessControlClient } from "./access-control-client";

export default async function AccessControlPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  const matrix = await getPermissionMatrix();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Access Control</h1>
        <p className="text-sm text-gray-500 mt-1">Configure which roles can access each feature. Changes take effect within 30 seconds.</p>
      </div>
      <AccessControlClient matrix={matrix} permissions={PERMISSIONS} roles={[...ROLES]} />
    </div>
  );
}
