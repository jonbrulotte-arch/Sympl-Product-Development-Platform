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
- **Reports** — Seven operational reports (Inspections, Compliance, Overdue Stages, Overdue Projects, Roadblocks, Out-of-Sync Products, Pipeline Summary) with filters and one-click Excel export, scoped to the projects each user can see. Out-of-Sync rows drill into a field-level drift panel (old → new, who and when) with links to the product, project, and Salsify record, and a per-field push back to Salsify.
- **Module toggles** — Admin → Settings → Modules can disable the Inspections module platform-wide (sidebar, pages, product/project tabs, reports, API). All inspection data is retained; re-enabling restores everything.
- **Admin** — Users (including per-user password reset and activity log viewer), categories, attributes (with EAV and reorderable Lists of Values), workflow templates, compliance types, inspection attributes, API tokens, backup, access control, and settings.

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

**Scheduled backups:** Sympl has no built-in scheduler — use an external cron job with the bundled `scripts/backup.sh`, which handles both the database dump and uploaded-file archive. See the **Cron Jobs** section below for the complete crontab and setup notes.

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

> **Reverse proxy note:** If Sympl runs behind nginx or Apache, the proxy's request-body limit applies to snapshot uploads before they ever reach the app. nginx defaults to `client_max_body_size 1m`, which rejects any real snapshot with a 413. Raise it (and the read/send timeouts, for multi-GB files) in the server block that proxies Sympl:
>
> ```nginx
> client_max_body_size 10g;
> proxy_read_timeout   600s;
> proxy_send_timeout   600s;
> ```

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

## Cron Jobs

Sympl has no built-in scheduler. Three endpoints are designed to be triggered by external cron jobs, all authenticated with the same `sbk_` backup API token generated in **Admin → Backup & Restore → API Token**.

### Token types

| Prefix | Purpose | Where to generate |
|--------|---------|-------------------|
| `sbk_` | Backup & cron endpoints (backup, overdue-check, digest) | Admin → Backup & Restore → API Token |
| `spt_` | Read-only product API for ERP/BI tools | Admin → API Tokens |

> **Important:** `spt_` tokens do **not** work for cron endpoints. Always use the `sbk_` token for all cron jobs.

### Complete crontab

```bash
# ── Overdue compliance & workflow alerts ──────────────────────────
# Checks for overdue compliance events, overdue workflow stages,
# and items due within 3 days. Each item alerts once; changing its
# due date re-arms the alert. Also sends email when SMTP is configured.
*/15 * * * * curl -s -X POST http://localhost:4000/api/cron/overdue-check \
  -H "Authorization: Bearer sbk_<your-token>"

# ── Leadership digest ─────────────────────────────────────────────
# Pipeline/compliance/approvals-aging summary emailed to all active
# Admins and Product Managers. Preview the HTML at /api/cron/digest
# in the browser (with an admin session) without sending.
0 7 * * 1 curl -s -X POST http://localhost:4000/api/cron/digest \
  -H "Authorization: Bearer sbk_<your-token>"

# ── Full backup (database + uploaded files) ───────────────────────
# Calls the backup API for an encrypted database dump, then tars
# data/uploads/. Old archives are pruned to the retention count
# configured in Admin → Backup & Restore.
0 2 * * * /path/to/Sympl-Product-Development-Platform/scripts/backup.sh \
  http://localhost:4000 sbk_<your-token> /var/backups/sympl \
  >> /var/log/sympl-backup.log 2>&1
```

> **Timezone:** Cron uses the server's system timezone. If you want `0 2 * * *` to mean 2:00 AM Pacific, make sure the server timezone is set to `America/Los_Angeles` (check with `timedatectl`). Otherwise convert to UTC manually — but note the UTC offset changes with daylight saving time.

> **Log file:** Create the backup log file before the first run so errors are captured:
> ```bash
> sudo touch /var/log/sympl-backup.log && sudo chown <your-user> /var/log/sympl-backup.log
> ```
> Without it, `backup.sh` output is silently discarded and failures are invisible.

### What the overdue-check covers

| Category | Condition | Who is notified |
|----------|-----------|-----------------|
| Overdue compliance events | `dueDate` in the past, status OPEN or IN_PROGRESS | Event creator + affected project owners |
| Overdue workflow stages | `dueDate` in the past, status PENDING or IN_REVIEW | Pending approvers + project owner |
| Due-soon workflow stages | `dueDate` within 3 days | Pending approvers + project owner |
| Due-soon compliance events | `dueDate` within 3 days | Event creator + affected project owners |

All four categories are idempotent — each item is notified once, tracked via `overdueNotifiedAt` / `dueSoonNotifiedAt` timestamps.

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

## Reports

`/reports` — operational reports with filters and one-click Excel export. Open to every signed-in user; rows are scoped to projects the user owns or belongs to (admins see everything). Scoping is applied in the queries, not just hidden in the UI.

| Report | Covers | Filters |
| --- | --- | --- |
| Inspections | All inspection reports: result, status, date, inspector, company, factory, country, linked products | Result |
| Compliance | Events with type, severity, status, due date, computed days overdue, resolution | Status, severity, overdue-only |
| Overdue Stages | Workflow stages past due, with pending approvers and project owner | — |
| Overdue Projects | Active projects past target launch, with open stage and product counts | — |
| Roadblocks | Blocked stages (unmet dependency), stalled projects (Needs Review / Changes Requested, or 14 days idle), failed inspections, aging approvals — tagged by Roadblock Type, sorted by days stuck | — |
| Out-of-Sync Products | Products edited since their last Salsify push, or never pushed while Export Ready | — |
| Pipeline Summary | Project and product counts by status and owner, with average days since update | — |

**Excel export** (`GET /api/reports/[type]/export`) returns exactly the on-screen rows with filters applied, as `sympl-<type>-report-<date>.xlsx`. Row keys prefixed with `_` are internal IDs used for drill-down and are stripped from both the table and the sheet.

The Inspections report is hidden and its API returns 404 when the Inspections module is disabled; the Roadblocks report drops its failed-inspection section.

Clicking a row in **Out-of-Sync Products** opens a drift detail panel — see [Salsify Integration](#salsify-integration) below.

**API:** `GET /api/reports/[type]` returns `{ rows }`. `GET /api/projects/[id]/products/[productId]/salsify-drift` returns the detail behind one out-of-sync row.

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

**Resolving drift field by field:** the **Out-of-Sync Products** report (Reports → Out-of-Sync Products) lists every drifted product across the projects you can see. Click a row to open a detail panel with:

- **Changes since last sync** — one card per field: old value → new value, who changed it, when, and the source (Project Grid / Product Record / Import).
- **Links** to the product record, the project, and the product's page in Salsify.
- **Per-field sync** for users with `products:sync_salsify` — pushes that one property via `PUT /products/{id}` and leaves the rest of the Salsify record untouched.

Each per-field push is logged as an `EXPORTED` activity entry tagged `Salsify Field Sync`. A field counts as resolved once it has been pushed more recently than it was last edited; when nothing is left outstanding the product's `salsifyLastSyncedAt` is stamped and it flips back to *Synced* everywhere, exactly as a full sync would. The report's **Unsynced Fields** column counts what remains, so it ticks down as fields are resolved.

Two deliberate limits:

- A product with no prior full sync is never auto-cleared — one pushed property is no evidence the rest of the record matches. A per-field push against a part number that doesn't exist in Salsify returns `409` asking for a full sync first.
- The diff is built from `ActivityLog`, which records core product fields. Drift caused only by custom (EAV) attribute edits shows no field-level detail and must be cleared with a full sync.

**Pull from Salsify:** on the product edit page, pull the product's current Salsify state (digital-asset URLs, version, last-updated) back into Sympl. Assets display as Cloudinary-transformed thumbnails in an "In Salsify" panel with a **View in Salsify** link to the product's page on Salsify (`https://app.salsify.com/app/orgs/{orgId}/products/v2/{partNumber}`). Clicking an image thumbnail opens a lightbox gallery with square (1:1) images and prev/next navigation when multiple assets exist.

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
      reports/      # Operational reports + Excel export
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
