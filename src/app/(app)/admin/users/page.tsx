import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, image: true, role: true,
      isActive: true, createdAt: true, updatedAt: true,
    },
    orderBy: { name: "asc" },
  });

  return <UsersClient initialUsers={users} />;
}
