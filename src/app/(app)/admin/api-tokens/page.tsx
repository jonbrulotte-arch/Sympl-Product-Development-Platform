import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ApiTokensClient } from "./api-tokens-client";

export default async function ApiTokensPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) redirect("/dashboard");
  return <ApiTokensClient />;
}
