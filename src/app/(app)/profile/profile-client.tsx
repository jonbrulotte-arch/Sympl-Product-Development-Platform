"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, User, Lock, Shield } from "lucide-react";
import { getInitials } from "@/lib/utils";

type ProfileUser = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: Date;
};

function fmtRole(r: string) {
  return r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ProfileClient({ user }: { user: ProfileUser }) {
  const { update: updateSession } = useSession();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const d = await res.json();
    if (res.ok) {
      setProfileMsg({ ok: true, text: "Profile updated successfully." });
      await updateSession({ name: d.name, email: d.email });
    } else {
      setProfileMsg({ ok: false, text: d.error ?? "Failed to update profile" });
    }
    setSavingProfile(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: "Passwords do not match" });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const d = await res.json();
    if (res.ok) {
      setPwMsg({ ok: true, text: "Password changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPwMsg({ ok: false, text: d.error ?? "Failed to change password" });
    }
    setSavingPw(false);
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account information and password.</p>
      </div>

      {/* Avatar + role */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-5">
        <div className="h-16 w-16 rounded-full bg-blue-500 flex items-center justify-center text-xl font-bold text-white shrink-0">
          {getInitials(user.name)}
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">{user.name ?? "—"}</p>
          <p className="text-sm text-gray-500">{user.email}</p>
          <span className="inline-flex items-center gap-1 mt-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            <Shield className="h-3 w-3" />
            {fmtRole(user.role)}
          </span>
        </div>
      </div>

      {/* Profile info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-5">
          <User className="h-4 w-4 text-gray-400" /> Account Information
        </h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </div>

          {profileMsg && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${profileMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {profileMsg.ok && <CheckCircle className="h-4 w-4 shrink-0" />}
              {profileMsg.text}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-5">
          <Lock className="h-4 w-4 text-gray-400" /> Change Password
        </h2>
        <form onSubmit={savePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password" />
            <p className="text-xs text-gray-400 mt-1">Minimum 8 characters.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password" />
          </div>

          {pwMsg && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${pwMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {pwMsg.ok && <CheckCircle className="h-4 w-4 shrink-0" />}
              {pwMsg.text}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={savingPw}>
              {savingPw ? "Saving…" : "Change Password"}
            </Button>
          </div>
        </form>
      </div>

      <p className="text-xs text-gray-400">
        Member since {new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
      </p>
    </div>
  );
}
