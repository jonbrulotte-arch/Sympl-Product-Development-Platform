import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WorkflowTemplatesManager } from "./workflow-templates-manager";

export default async function WorkflowTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");
  return <WorkflowTemplatesManager />;
}
