import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CategoriesClient } from "./categories-client";

export default async function AdminCategoriesPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:categories"))) redirect("/");

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true, projects: true } } },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <p className="text-gray-500 text-sm mt-1">Manage product categories used across projects</p>
      </div>
      <CategoriesClient initialCategories={categories as never} />
    </div>
  );
}
