"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Search, UserCheck, UserX, KeyRound, Clock } from "lucide-react";
import { formatDate, getInitials } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

type UserRow = {
  id: string; email: string; name: string | null; role: UserRole;
  isActive: boolean; createdAt: Date;
};

const ROLES: UserRole[] = ["ADMIN", "PRODUCT_MANAGER", "CONTRIBUTOR", "REVIEWER", "APPROVER", "VIEWER"];

const roleColors: Record<UserRole, string> = {
  ADMIN: "bg-red-100 text-red-700",
  PRODUCT_MANAGER: "bg-blue-100 text-blue-700",
  CONTRIBUTOR: "bg-green-100 text-green-700",
  REVIEWER: "bg-yellow-100 text-yellow-700",
  APPROVER: "bg-purple-100 text-purple-700",
  VIEWER: "bg-gray-100 text-gray-700",
};

export function UsersClient({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CONTRIBUTOR" as UserRole });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [activityUser, setActivityUser] = useState<UserRow | null>(null);
  type ActivityEntry = { id: string; action: string; entityType: string; fieldKey: string | null; source: string | null; createdAt: string };
  const [activityLogs, setActivityLogs] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const filtered = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  async function createUser() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create user");
      }
      const user = await res.json();
      setUsers((prev) => [...prev, user]);
      setCreateOpen(false);
      setForm({ name: "", email: "", password: "", role: "CONTRIBUTOR" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isActive: !isActive } : u));
    }
  }

  async function changePassword() {
    if (!pwUser || !newPassword) return;
    setPwLoading(true);
    setPwMsg(null);
    const res = await fetch(`/api/users/${pwUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      setPwMsg("Password updated");
      setNewPassword("");
      setTimeout(() => { setPwUser(null); setPwMsg(null); }, 1200);
    } else {
      const data = await res.json().catch(() => null);
      setPwMsg(data?.error ?? "Failed to update password");
    }
    setPwLoading(false);
  }

  async function loadActivity(user: UserRow) {
    setActivityUser(user);
    setActivityLoading(true);
    setActivityLogs([]);
    const res = await fetch(`/api/admin/users/${user.id}/activity`);
    if (res.ok) {
      const data = await res.json();
      setActivityLogs(Array.isArray(data.data) ? data.data : []);
    }
    setActivityLoading(false);
  }

  async function changeRole(id: string, role: UserRole) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role } : u));
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 text-sm">{users.length} total users</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">User</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 text-sm flex items-center justify-center font-bold">
                        {getInitials(user.name)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.name ?? "—"}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => changeRole(user.id, e.target.value as UserRole)}
                      className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer text-gray-900 ${roleColors[user.role]}`}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.isActive ? "success" : "secondary"}>
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setPwUser(user); setNewPassword(""); setPwMsg(null); }}
                        className="text-gray-400 hover:text-gray-700"
                        title="Change password"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => loadActivity(user)}
                        className="text-gray-400 hover:text-gray-700"
                        title="View activity"
                      >
                        <Clock className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(user.id, user.isActive)}
                        className="text-gray-400 hover:text-gray-700"
                        title={user.isActive ? "Deactivate" : "Activate"}
                      >
                        {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="user@company.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password <span className="text-red-500">*</span></label>
              <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Temporary password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createUser} disabled={loading || !form.email || !form.password}>
              {loading ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwUser} onOpenChange={(open) => { if (!open) setPwUser(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change Password — {pwUser?.name ?? pwUser?.email}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password <span className="text-red-500">*</span></label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                onKeyDown={(e) => e.key === "Enter" && changePassword()}
              />
            </div>
            {pwMsg && <p className={`text-sm ${pwMsg === "Password updated" ? "text-green-600" : "text-red-600"}`}>{pwMsg}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwUser(null)}>Cancel</Button>
            <Button onClick={changePassword} disabled={pwLoading || newPassword.length < 6}>
              {pwLoading ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activityUser} onOpenChange={(open) => { if (!open) setActivityUser(null); }}>
        <DialogContent className="max-w-lg max-h-[70vh] flex flex-col">
          <DialogHeader><DialogTitle>Activity — {activityUser?.name ?? activityUser?.email}</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {activityLoading && <p className="text-sm text-gray-400 text-center py-6">Loading...</p>}
            {!activityLoading && activityLogs.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No activity found.</p>}
            {activityLogs.map((log) => (
              <div key={log.id} className="py-2.5 px-1">
                <p className="text-sm text-gray-700">
                  {log.action} {log.entityType}{log.fieldKey ? ` (${log.fieldKey})` : ""}
                  {log.source && (
                    <span className="ml-1.5 inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      via {log.source}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(log.createdAt)}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
