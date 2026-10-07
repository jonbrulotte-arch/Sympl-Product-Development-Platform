import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PsirTemplatesManager } from "./psir-templates-manager";

export default async function PsirTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:psir_templates"))) redirect("/dashboard");

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true, parentId: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PSIR Templates</h1>
        <p className="text-sm text-gray-500 mt-1">
          Global PSIR lines, with Category and Sub-Category overrides and additions used by the PSIR Generator.
        </p>
      </div>
      <PsirTemplatesManager categories={categories} />
    </div>
  );
}
