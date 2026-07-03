"use client";

import { useState, useEffect, useCallback } from "react";
import { Inbox, CheckCheck, Info, AlertTriangle, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  category: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
};

const CATEGORY_TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "ASSIGNMENT", label: "Assignments" },
  { key: "WORKFLOW", label: "Workflow" },
  { key: "MENTION", label: "Mentions" },
  { key: "COMMENT", label: "Comments" },
  { key: "COMPLIANCE", label: "Compliance" },
  { key: "INSPECTION", label: "Inspections" },
];

const TYPE_META: Record<string, { icon: React.ReactNode; cls: string }> = {
  info:    { icon: <Info className="h-4 w-4" />,          cls: "text-blue-500 bg-blue-50" },
  success: { icon: <CheckCircle className="h-4 w-4" />,   cls: "text-green-600 bg-green-50" },
  warning: { icon: <AlertTriangle className="h-4 w-4" />, cls: "text-amber-500 bg-amber-50" },
  error:   { icon: <XCircle className="h-4 w-4" />,       cls: "text-red-500 bg-red-50" },
};

const CATEGORY_BADGE: Record<string, string> = {
  ASSIGNMENT: "bg-purple-50 text-purple-700",
  WORKFLOW:   "bg-blue-50 text-blue-700",
  MENTION:    "bg-pink-50 text-pink-700",
  COMMENT:    "bg-gray-100 text-gray-600",
  COMPLIANCE: "bg-indigo-50 text-indigo-700",
  INSPECTION: "bg-violet-50 text-violet-700",
  GENERAL:    "bg-gray-100 text-gray-600",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function InboxPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (cat: string) => {
    const params = new URLSearchParams();
    if (cat) params.set("category", cat);
    const res = await fetch(`/api/notifications?${params}`);
    if (res.ok) setNotifications(await res.json());
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- state updates happen after an awaited fetch, not synchronously
  useEffect(() => { void load(category); }, [load, category]);

  async function markRead(ids: string[]) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setNotifications((prev) => prev.map((n) => ids.includes(n.id) ? { ...n, isRead: true } : n));
  }

  async function markAllRead() {
    setMarkingAll(true);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setMarkingAll(false);
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const visible = unreadOnly ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Inbox className="h-6 w-6 text-gray-400" /> Inbox
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            {" · "}
            <Link href="/profile" className="text-blue-600 hover:underline">Notification preferences</Link>
          </p>
        </div>
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={markAllRead} disabled={markingAll}>
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            {markingAll ? "Marking…" : "Mark all read"}
          </Button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setCategory(t.key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              category === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 px-2 cursor-pointer whitespace-nowrap">
          <input type="checkbox" className="rounded" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Inbox className="h-10 w-10 text-gray-200 mx-auto" />
          <p className="text-sm text-gray-400">Nothing here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.info;
            return (
              <div
                key={n.id}
                className={cn(
                  "bg-white border rounded-xl px-4 py-4 flex gap-3 transition-colors",
                  n.isRead ? "border-gray-200" : "border-blue-200 bg-blue-50/30"
                )}
              >
                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", meta.cls)}>
                  {meta.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className={cn("text-sm font-medium", n.isRead ? "text-gray-700" : "text-gray-900")}>
                      {n.title}
                    </p>
                    <span className="text-xs text-gray-400 shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded", CATEGORY_BADGE[n.category] ?? CATEGORY_BADGE.GENERAL)}>
                      {n.category.toLowerCase()}
                    </span>
                    {n.link && (
                      <Link
                        href={n.link}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        onClick={() => { if (!n.isRead) markRead([n.id]); }}
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    {!n.isRead && (
                      <button onClick={() => markRead([n.id])} className="text-xs text-gray-400 hover:text-gray-600">
                        Mark read
                      </button>
                    )}
                  </div>
                </div>

                {!n.isRead && <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-2" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
