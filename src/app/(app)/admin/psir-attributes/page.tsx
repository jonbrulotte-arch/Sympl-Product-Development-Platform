import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PsirAttributesManager } from "./psir-attributes-manager";

export default async function PsirAttributesPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");
  return <PsirAttributesManager />;
}
