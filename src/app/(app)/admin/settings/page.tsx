import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SalsifySettingsClient } from "./salsify-settings-client";
import { WorkflowTemplatesClient } from "./workflow-templates-client";
import { ProjectStatusesClient } from "./project-statuses-client";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/");

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure integrations, workflows, and system behaviour</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Project Statuses</h2>
        <ProjectStatusesClient />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Workflow</h2>
        <WorkflowTemplatesClient />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Integrations</h2>
        <SalsifySettingsClient />
      </section>
    </div>
  );
}
