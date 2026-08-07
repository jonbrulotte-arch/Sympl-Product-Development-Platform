import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isInspectionsEnabled } from "@/lib/app-config";
import { PsirAttributesManager } from "./psir-attributes-manager";

export default async function PsirAttributesPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:psir_attributes"))) redirect("/dashboard");
  if (!(await isInspectionsEnabled())) redirect("/dashboard");
  return <PsirAttributesManager />;
}
