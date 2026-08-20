import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { EventLogClient } from "./event-log-client";

export default async function EventLogPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:event_log"))) redirect("/dashboard");

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const projects = await prisma.project.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Event Log</h1>
        <p className="text-sm text-gray-500 mt-1">Platform-wide audit trail of every action. Click any row for details.</p>
      </div>
      <EventLogClient users={users} projects={projects} />
    </div>
  );
}
