"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface SmtpStatus {
  configured: boolean;
  host: string | null;
  port: number | null;
  secure: boolean | null;
  auth: boolean | null;
  from: string | null;
}

export function SmtpSettingsClient() {
  const [status, setStatus] = useState<SmtpStatus | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/smtp-test")
      .then((r) => r.json())
      .then((data) => setStatus(data))
      .catch(() => {});
  }, []);

  const sendTest = async () => {
    if (!testEmail) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/smtp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: "Test email sent successfully. Check your inbox." });
      } else {
        setResult({ ok: false, message: data.error ?? "Failed to send test email" });
      }
    } catch {
      setResult({ ok: false, message: "Network error" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Notifications (SMTP)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && !status.configured && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">SMTP is not configured</p>
              <p className="mt-1 text-xs">
                Email notifications are disabled. Add the SMTP environment variables to your{" "}
                <code className="bg-amber-100 px-1 rounded">.env</code> file and restart the server.
                See the table below for required variables.
              </p>
            </div>
          </div>
        )}

        {status?.configured && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">SMTP is configured</p>
              <div className="mt-1 text-xs space-y-0.5">
                <p>Host: <code className="bg-green-100 px-1 rounded">{status.host}</code></p>
                <p>Port: <code className="bg-green-100 px-1 rounded">{status.port}</code></p>
                <p>Security: {status.secure ? "TLS (implicit)" : "STARTTLS (upgrade on connect)"}</p>
                <p>Authentication: {status.auth ? "Yes" : "None (open relay)"}</p>
                <p>From: <code className="bg-green-100 px-1 rounded">{status.from}</code></p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Send a test email</label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendTest()}
              />
              <Button onClick={sendTest} disabled={sending || !testEmail}>
                {sending ? "Sending…" : "Send Test"}
              </Button>
            </div>
          </div>

          {result && (
            <div className={`flex items-center gap-2 text-sm ${result.ok ? "text-green-600" : "text-red-600"}`}>
              {result.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {result.message}
            </div>
          )}
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-2">
          <p className="font-medium text-gray-700">Environment variables</p>
          <p>
            SMTP settings are configured in your <code className="bg-gray-200 px-1 rounded">.env</code> file
            (not in this UI) because they contain credentials. After changing them, restart the server.
          </p>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-1 pr-3 font-semibold text-gray-700">Variable</th>
                <th className="py-1 pr-3 font-semibold text-gray-700">Required</th>
                <th className="py-1 font-semibold text-gray-700">Description</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-3"><code className="bg-gray-200 px-1 rounded">SMTP_HOST</code></td>
                <td className="py-1 pr-3">Yes</td>
                <td className="py-1">SMTP server hostname (e.g. <code>smtp.gmail.com</code>)</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-3"><code className="bg-gray-200 px-1 rounded">SMTP_PORT</code></td>
                <td className="py-1 pr-3">No</td>
                <td className="py-1">Port number (default: <code>587</code>)</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-3"><code className="bg-gray-200 px-1 rounded">SMTP_SECURE</code></td>
                <td className="py-1 pr-3">No</td>
                <td className="py-1">Set to <code>true</code> for implicit TLS (port 465). Default uses STARTTLS.</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-3"><code className="bg-gray-200 px-1 rounded">SMTP_USER</code></td>
                <td className="py-1 pr-3">No</td>
                <td className="py-1">Username for SMTP authentication</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-3"><code className="bg-gray-200 px-1 rounded">SMTP_PASS</code></td>
                <td className="py-1 pr-3">No</td>
                <td className="py-1">Password or app-specific password</td>
              </tr>
              <tr>
                <td className="py-1 pr-3"><code className="bg-gray-200 px-1 rounded">SMTP_FROM</code></td>
                <td className="py-1 pr-3">No</td>
                <td className="py-1">Sender address (default: <code>Sympl &lt;no-reply@sympl.app&gt;</code>)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-800 space-y-1">
          <p className="font-medium">What sends email?</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Workflow votes, stage completions, and approver assignments (instant)</li>
            <li>Project status changes (instant)</li>
            <li>Password-reset links (instant)</li>
            <li>Overdue compliance &amp; workflow alerts (cron — <code>/api/cron/overdue-check</code>)</li>
            <li>Leadership digest summary (cron — <code>/api/cron/digest</code>)</li>
          </ul>
          <p className="mt-1">Users control which categories they receive via <strong>My Profile → Notification Preferences</strong>.</p>
        </div>
      </CardContent>
    </Card>
  );
}
