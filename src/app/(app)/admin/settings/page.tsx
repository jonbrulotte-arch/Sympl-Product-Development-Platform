import { can } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SalsifySettingsClient } from "./salsify-settings-client";
import { SmtpSettingsClient } from "./smtp-settings-client";
import { ProjectStatusesClient } from "./project-statuses-client";
import { ModulesSettingsClient } from "./modules-settings-client";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) redirect("/");

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure integrations and system behaviour</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Project Statuses</h2>
        <ProjectStatusesClient />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Email</h2>
        <SmtpSettingsClient />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Integrations</h2>
        <SalsifySettingsClient />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Modules</h2>
        <ModulesSettingsClient />
      </section>
    </div>
  );
}
