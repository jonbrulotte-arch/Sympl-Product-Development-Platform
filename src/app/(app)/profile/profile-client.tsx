"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, User, Lock, Shield, Bell, KeyRound } from "lucide-react";
import { getInitials } from "@/lib/utils";

const PREF_CATEGORIES: { key: string; label: string; description: string }[] = [
  { key: "ASSIGNMENT", label: "Assignments",  description: "Added to a project or assigned as an approver" },
  { key: "WORKFLOW",   label: "Workflow",     description: "Votes, stage completions, status changes, due dates" },
  { key: "MENTION",    label: "Mentions",     description: "Someone @mentions you in a comment" },
  { key: "COMMENT",    label: "Comments",     description: "New comments on your projects" },
  { key: "COMPLIANCE", label: "Compliance",   description: "Compliance events on your projects (created, changed, due)" },
  { key: "INSPECTION", label: "Inspections",  description: "Inspection reports covering your projects" },
  { key: "GENERAL",    label: "Everything else", description: "System and miscellaneous notifications" },
];

type PrefMatrix = Record<string, { inbox: boolean; email: boolean }>;

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

  const [prefs, setPrefs] = useState<PrefMatrix | null>(null);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [salsifyKey, setSalsifyKey] = useState("");
  const [salsifyMasked, setSalsifyMasked] = useState("");
  const [savingSalsify, setSavingSalsify] = useState(false);
  const [salsifyMsg, setSalsifyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/users/me/notification-prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPrefs(d); })
      .catch(() => {});
    fetch("/api/users/me/salsify-key")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSalsifyMasked(d.masked ?? ""); })
      .catch(() => {});
  }, []);

  async function saveSalsifyKey(e: React.FormEvent) {
    e.preventDefault();
    setSavingSalsify(true);
    setSalsifyMsg(null);
    const res = await fetch("/api/users/me/salsify-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: salsifyKey }),
    });
    const d = await res.json();
    if (res.ok) {
      setSalsifyMasked(d.masked ?? "");
      setSalsifyKey("");
      setSalsifyMsg({ ok: true, text: "Salsify API key saved." });
    } else {
      setSalsifyMsg({ ok: false, text: d.error ?? "Failed to save API key" });
    }
    setSavingSalsify(false);
  }

  async function removeSalsifyKey() {
    if (!confirm("Remove your Salsify API key? You will not be able to sync until you add a new one.")) return;
    setSavingSalsify(true);
    setSalsifyMsg(null);
    const res = await fetch("/api/users/me/salsify-key", { method: "DELETE" });
    if (res.ok) {
      setSalsifyMasked("");
      setSalsifyKey("");
      setSalsifyMsg({ ok: true, text: "Salsify API key removed." });
    } else {
      setSalsifyMsg({ ok: false, text: "Failed to remove API key" });
    }
    setSavingSalsify(false);
  }

  const togglePref = (category: string, channel: "inbox" | "email") => {
    setPrefs((prev) => prev ? {
      ...prev,
      [category]: { ...prev[category], [channel]: !prev[category]?.[channel] },
    } : prev);
    setPrefsMsg(null);
  };

  async function savePrefs() {
    if (!prefs) return;
    setSavingPrefs(true);
    const res = await fetch("/api/users/me/notification-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setPrefsMsg(res.ok ? "Preferences saved." : "Failed to save preferences.");
    setSavingPrefs(false);
  }

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

      {/* Notification preferences */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1">
          <Bell className="h-4 w-4 text-gray-400" /> Notification Preferences
        </h2>
        <p className="text-xs text-gray-400 mb-4">Choose what lands in your Inbox and what is also emailed to you.</p>
        {!prefs ? (
          <p className="text-sm text-gray-400 py-4">Loading…</p>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              <div className="grid grid-cols-[1fr_64px_64px] gap-2 pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <span>Category</span>
                <span className="text-center">Inbox</span>
                <span className="text-center">Email</span>
              </div>
              {PREF_CATEGORIES.map(({ key, label, description }) => (
                <div key={key} className="grid grid-cols-[1fr_64px_64px] gap-2 py-2.5 items-center">
                  <div>
                    <p className="text-sm text-gray-800 font-medium">{label}</p>
                    <p className="text-xs text-gray-400">{description}</p>
                  </div>
                  <div className="text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                      checked={prefs[key]?.inbox ?? true}
                      onChange={() => togglePref(key, "inbox")}
                    />
                  </div>
                  <div className="text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                      checked={prefs[key]?.email ?? false}
                      onChange={() => togglePref(key, "email")}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 mt-4">
              {prefsMsg && (
                <span className={`text-xs ${prefsMsg.includes("Failed") ? "text-red-600" : "text-green-600"}`}>{prefsMsg}</span>
              )}
              <Button size="sm" onClick={savePrefs} disabled={savingPrefs}>
                {savingPrefs ? "Saving…" : "Save Preferences"}
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-3">Email requires the server to have SMTP configured. Urgent overdue alerts may still email approvers directly.</p>
          </>
        )}
      </div>

      {/* Salsify API key */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-1">
          <KeyRound className="h-4 w-4 text-gray-400" /> Salsify API Key
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Your personal Salsify key. Every sync and pull you run authenticates as you.
          Find it in Salsify → User Settings → API Access.
        </p>

        {salsifyMasked && (
          <div className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 mb-3">
            <span className="text-sm font-mono text-gray-700">{salsifyMasked}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingSalsify}
              onClick={removeSalsifyKey}
              className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
            >
              Remove
            </Button>
          </div>
        )}

        <form onSubmit={saveSalsifyKey} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {salsifyMasked ? "Replace API Key" : "API Key"}
            </label>
            <Input
              type="password"
              value={salsifyKey}
              onChange={(e) => setSalsifyKey(e.target.value)}
              placeholder="Paste your Salsify API key"
              autoComplete="off"
            />
          </div>

          {salsifyMsg && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${salsifyMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {salsifyMsg.ok && <CheckCircle className="h-4 w-4 shrink-0" />}
              {salsifyMsg.text}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={savingSalsify || !salsifyKey.trim()}>
              {savingSalsify ? "Saving…" : salsifyMasked ? "Replace Key" : "Save Key"}
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
