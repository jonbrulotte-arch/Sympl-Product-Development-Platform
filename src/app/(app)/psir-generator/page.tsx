import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PsirGeneratorClient } from "./psir-generator-client";

export default async function PsirGeneratorPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "psir_generator:use"))) redirect("/dashboard");

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true, parentId: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PSIR Generator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Build a Pre-Shipment Inspection Report from the Global and Category PSIR templates and download it as Excel.
        </p>
      </div>
      <PsirGeneratorClient categories={categories} />
    </div>
  );
}
