import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { TransferOwnershipClient } from "./transfer-ownership-client";

export default async function TransferOwnershipPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:users"))) redirect("/dashboard");

  return <TransferOwnershipClient />;
}
