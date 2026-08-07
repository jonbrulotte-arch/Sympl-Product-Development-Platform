# Sympl PM - Product Development Platform

A product lifecycle management platform for retail brands — centralizes product data, tracks approvals through configurable workflows, manages compliance events and pre-shipment inspections, and integrates with Salsify for data syndication.

---

## Features

- **Dashboard** — Landing view with pipeline stats, approvals waiting on you, overdue compliance events, projects needing attention, and recent activity.
- **Projects** — Organize products into projects with statuses, team members, and workflow stages. Search, filter by status, and switch between card and list views.
- **Product Grid** — Spreadsheet-style inline editing with custom EAV attributes, column tooltips, freezable columns, saved views (named sort/visibility/pinning combos per project), bulk edit, and Excel import & export. Computed columns show per-product required-field completeness (%) and Salsify sync freshness (Synced / Changed / never). Duplicate Part Numbers used in another project are flagged with a warning icon.
- **Product Record** — Full edit page per product with core fields, custom attributes by section, category inheritance from project, completeness chip, duplicate-part-number banner, Share / Pull-from-Salsify / Sync buttons (Admin/PM), and tabs for Compliance, Inspections, and field-level change History (old → new values, with the source of the change: Project Grid, Product Record, or Import).
- **Import with dry-run** — Excel import auto-maps columns, matches rows to existing products by Part Number (update-in-place, never duplicates), and shows a Verify step with create/update counts and cell-level old → new diffs before anything is written.
- **Workflows** — Configurable approval stages per project with per-stage approvers, voting, automatic status transitions, and reusable templates. Stages can be reordered, carry due dates (overdue stages show red chips and a project-header badge, and escalate to pending approvers via the overdue cron), and can declare informational dependencies on other stages, compliance events, or PSIRs.
- **Compliance** — Track regulatory events (Prop 65, REACH, CPSC, etc.) linked to products. Bulk-link products by pasting part numbers or uploading a spreadsheet. Overdue events surface on the dashboard and trigger notifications. Image attachments preview inline.
- **Pre-Shipment Inspections (PSIR)** — Inspection reports with custom attributes, file attachments, pass/fail results, and bulk product linking (paste or .xlsx upload). List cards expand in place with quick status changes.
- **Notifications** — In-app bell for workflow votes, stage completions, comments, and @mentions; cron-driven overdue alerts and a scheduled leadership digest email (pipeline, compliance risk, approvals aging).
- **Comments & Attachments** — Project comments with file attachments (20 MB limit, type allowlist, served behind authentication). @mention teammates to notify them directly.
- **Salsify Integration** — Per-user API keys (each sync authenticates as the person who ran it) with org-level settings shared. Map attributes to Salsify property IDs; sync all products in a project, a selection of rows from the grid, or a single product from its edit page — with a per-attribute opt-out modal before every sync. Per-product drift detection shows what's stale in Salsify, and Pull-from-Salsify brings digital-asset URLs and state back into Sympl. Enable Salsify Debug mode in Settings for log and inspector pages.
- **Read-Only Share Links** — Expiring tokenized URLs (7/30/90 days) that let a buyer or vendor view one product or inspection report without an account. Revocable at any time.
- **Read-Only API Tokens** — Scoped `spt_` tokens (Admin → API Tokens) let ERP/BI tools pull product data via the API without a browser session.
- **Manual Status Override** — Admins and Product Managers can set a project's status directly from the project Settings tab at any time.
- **Backup & Restore** — AES-256-GCM encrypted PostgreSQL backups plus uploaded-file archives, written to local disk with a retention policy and one-click restore. Snapshots can be downloaded and re-uploaded through the admin UI to migrate an instance between servers, and a scoped API token drives external cron automation (`scripts/backup.sh` backs up database and attachments in one crontab entry).
- **Security** — Project-level authorization on every route, authenticated file serving with an upload-type allowlist, login rate limiting, immediate session invalidation for deactivated accounts, and last-admin lockout protection.
- **Admin** — Users (including per-user password reset and activity log viewer), categories, attributes (with EAV and reorderable Lists of Values), workflow templates, compliance types, PSIR attributes, API tokens, backup, access control, and settings.

---

## Tech Stack

- **Framework**: Next.js 16 App Router (TypeScript)
- **Database**: PostgreSQL via Prisma 7
- **Auth**: NextAuth v5
- **UI**: Tailwind CSS, Lucide icons, Radix UI primitives
- **Integrations**: Salsify REST API

---

## Environment Variables

Create a `.env` file at the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/sympl_db
NEXTAUTH_SECRET=your-secret-here
# Externally reachable URL of the app (NextAuth v5 reads AUTH_URL)
AUTH_URL=http://localhost:4000

# Salsify is configured in the app, not here: the Organization ID lives in
# Admin → Settings and each user's API key in My Profile → Salsify API Key.

# Backup encryption (optional — falls back to NEXTAUTH_SECRET if not set)
# Generate with: openssl rand -hex 32
BACKUP_ENCRYPTION_KEY=

# Email notifications (optional — without SMTP_HOST, emails are silently skipped)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587              # default 587; use 465 with SMTP_SECURE=true
# SMTP_SECURE=false          # true = implicit TLS (port 465); false = STARTTLS
# SMTP_USER=you@gmail.com
# SMTP_PASS=app-specific-password
# SMTP_FROM=Sympl <no-reply@yourdomain.com>

# Seeding (optional)
# SEED_DEMO_USERS=true      # create demo accounts + sample project (never use in production)
# SEED_ADMIN_PASSWORD=      # bootstrap admin password; random one is generated and printed if unset
```

> **Backup key note:** If `BACKUP_ENCRYPTION_KEY` is not set, the backup encryption key is derived from `NEXTAUTH_SECRET` via HMAC-SHA256. Set an explicit key if you need to restore backups on a server with a different `NEXTAUTH_SECRET`.

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

```bash
npx prisma db push
npx prisma generate
npm run db:seed   # creates sections, core attributes, and an admin account
```

The seed prints the bootstrap admin credentials once (`admin@sympl.dev` with either `SEED_ADMIN_PASSWORD` or a generated password). Change the password after first login. Set `SEED_DEMO_USERS=true` to also create demo PM/Contributor accounts and a sample project — development only.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:4000](http://localhost:4000).

### File storage

Uploaded attachments are stored in `data/uploads` (outside the public web root) and served through an authenticated route. Back this directory up separately from the database.

---

## Roles

| Role | Access |
|------|--------|
| **Admin** | Full access — all projects, users, attributes, settings, backup |
| **Product Manager** | Create/manage projects; admin attribute & category pages; Salsify sync |
| **Contributor** | Edit products in assigned projects |
| **Reviewer** | View and comment; cannot edit product data |
| **Approver** | Cast approval votes on assigned workflow stages |
| **Viewer** | Read-only access to assigned projects |

---

## Project Statuses

| Status | Meaning |
|--------|---------|
| `DRAFT` | Work in progress |
| `IN_PROGRESS` | Actively being worked on |
| `NEEDS_REVIEW` | Submitted for internal review |
| `CHANGES_REQUESTED` | Reviewer requested revisions |
| `APPROVED` | All workflow stages approved |
| `EXPORT_READY` | Finalized; ready to push to Salsify |
| `ARCHIVED` | Closed; no longer active |

---

## Backup & Restore

Backups are created via **Admin → Backup & Restore**. Each backup is a `pg_dump --format=custom` output encrypted with AES-256-GCM and saved as a `.pgenc` file.

**Manual backup:** Click **Run Now** in the admin UI.

**API Token:** Generate a scoped token from Admin → Backup & Restore → API Token. The token is shown once — copy it immediately. Use it to trigger backups without a browser session:

```bash
curl -s -X POST https://your-server/api/admin/backup/run \
  -H "Authorization: Bearer sbk_<your-token>" \
  -H "Content-Type: application/json"
```

**Scheduled backup (database only):** Sympl does not have a built-in scheduler. Generate an API token and add a cron job:

```bash
# Daily at 2:00 AM
0 2 * * * curl -s -X POST https://your-server/api/admin/backup/run \
  -H "Authorization: Bearer sbk_<your-token>" \
  -H "Content-Type: application/json" \
  -d '{"triggeredBy":"SCHEDULE"}'
```

**Scheduled full backup (database + uploaded files):** use the bundled `scripts/backup.sh` instead — it calls the same API for the database dump and additionally tars up `data/uploads/`, pruning old archives to match the retention count configured in the admin UI:

```bash
# Daily at 2:00 AM
0 2 * * * /opt/sympl/scripts/backup.sh https://your-server sbk_<your-token> /var/backups/sympl >> /var/log/sympl-backup.log 2>&1
```

**Restore:** Go to Admin → Backup & Restore → Restore tab. Snapshots are listed newest-first with a **Database** or **Files** badge:

- **Database** (`.pgenc`) — drops the `public` schema and restores the snapshot into it in a single transaction; all current data is overwritten. The success banner reports the restored project and product counts. Reload the app after restoring.
- **Files** (`.tar.gz`) — extracts back over `data/uploads/`. Files in the archive overwrite same-named files; files only on this server are left in place.

### Server Migration

Snapshots can be downloaded from one server and uploaded to another entirely through the admin UI — no shell access required:

1. On the **old** server: click **Back Up Database** and **Archive Files**, then **Download** both artifacts from the Restore tab.
2. Set the same `BACKUP_ENCRYPTION_KEY` (or, if unset, the same `NEXTAUTH_SECRET`) on the **new** server — the database dump cannot be decrypted without it.
3. On the **new** server: open Backup & Restore → Restore and upload both files via **Upload a Snapshot**. Uploads stream to disk with a progress bar, so multi-GB dumps are fine.
4. Restore the database snapshot, reload the app, then restore the files archive.

Uploaded snapshots must keep their original file names (`sympl-backup-<timestamp>.pgenc` / `sympl-uploads-<timestamp>.tar.gz`) — the name is what identifies the artifact type.

---

## Email Notifications (SMTP)

Sympl sends email notifications for workflow events, status changes, overdue alerts, and password resets. Email is optional — if `SMTP_HOST` is not set, all emails are silently skipped and the app works normally with in-app notifications only.

### Setup

Add the SMTP variables to your `.env` file (see Environment Variables above) and restart the server. Common providers:

| Provider | Host | Port | Secure | Notes |
|----------|------|------|--------|-------|
| Gmail | `smtp.gmail.com` | 587 | false | Use an [App Password](https://support.google.com/accounts/answer/185833), not your account password |
| Outlook/365 | `smtp.office365.com` | 587 | false | |
| Amazon SES | `email-smtp.us-east-1.amazonaws.com` | 587 | false | Use SES SMTP credentials, not IAM keys |
| Generic | Your SMTP host | 465 | true | Implicit TLS on port 465 |

### What sends email

| Event | Trigger | Recipient |
|-------|---------|-----------|
| Workflow vote cast | Instant | Project owner |
| Stage completed | Instant | Project owner |
| Approver assigned | Instant | Assigned user |
| Project status change | Instant | Project team members |
| Password reset | On demand | Requesting user |
| Overdue alerts | Cron (`/api/cron/overdue-check`) | Event creator, project owners, pending approvers |
| Leadership digest | Cron (`/api/cron/digest`) | All active Admins and Product Managers |

Users control which categories they receive email for in **My Profile → Notification Preferences**. Mentions and assignments default to email on; other categories default to inbox only.

### Testing

Go to **Admin → Settings → Email Notifications (SMTP)** to see the current SMTP status and send a test email. The test verifies the full round-trip: connection, authentication, and delivery.

---

## Overdue Alerts (cron)

Compliance events and workflow stages with a due date trigger in-app notifications (and email, when SMTP is configured) once they go overdue. Like backups, this relies on an external cron job — the same `sbk_` API token authorizes it:

```bash
# Every 30 minutes
*/30 * * * * curl -s -X POST https://your-server/api/cron/overdue-check \
  -H "Authorization: Bearer sbk_<your-token>"
```

Each item alerts once; changing its due date re-arms the alert. Overdue compliance notifies the event creator and affected project owners; overdue stages notify pending approvers and the project owner.

**Leadership digest:** a pipeline/compliance/approvals-aging summary emailed to all active Admins and Product Managers. Same token, typically weekly:

```bash
# Mondays at 7:00 AM
0 7 * * 1 curl -s -X POST https://your-server/api/cron/digest \
  -H "Authorization: Bearer sbk_<your-token>"
```

Admins can preview the digest HTML at `/api/cron/digest` in the browser without sending.

---

## Read-Only API Tokens

Generate scoped tokens from **Admin → API Tokens** for external tools (ERP, BI) to pull product data without a browser session. Tokens are shown once at creation (`spt_` prefix) and can be revoked at any time:

```bash
curl -H "Authorization: Bearer spt_<your-token>" \
  "https://your-server/api/products?search=SP-004&page=1"
```

The token grants read access to the products API only — no writes, no other endpoints.

---

## Share Links

Admins and Product Managers can create expiring read-only share links for a product or inspection report (Share button on the record page). Anyone with the URL can view the data — no account required — until the link expires (7/30/90 days) or is revoked. Shared views show data only: no attachments, no navigation into the app.

---

## Salsify Integration

1. **Admin → Settings** (admins): enter the Organization ID and enable the **Enable Salsify Sync** toggle.
2. **My Profile → Salsify API Key** (each user who syncs): paste your own Salsify API key, from Salsify → User Settings → API Access. Keys are per-user, not global — every sync, pull, and debug call authenticates as the user who ran it, so Salsify attributes each change to the right person. Syncing without a key on file fails with a pointer to your profile.
3. In **Admin → Attributes**, enable Salsify on each attribute you want to sync and enter the Salsify Property ID.
4. Sync products in one of three ways (all require `EXPORT_READY` status):
   - **Full project** — click **Sync to Salsify** in the project header.
   - **Selected rows** — check rows in the product grid, then click **Sync to Salsify** in the selection toolbar.
   - **Single product** — click **Sync to Salsify** on the product edit page (`/products/[id]`).
5. A pre-sync modal lists every Salsify-enabled attribute with checkboxes. Uncheck any attribute to exclude it from this sync run without permanently changing the attribute's Salsify settings.

**Drift detection:** every successful sync records a per-product timestamp. The grid's **Salsify** column shows *Synced* (green, unchanged since last sync), *Changed* (yellow, edited since last sync — Salsify is stale), or *—* (never synced).

**Pull from Salsify:** on the product edit page, pull the product's current Salsify state (digital-asset URLs, version, last-updated) back into Sympl. Assets display as thumbnails in an "In Salsify" panel.

Enable **Salsify Debug** in Admin → Settings to show **Salsify Log** and **Salsify Debug** pages in the admin sidebar (useful for troubleshooting payloads and sync errors).

---

## Database Schema Changes

After modifying `prisma/schema.prisma`, run:

```bash
npx prisma db push
npx prisma generate
```

---

## Project Structure

```
src/
  app/
    (app)/          # Authenticated app routes
      admin/        # Admin pages (users, attributes, api-tokens, backup, etc.)
      compliance/   # Compliance events
      dashboard/    # Landing dashboard
      notifications/# Notification list
      products/     # Global product browser + per-product edit page
      projects/     # Project list + per-project grid
      psir/         # Pre-shipment inspection reports
    api/            # API route handlers (incl. cron/ for scheduled jobs)
    share/          # Public read-only share-link pages (token-gated)
    uploads/        # Authenticated file serving for attachments
  components/
    grid/           # Product grid (inline editing, EAV, tooltips)
    layout/         # Sidebar, shell
    ui/             # Shared UI primitives
  lib/              # Auth, Prisma client, validation, access control, uploads
prisma/
  schema.prisma
data/
  uploads/          # Attachment storage (private, outside the web root)
```
