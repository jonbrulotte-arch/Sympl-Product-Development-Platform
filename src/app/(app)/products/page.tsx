import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductsBrowser } from "./products-browser";
import { getInventoryStatuses } from "@/lib/filter-options";

export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  // All three feed filter dropdowns and are independent — run them together
  // rather than waterfalling, since nothing renders until the slowest returns.
  const [projects, categories, inventoryStatuses] = await Promise.all([
    prisma.project.findMany({
      // The catalog spans every project, so the filter lists them all.
      where: { isArchived: false },
      select: { id: true, name: true, brand: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      select: { id: true, name: true, parentId: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getInventoryStatuses(),
  ]);

  return (
    <ProductsBrowser
      projects={projects}
      categories={categories}
      inventoryStatuses={inventoryStatuses}
    />
  );
}
