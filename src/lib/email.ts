import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

const FROM = process.env.SMTP_FROM ?? "Sympl <no-reply@sympl.app>";
// NextAuth v5 reads AUTH_URL; NEXTAUTH_URL kept as a v4-era fallback.
const BASE_URL = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:4000";

function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f3f4f6;margin:0;padding:32px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="background:#1e40af;padding:24px 32px">
    <span style="color:#fff;font-size:18px;font-weight:700">Sympl <span style="color:#93c5fd">PM</span></span>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 16px;font-size:20px;color:#111827">${title}</h2>
    ${body}
    <p style="margin:32px 0 0;font-size:12px;color:#9ca3af">You received this because you are a member of a Sympl project. To stop receiving emails, contact your administrator.</p>
  </div>
</div>
</body></html>`;
}

export async function sendMail(to: string, subject: string, html: string) {
  const transport = getTransport();
  if (!transport) return; // SMTP not configured — silently skip
  try {
    await transport.sendMail({ from: FROM, to, subject, html });
  } catch {
    // Don't let email failures break the caller
  }
}

export function passwordResetEmail(resetUrl: string) {
  return wrap("Reset your password", `
    <p style="color:#374151;font-size:14px;line-height:1.6">We received a request to reset the password for your Sympl account. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
    <a href="${resetUrl}" style="display:inline-block;margin:16px 0;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">Reset Password</a>
    <p style="color:#6b7280;font-size:12px">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
  `);
}

export function workflowVoteEmail(opts: {
  toName: string;
  projectName: string;
  stageName: string;
  voterName: string;
  vote: "APPROVED" | "REJECTED";
  comment?: string | null;
  projectId: string;
}) {
  const color = opts.vote === "APPROVED" ? "#16a34a" : "#dc2626";
  const label = opts.vote === "APPROVED" ? "Approved" : "Rejected";
  return wrap(`Workflow stage ${label.toLowerCase()}: ${opts.stageName}`, `
    <p style="color:#374151;font-size:14px;line-height:1.6"><strong>${opts.voterName}</strong> has <span style="color:${color};font-weight:600">${label}</span> the stage <strong>${opts.stageName}</strong> in project <strong>${opts.projectName}</strong>.</p>
    ${opts.comment ? `<div style="margin:12px 0;padding:12px 16px;background:#f9fafb;border-left:3px solid #d1d5db;color:#374151;font-size:13px;font-style:italic">${opts.comment}</div>` : ""}
    <a href="${BASE_URL}/projects/${opts.projectId}" style="display:inline-block;margin:16px 0;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">View Project</a>
  `);
}

export function stageCompletedEmail(opts: {
  projectName: string;
  stageName: string;
  result: "APPROVED" | "REJECTED";
  projectId: string;
}) {
  const color = opts.result === "APPROVED" ? "#16a34a" : "#dc2626";
  return wrap(`Stage ${opts.result === "APPROVED" ? "approved" : "rejected"}: ${opts.stageName}`, `
    <p style="color:#374151;font-size:14px;line-height:1.6">The workflow stage <strong>${opts.stageName}</strong> in <strong>${opts.projectName}</strong> has been <span style="color:${color};font-weight:600">${opts.result === "APPROVED" ? "approved" : "rejected"}</span> by all approvers.</p>
    <a href="${BASE_URL}/projects/${opts.projectId}" style="display:inline-block;margin:16px 0;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">View Project</a>
  `);
}

export function projectStatusEmail(opts: {
  projectName: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  projectId: string;
}) {
  function fmtStatus(s: string) {
    return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return wrap(`Project status updated: ${opts.projectName}`, `
    <p style="color:#374151;font-size:14px;line-height:1.6"><strong>${opts.changedBy}</strong> updated the status of <strong>${opts.projectName}</strong>.</p>
    <div style="margin:16px 0;display:flex;align-items:center;gap:12px;font-size:13px">
      <span style="background:#f3f4f6;padding:4px 10px;border-radius:9999px;color:#6b7280">${fmtStatus(opts.oldStatus)}</span>
      <span style="color:#9ca3af">→</span>
      <span style="background:#dbeafe;padding:4px 10px;border-radius:9999px;color:#1d4ed8;font-weight:600">${fmtStatus(opts.newStatus)}</span>
    </div>
    <a href="${BASE_URL}/projects/${opts.projectId}" style="display:inline-block;margin:8px 0;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">View Project</a>
  `);
}

export function stageAssignedEmail(opts: {
  toName: string;
  projectName: string;
  stageName: string;
  projectId: string;
}) {
  return wrap(`You've been assigned as an approver`, `
    <p style="color:#374151;font-size:14px;line-height:1.6">You have been assigned as an approver for the stage <strong>${opts.stageName}</strong> in project <strong>${opts.projectName}</strong>.</p>
    <p style="color:#374151;font-size:14px;line-height:1.6">When the stage is ready for review, you will be able to cast your vote directly from the project page.</p>
    <a href="${BASE_URL}/projects/${opts.projectId}" style="display:inline-block;margin:16px 0;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">View Project</a>
  `);
}

export { BASE_URL };
