import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ComplianceDetailClient } from "./compliance-detail-client";

export const dynamic = "force-dynamic";

export default async function ComplianceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  return <ComplianceDetailClient eventId={id} userRole={session.user.role} />;
}
