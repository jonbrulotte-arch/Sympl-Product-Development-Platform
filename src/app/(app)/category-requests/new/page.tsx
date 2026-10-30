import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { CategoryRequestForm } from "@/components/category-requests/request-form";

export default async function NewCategoryRequestPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.role, "categories:request"))) redirect("/category-requests");
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, name: true, parentId: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Category Request</h1>
        <p className="text-sm text-gray-500 mt-1">Admins and Directors are notified and will review it.</p>
      </div>
      <CategoryRequestForm categories={categories} />
    </div>
  );
}
