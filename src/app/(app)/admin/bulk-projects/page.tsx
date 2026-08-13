import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { BulkProjectsClient } from "./bulk-projects-client";

export default async function BulkProjectsPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "projects:transfer_ownership"))) {
    redirect("/dashboard");
  }

  return <BulkProjectsClient isAdmin={session.user.role === "ADMIN"} />;
}
