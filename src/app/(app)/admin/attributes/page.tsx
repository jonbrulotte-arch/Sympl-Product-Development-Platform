import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AttributesClient } from "./attributes-client";

export default async function AttributesPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  const attributes = await prisma.attributeDefinition.findMany({
    where: { isActive: true },
    include: {
      section: true,
      category: true,
      lovItems: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return <AttributesClient initialAttributes={attributes as never} categories={categories} />;
}
