import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ComplianceTypesManager } from "./compliance-types-manager";

export default async function ComplianceTypesPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:compliance_types"))) redirect("/dashboard");
  return <ComplianceTypesManager />;
}
