import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductsBrowser } from "./products-browser";

export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  // Load projects for the filter dropdown
  const projects = await prisma.project.findMany({
    where: {
      isArchived: false,
      ...(!isAdmin
        ? { OR: [{ ownerId: userId }, { members: { some: { userId } } }] }
        : {}),
    },
    select: { id: true, name: true, brand: true },
    orderBy: { name: "asc" },
  });

  // Load categories for the filter dropdown
  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Distinct inventory statuses in use (both fields)
  const [statusRows, erpStatusRows] = await Promise.all([
    prisma.productRecord.findMany({
      where: { isArchived: false, inventoryStatus: { not: null } },
      select: { inventoryStatus: true },
      distinct: ["inventoryStatus"],
    }),
    prisma.productRecord.findMany({
      where: { isArchived: false, inventoryStatusErp: { not: null } },
      select: { inventoryStatusErp: true },
      distinct: ["inventoryStatusErp"],
    }),
  ]);
  const inventoryStatuses = [...new Set([
    ...statusRows.flatMap((r) => r.inventoryStatus!.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)),
    ...erpStatusRows.flatMap((r) => r.inventoryStatusErp!.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)),
  ])].sort();

  return (
    <ProductsBrowser
      projects={projects}
      categories={categories}
      inventoryStatuses={inventoryStatuses}
    />
  );
}
