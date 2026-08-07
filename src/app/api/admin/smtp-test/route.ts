import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { sendMail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { to } = await req.json();
  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "Recipient email is required" }, { status: 400 });
  }

  const host = process.env.SMTP_HOST;
  if (!host) {
    return NextResponse.json({
      error: "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, and optionally SMTP_USER / SMTP_PASS in your .env file, then restart the server.",
    }, { status: 422 });
  }

  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });

    await transport.verify();

    const from = process.env.SMTP_FROM ?? "Sympl <no-reply@sympl.app>";
    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f3f4f6;margin:0;padding:32px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:#1e40af;padding:24px 32px">
    <span style="color:#fff;font-size:18px;font-weight:700">Sympl <span style="color:#93c5fd">PM</span></span>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 16px;font-size:20px;color:#111827">SMTP Test Successful</h2>
    <p style="color:#374151;font-size:14px;line-height:1.6">This is a test email from your Sympl PM instance. If you're reading this, your SMTP configuration is working correctly.</p>
    <div style="margin:16px 0;padding:12px 16px;background:#f0fdf4;border-left:3px solid #22c55e;color:#166534;font-size:13px">
      <strong>Configuration:</strong><br/>
      Host: ${host}<br/>
      Port: ${process.env.SMTP_PORT ?? 587}<br/>
      Secure: ${process.env.SMTP_SECURE === "true" ? "Yes (TLS)" : "No (STARTTLS)"}<br/>
      Auth: ${process.env.SMTP_USER ? "Yes" : "None"}
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Sent by an administrator from Admin → Settings.</p>
  </div>
</div>
</body></html>`;

    await transport.sendMail({
      from,
      to,
      subject: "Sympl PM — SMTP Test",
      html,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `SMTP error: ${message}` }, { status: 502 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.role, "admin:settings"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = !!process.env.SMTP_HOST;
  return NextResponse.json({
    configured,
    host: configured ? process.env.SMTP_HOST : null,
    port: configured ? Number(process.env.SMTP_PORT ?? 587) : null,
    secure: configured ? process.env.SMTP_SECURE === "true" : null,
    auth: configured ? !!process.env.SMTP_USER : null,
    from: configured ? (process.env.SMTP_FROM ?? "Sympl <no-reply@sympl.app>") : null,
  });
}
