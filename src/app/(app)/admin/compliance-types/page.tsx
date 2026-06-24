import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ComplianceTypesManager } from "./compliance-types-manager";

export default async function ComplianceTypesPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");
  return <ComplianceTypesManager />;
}
