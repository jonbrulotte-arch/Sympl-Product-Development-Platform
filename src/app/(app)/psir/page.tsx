import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PsirBrowser } from "./psir-browser";

export default async function PsirPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <PsirBrowser />;
}
