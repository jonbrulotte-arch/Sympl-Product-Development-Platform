import { redirect } from "next/navigation";

// The notifications page grew into the Inbox — keep old links working.
export default function NotificationsPage() {
  redirect("/inbox");
}
