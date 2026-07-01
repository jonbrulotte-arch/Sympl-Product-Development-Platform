import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ComplianceBrowser } from "./compliance-browser";

export default async function CompliancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <ComplianceBrowser />;
}
