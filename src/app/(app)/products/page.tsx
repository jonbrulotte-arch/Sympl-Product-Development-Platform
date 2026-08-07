import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductsBrowser } from "./products-browser";
import { seesAllProjects } from "@/lib/permissions";
import { getInventoryStatuses } from "@/lib/filter-options";

export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;
  const isAdmin = seesAllProjects(session.user.role);

  // All three feed filter dropdowns and are independent — run them together
  // rather than waterfalling, since nothing renders until the slowest returns.
  const [projects, categories, inventoryStatuses] = await Promise.all([
    prisma.project.findMany({
      where: {
        isArchived: false,
        ...(!isAdmin
          ? { OR: [{ ownerId: userId }, { members: { some: { userId } } }] }
          : {}),
      },
      select: { id: true, name: true, brand: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
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
