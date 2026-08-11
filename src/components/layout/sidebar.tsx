"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  Package,
  Upload,
  Settings,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Tag,
  ListFilter,
  HelpCircle,
  ScrollText,
  Bug,
  GitBranch,
  ShieldCheck,
  ClipboardCheck,
  HardDrive,
  KeyRound,
  BarChart3,
  ArrowRightLeft,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { useState, useEffect } from "react";
import type { SafeUser } from "@/types";
import type { Permission } from "@/lib/permissions";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/products", label: "Products", icon: Package },
  { href: "/psir", label: "Inspections", icon: ClipboardCheck },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/help", label: "Help & Docs", icon: HelpCircle },
];

// Maps each admin nav item to its required permission (null = ADMIN only, no permission key)
const adminNavItems: { href: string; label: string; icon: React.ElementType; permission: Permission | null }[] = [
  { href: "/admin/users",              label: "Users",              icon: Users,          permission: "admin:users" },
  { href: "/admin/bulk-projects",      label: "Bulk Project Actions", icon: ArrowRightLeft, permission: "projects:transfer_ownership" },
  { href: "/admin/categories",         label: "Categories",         icon: Tag,            permission: "admin:categories" },
  { href: "/admin/attributes",         label: "Attributes",         icon: ListFilter,     permission: "admin:attributes" },
  { href: "/admin/workflow-templates", label: "Workflows",          icon: GitBranch,      permission: "admin:workflow_templates" },
  { href: "/admin/compliance-types",   label: "Compliance Types",   icon: ShieldCheck,    permission: "admin:compliance_types" },
  { href: "/admin/psir-attributes",    label: "Inspection Attributes",    icon: ClipboardCheck, permission: "admin:psir_attributes" },
  { href: "/admin/backup",             label: "Backup & Restore",   icon: HardDrive,      permission: "admin:backup" },
  { href: "/admin/settings",           label: "Settings",           icon: Settings,       permission: "admin:settings" },
  { href: "/admin/api-tokens",         label: "API Tokens",         icon: KeyRound,       permission: "admin:settings" },
  { href: "/admin/access-control",     label: "Access Control",     icon: ShieldCheck,    permission: null }, // ADMIN only, always
];

const salsifyDebugItems = [
  { href: "/admin/salsify-log", label: "Salsify Log", icon: ScrollText },
  { href: "/admin/salsify-debug", label: "Salsify Debug", icon: Bug },
];

interface SidebarProps {
  user: SafeUser;
  grantedPermissions: Set<Permission>;
}

export function Sidebar({ user, grantedPermissions }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [salsifyDebugEnabled, setSalsifyDebugEnabled] = useState(false);
  const [inspectionsEnabled, setInspectionsEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/notifications?unread=true")
      .then((r) => r.json())
      .then((data) => setUnreadCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setSalsifyDebugEnabled(data.salsifyDebugEnabled ?? false);
          setInspectionsEnabled(data.inspectionsEnabled ?? true);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-gray-900 text-white transition-all duration-200 shrink-0",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-gray-700">
        {!collapsed && (
          <span className="text-lg font-bold text-white tracking-tight">Sympl <span className="text-blue-400">PM</span></span>
        )}
        {collapsed && (
          <span className="text-lg font-bold text-white mx-auto">S</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {navItems.filter(({ href }) => inspectionsEnabled || href !== "/psir").map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:bg-gray-800 hover:text-white"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </Link>
        ))}

        {(() => {
          const visibleAdminItems = adminNavItems.filter(({ href, permission }) => {
            if (!inspectionsEnabled && href === "/admin/psir-attributes") return false;
            return permission === null
              ? user.role === "ADMIN"
              : grantedPermissions.has(permission);
          });
          const visibleDebugItems = user.role === "ADMIN" && salsifyDebugEnabled ? salsifyDebugItems : [];
          const allVisible = [...visibleAdminItems, ...visibleDebugItems];
          if (allVisible.length === 0) return null;
          return (
            <>
              <div className={cn("pt-4 pb-1", collapsed ? "px-0" : "px-2")}>
                {!collapsed && (
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin</p>
                )}
              </div>
              {allVisible.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                    pathname.startsWith(href)
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              ))}
            </>
          );
        })()}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-700 p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
            {getInitials(user.name)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.role}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 flex items-center gap-2">
            <Link href="/inbox" className="relative p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800" title="Inbox">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <Link href="/profile" className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800" title="My Profile">
              <Settings className="h-4 w-4" />
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-8 border-t border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
