import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SalsifySettingsClient } from "./salsify-settings-client";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/");

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure integrations and system settings</p>
      </div>
      <SalsifySettingsClient />
    </div>
  );
}
