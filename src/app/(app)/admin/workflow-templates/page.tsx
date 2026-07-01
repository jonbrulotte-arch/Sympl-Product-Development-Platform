import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WorkflowTemplatesManager } from "./workflow-templates-manager";

export default async function WorkflowTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:workflow_templates"))) redirect("/dashboard");
  return <WorkflowTemplatesManager />;
}
