import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveEmailProvider, sendMail, wrap } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { to } = await req.json();
  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "Recipient email is required" }, { status: 400 });
  }

  const provider = getActiveEmailProvider();
  if (provider === "none") {
    return NextResponse.json({
      error: "Email is not configured. Set either MSGRAPH_TENANT_ID / MSGRAPH_CLIENT_ID / MSGRAPH_CLIENT_SECRET or SMTP_HOST in your .env file, then restart the server.",
    }, { status: 422 });
  }

  try {
    const providerLabel = provider === "msgraph" ? "MS Graph API" : "SMTP";
    const configDetail =
      provider === "msgraph"
        ? `Provider: MS Graph API<br/>From: ${process.env.MSGRAPH_FROM_ADDRESS ?? "(using default)"}`
        : `Provider: SMTP<br/>Host: ${process.env.SMTP_HOST}<br/>Port: ${process.env.SMTP_PORT ?? 587}<br/>Secure: ${process.env.SMTP_SECURE === "true" ? "Yes (TLS)" : "No (STARTTLS)"}<br/>Auth: ${process.env.SMTP_USER ? "Yes" : "None"}`;

    const html = wrap("Email Test Successful", `
      <p style="color:#374151;font-size:14px;line-height:1.6">This is a test email from your Sympl PM instance. If you're reading this, your ${providerLabel} configuration is working correctly.</p>
      <div style="margin:16px 0;padding:12px 16px;background:#f0fdf4;border-left:3px solid #22c55e;color:#166534;font-size:13px">
        <strong>Configuration:</strong><br/>${configDetail}
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Sent by an administrator from Admin → Settings.</p>
    `);

    await sendMail(to, "Sympl PM — Email Test", html);
    return NextResponse.json({ success: true, provider });
  } catch (err: unknown) {
    console.error("[email-test] Test failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Email test failed" }, { status: 502 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const provider = getActiveEmailProvider();
  if (provider === "msgraph") {
    return NextResponse.json({
      configured: true,
      provider: "msgraph",
      from: process.env.MSGRAPH_FROM_ADDRESS ?? null,
    });
  }
  if (provider === "smtp") {
    return NextResponse.json({
      configured: true,
      provider: "smtp",
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: !!process.env.SMTP_USER,
      from: process.env.SMTP_FROM ?? "Sympl <no-reply@sympl.app>",
    });
  }
  return NextResponse.json({ configured: false, provider: "none" });
}
