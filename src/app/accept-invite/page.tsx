"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle } from "lucide-react";

// Where an invited user lands. Consumes the same single-use token as a
// password reset — only the wording differs, because the account has never
// had a password.
function AcceptInviteForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        setTimeout(() => router.push("/login"), 2000);
      } else {
        setError(d.error ?? "Something went wrong");
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm text-red-600">This invitation link is missing its token.</p>
        <p className="text-sm text-gray-500">Ask your administrator to send a new invitation.</p>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">Back to sign in</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center space-y-3">
        <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
        <h2 className="text-lg font-semibold text-gray-900">Your account is ready</h2>
        <p className="text-sm text-gray-500">Taking you to sign in…</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Welcome to Sympl PM</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose a password to activate your account. It must be at least 8 characters.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoFocus
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Setting password…" : "Set password"}
        </Button>
      </form>
    </>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Sympl</h1>
          <p className="text-gray-500 mt-1 text-sm">Product Development Platform</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <Suspense fallback={<p className="text-sm text-gray-400">Loading…</p>}>
            <AcceptInviteForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
