import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BackupClient } from "./backup-client";

export default async function BackupPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:backup"))) redirect("/");
  return <BackupClient />;
}
