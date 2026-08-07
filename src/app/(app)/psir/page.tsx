import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isInspectionsEnabled } from "@/lib/app-config";
import { PsirBrowser } from "./psir-browser";

export default async function PsirPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isInspectionsEnabled())) redirect("/dashboard");
  return <PsirBrowser />;
}
