# Sympl PM - Product Development Platform

A product lifecycle management platform for retail brands — centralizes product data, tracks approvals through configurable workflows, manages compliance events and factory inspections, and integrates with Salsify for data syndication.

---

## Features

- **Dashboard** — Landing view with pipeline stats, approvals waiting on you, overdue compliance events, projects needing attention, and recent activity.
- **Projects** — Organize products into projects with statuses, team members, and workflow stages. Search and filter by status — the filter is built from the statuses configured in Admin → Settings, so relabelling or deactivating one is reflected here. Card and list views are remembered per user and persist across sessions and devices. The list view carries a **Last Activity** column (newest activity-log entry for the project, not just when the project row itself changed) and every column header sorts.
- **Product Grid** — Spreadsheet-style inline editing with custom EAV attributes, column tooltips, freezable columns, saved views (named sort/visibility/pinning combos per project), bulk edit, and Excel import & export. Computed columns show per-product required-field completeness (%) and Salsify sync freshness (Synced / Changed / never). Duplicate Part Numbers used in another project are flagged with a warning icon.
- **Product Record** — Full edit page per product with core fields, custom attributes by section, category inheritance from project, completeness chip, duplicate-part-number banner, Share / Pull-from-Salsify / Sync buttons (Admin/Director/PM), and tabs for Compliance, Inspections, and field-level change History (old → new values, with the source of the change: Project Grid, Product Record, or Import).
- **Import with dry-run** — Excel import auto-maps columns, matches rows to existing products by Part Number (update-in-place, never duplicates), and shows a Verify step with create/update counts and cell-level old → new diffs before anything is written.
- **Workflows** — Configurable approval stages per project with per-stage approvers, voting, automatic status transitions, and reusable templates. Stages can be reordered, carry due dates (overdue stages show red chips and a project-header badge, and escalate to pending approvers via the overdue cron), and can declare informational dependencies on other stages, compliance events, or inspection reports.
- **Compliance** — Track regulatory events (Prop 65, REACH, CPSC, etc.) linked to products. Bulk-link products by pasting part numbers or uploading a spreadsheet. Overdue events surface on the dashboard and trigger notifications. Image attachments preview inline.
- **Inspections** — Inspection reports with custom attributes, file attachments, pass/fail results, and bulk product linking (paste or .xlsx upload). List cards expand in place with quick status changes.
- **Notifications** — In-app bell for workflow votes, stage completions, comments, and @mentions; cron-driven overdue alerts and a scheduled leadership digest email (pipeline, compliance risk, approvals aging).
- **Comments & Attachments** — Project comments with file attachments (20 MB limit, type allowlist, served behind authentication). @mention teammates to notify them directly.
- **Salsify Integration** — Per-user API keys (each sync authenticates as the person who ran it) with org-level settings shared. Map attributes to Salsify property IDs; sync all products in a project, a selection of rows from the grid, or a single product from its edit page — with a per-attribute opt-out modal before every sync. Per-product drift detection shows what's stale in Salsify, and Pull-from-Salsify brings digital-asset URLs and state back into Sympl. Enable Salsify Debug mode in Settings for log and inspector pages.
- **Read-Only Share Links** — Expiring tokenized URLs (7/30/90 days) that let a buyer or vendor view one product or inspection report without an account. Revocable at any time.
- **Read-Only API Tokens** — Scoped `spt_` tokens (Admin → API Tokens) let ERP/BI tools pull product data via the API without a browser session.
- **Manual Status Override** — Admins, Directors, and Product Managers can set a project's status directly from the project Settings tab at any time.
- **Backup & Restore** — AES-256-GCM encrypted PostgreSQL backups plus uploaded-file archives, written to local disk with a retention policy and one-click restore. Snapshots can be downloaded and re-uploaded through the admin UI to migrate an instance between servers, and a scoped API token drives external cron automation (`scripts/backup.sh` backs up database and attachments in one crontab entry).
- **Security** — Project-level authorization on every route, authenticated file serving with an upload-type allowlist, login rate limiting (3 failures / 15 min per email+IP), rate-limited password reset endpoints, immediate session invalidation for deactivated accounts, last-admin lockout protection, AES-256-GCM encryption of Salsify API keys at rest (`ENCRYPTION_KEY`), and security response headers (HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, strict Referrer-Policy, Permissions-Policy disabling camera/mic/geo).
- **Reports** — Seven operational reports (Inspections, Compliance, Overdue Stages, Overdue Projects, Roadblocks, Out-of-Sync Products, Pipeline Summary) with filters and one-click Excel export, scoped to the projects each user can see. Out-of-Sync rows drill into a field-level drift panel (old → new, who and when) with links to the product, project, and Salsify record, and a per-field push back to Salsify.
- **Event Log** — Comprehensive platform-wide audit trail (Admin → Event Log) recording every action: product edits, workflow votes, login events, user management, settings changes, backups, and more. Filterable by user, action, entity, project, part number, and date range with a detail drawer for each entry.
- **Module toggles** — Admin → Settings → Modules can disable the Inspections module platform-wide (sidebar, pages, product/project tabs, reports, API). All inspection data is retained; re-enabling restores everything.
- **User invitations** — Adding a user takes name, email, and role; an emailed single-use link (7 days) lets them set their own password. Admins never handle a password. Un-activated accounts show as "Invite pending" with a resend action.
- **Admin password reset** — Resetting a user scrambles their stored password to a random value and emails them a 1-hour reset link. Nobody, including the admin, ever knows the interim password.
- **Bulk project actions** — Admin → Bulk Project Actions (Admins and Directors by default, configurable in Access Control) works over a filtered set of projects: transfer ownership, change status, or archive. Filter by owner and product category. Permanent delete is admin-only.
- **Admin** — Users (including invitations, per-user password reset, and activity log viewer), categories (drag to reorder and re-parent), attributes (with EAV and reorderable Lists of Values), workflow templates, compliance types, inspection attributes, API tokens, backup, access control, and settings.

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

# Email notifications (optional — without either provider, emails are silently skipped)
# Option 1: MS Graph API (Microsoft 365) — takes priority when both are set
# MSGRAPH_TENANT_ID=
# MSGRAPH_CLIENT_ID=
# MSGRAPH_CLIENT_SECRET=
# MSGRAPH_FROM_ADDRESS=no-reply@yourdomain.com

# Option 2: SMTP
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587              # default 587; use 465 with SMTP_SECURE=true
# SMTP_SECURE=false          # true = implicit TLS (port 465); false = STARTTLS
# SMTP_USER=you@gmail.com
# SMTP_PASS=app-specific-password
# SMTP_FROM=Sympl <no-reply@yourdomain.com>

# Salsify API key encryption (optional — without it, keys are stored in cleartext with a warning)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=

# Dedicated cron endpoint token (optional — falls back to backup API token)
# Separates cron auth from backup auth so a compromise of one doesn't expose the other
CRON_API_TOKEN=

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

### npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start the dev server on port 4000 (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start the production server on `$PORT` (default: none — always set PORT in env) |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:push` | Push schema changes to the database |
| `npm run db:migrate` | Create and apply Prisma migrations |
| `npm run db:seed` | Seed sections, core attributes, and an admin account |
| `npm run db:seed-qc-dims` | Seed QC dimensions column mappings (31 defaults) |
| `npm run db:studio` | Open Prisma Studio (database GUI) |

### File storage

Uploaded attachments are stored in `data/uploads` (outside the public web root) and served through an authenticated route. Back this directory up separately from the database.

---

## Adding Users

1. **Admin → Users → Add User** — enter name, email, and role.
2. Sympl creates the account with **no password** and emails an invitation. Until the invitee sets one, the account cannot sign in.
3. The invitee clicks **Set Your Password**, lands on `/accept-invite`, enters a password twice, and is redirected to sign in.
4. They log in and land on their dashboard.

Invitation links are single-use and expire after **7 days**. The user list shows un-activated accounts as *Invite pending*; the envelope icon on those rows re-sends the invitation and invalidates the previous link.

Requires SMTP (see [Email Notifications](#email-notifications-smtp)). Without it the invitation email is silently skipped — the create response returns the invite URL so an admin can copy and send it manually.

Accounts that already have a password can't be re-invited. Use the key icon on the row to reset them instead, or have the user go through **Forgot password**.

### Resetting a password

The key icon on a user row replaces their password with a random value nobody knows, then emails them a reset link valid for **1 hour**. Administrators never see, choose, or transmit a password.

An existing signed-in session survives the reset — the JWT is checked against account status, not the password. To cut off access immediately, deactivate the account, which invalidates the session within 60 seconds.

---

## Transferring Project Ownership

**Admin → Bulk Project Actions** (requires `projects:transfer_ownership`, granted to Admins and Directors by default) transfers ownership, changes status, or archives projects in bulk. Filter by current owner and product category. Permanent delete stays admin-only.

1. Filter by **current owner** to pull up one manager's whole portfolio, or leave it on *All owners* and search the master list by project, brand, or owner.
2. Tick the projects to move (or the header checkbox for everything visible). Archived projects are excluded unless you opt in.
3. Choose the new owner — only active Admins, Directors, and Product Managers are offered, since other roles can't exercise ownership.
4. Confirm.

**Keep previous owner as an editing member** (on by default) adds each outgoing owner to their project as a member with edit rights, so nothing they were working on becomes unreachable. Turn it off for a clean break.

Projects already owned by the target are skipped rather than counted. Both the new and previous owners get an inbox notification, and every transfer is written to the project's activity log as an `ownerId` change with old and new values.

---

## Roles

| Role | Access |
|------|--------|
| **Admin** | Full access — all projects, users, attributes, settings, backup |
| **Director** | Read access to *every* project (browsers, dashboard, reports) plus the Product Manager permission set. Editing a project still requires ownership or membership |
| **Product Manager** | Create/manage projects; admin attribute & category pages; Salsify sync and pull |
| **Contributor** | Edit products in assigned projects |
| **Reviewer** | View and comment; cannot edit product data |
| **Approver** | Cast approval votes on assigned workflow stages |
| **Viewer** | Read-only access to assigned projects |

---

## Access Control

**Admin → Access Control** maps each permission to the roles that hold it. Changes take effect within 30 seconds (the permission cache TTL).

| Permission | Default roles |
|---|---|
| Manage Users | Admin |
| Manage Categories | Admin, Director, Product Manager |
| Manage Attributes | Admin, Director, Product Manager |
| Manage Workflow Templates | Admin |
| Manage Compliance Types | Admin |
| Manage Inspection Attributes | Admin |
| Backup & Restore | Admin |
| Global Settings | Admin |
| Create Projects | Admin, Director, Product Manager |
| Manage Compliance Events | Admin, Director, Product Manager |
| Manage Inspection Reports | Admin, Director, Product Manager |
| Sync to Salsify | Admin, Director, Product Manager |
| Pull from Salsify | Admin, Director, Product Manager |
| Export QC Dims | Admin, Director, Product Manager |
| Override Project Status | Admin, Director, Product Manager |
| Bulk Project Actions | Admin, Director |

Every permission is enforced server-side in the API route, not only hidden in the UI. Client components read their own grants from `GET /api/config` (`permissions`) purely to hide actions the API would refuse.

**Not governed by this matrix** — these follow project membership rather than role:

- Editing products, workflow stages, members, and comments within a project requires being the owner or a member with edit rights (`canEditProject`). A Contributor can edit products in projects they belong to, and nothing in projects they don't.
- Casting approval votes requires being an assigned approver on the stage.
- Admins bypass both; Directors get read access to every project but still need ownership or membership to edit.

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

## Email Notifications

Sympl sends email notifications for workflow events, status changes, overdue alerts, and password resets. Email is optional — if neither provider is configured, all emails are silently skipped and the app works normally with in-app notifications only.

Two delivery methods are supported. When both are configured, **MS Graph takes priority**.

### Option 1: MS Graph API (Microsoft 365)

Set these environment variables in `.env` and restart:

| Variable | Required | Description |
|----------|----------|-------------|
| `MSGRAPH_TENANT_ID` | Yes | Azure AD tenant ID |
| `MSGRAPH_CLIENT_ID` | Yes | App registration client ID |
| `MSGRAPH_CLIENT_SECRET` | Yes | App registration client secret |
| `MSGRAPH_FROM_ADDRESS` | Yes | Sender email (must match a licensed M365 mailbox) |

The app registration needs the `Mail.Send` application permission in Azure AD.

### Option 2: SMTP

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
| Account invitation | Admin adds a user | Invited user |
| Password reset | On demand | Requesting user |
| Overdue alerts | Cron (`/api/cron/overdue-check`) | Event creator, project owners, pending approvers |
| Leadership digest | Cron (`/api/cron/digest`) | All active Admins, Directors, and Product Managers |

Users control which categories they receive email for in **My Profile → Notification Preferences**. Mentions and assignments default to email on; other categories default to inbox only.

### Testing

Go to **Admin → Settings → Email Notifications** to see the active provider and send a test email. The test verifies the full round-trip: connection, authentication, and delivery.

---

## Cron Jobs

Sympl has no built-in scheduler. Three endpoints are designed to be triggered by external cron jobs, all authenticated with the same `sbk_` automation token generated in **Admin → API Tokens**.

### Token types

| Prefix | Purpose | Where to generate |
|--------|---------|-------------------|
| `sbk_` | Backup & cron endpoints (backup, overdue-check, digest) | Admin → API Tokens |
| `spt_` | Read-only product API for ERP/BI tools | Admin → API Tokens |

> **Important:** `spt_` tokens do **not** work for cron endpoints. Always use the `sbk_` token for all cron jobs.

### Complete crontab

```bash
# ── Overdue compliance & workflow alerts ──────────────────────────
# Checks for overdue compliance events, overdue workflow stages,
# and items due within 3 days. Each item alerts once; changing its
# due date re-arms the alert. Also sends email when SMTP is configured.
*/15 * * * * curl -s -X POST http://localhost:8010/api/cron/overdue-check \
  -H "Authorization: Bearer sbk_<your-token>"

# ── Leadership digest ─────────────────────────────────────────────
# Pipeline/compliance/approvals-aging summary emailed to all active
# Admins, Directors, and Product Managers. Preview the HTML at /api/cron/digest
# in the browser (with an admin session) without sending.
0 7 * * 1 curl -s -X POST http://localhost:8010/api/cron/digest \
  -H "Authorization: Bearer sbk_<your-token>"

# ── Full backup (database + uploaded files) ───────────────────────
# Calls the backup API for an encrypted database dump, then tars
# data/uploads/. Old archives are pruned to the retention count
# configured in Admin → Backup & Restore.
0 2 * * * /home/jsadmin/jsproducts/SymplPM/scripts/backup.sh \
  http://localhost:8010 sbk_<your-token> /home/jsadmin/jsproducts/SymplPM/backups \
  >> /home/jsadmin/jsproducts/SymplPM/logs/sympl-backup.log 2>&1
```

> **Production port:** The production server runs on port **8010**. Replace `8010` with `4000` for dev/staging instances using `deploy.sh` + PM2.

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

Admins, Directors, and Product Managers can create expiring read-only share links for a product or inspection report (Share button on the record page). Anyone with the URL can view the data — no account required — until the link expires (7/30/90 days) or is revoked. Shared views show data only: no attachments, no navigation into the app.

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

### Row drill-down

Every report row is clickable and opens a side panel with the context behind it — related records, who owns them, what's blocking, and links to jump straight there.

| Report | Panel shows |
| --- | --- |
| Inspections | Result, dates, inspector/company/factory/country, notes · linked products (→ product) · workflow stages waiting on this inspection (→ workflow) · attachments · link to the report |
| Compliance | Severity, status, days overdue, description, notes · affected projects with owner and product count (→ project) · affected products (→ product) · stages waiting on the event · attachments |
| Overdue Stages | Due date, days overdue, project owner and status, required flag · every approver with vote status and days waiting · declared dependencies (stage / compliance event / inspection) colour-coded satisfied vs blocking |
| Overdue Projects | Owner, target launch, category, channel, product count, days idle · open stages with due dates and pending approver counts · team roster with edit rights · last 8 activity entries with old → new |
| Roadblocks | Dispatches by roadblock type to the stage, project, or inspection panel above |
| Out-of-Sync Products | Field-level drift with per-field Salsify push — see [Salsify Integration](#salsify-integration) |
| Pipeline Summary | Every project in that status/owner bucket with products, open stages, and idle days (→ project) |

**API:** `GET /api/reports/[type]` returns `{ rows }`. Each row carries a `_detail` query string; `GET /api/reports/[type]/detail?<_detail>` returns `{ title, subtitle, badges, meta, links, sections }`, which the client renders with one generic drawer. Out-of-Sync uses `GET /api/projects/[id]/products/[productId]/salsify-drift` instead, since it needs per-field sync actions.

Detail builders re-apply project scoping to whatever ids the query string names — a hand-crafted request can't reach another user's data.

---

## QC Dims Export

Select rows in a project's product grid and click **Export QC Dims** to download the QC dimensions sheet for those products, in the exact layout the inspection vendor expects: 39 columns, fixed order, styled header. Requires `products:export_qc_dims` (Admin, Director, and Product Manager by default) plus view access to the project.

**Configuring the mapping.** Which attribute feeds each column is set per attribute in **Admin → Attributes** — open an attribute and pick a column under *QC Dims Export*. Mapped attributes carry a blue **QC** badge in the list. A column can only be fed by one attribute; claiming one already in use is rejected with a message naming the attribute holding it.

Three column types behave specially, per the vendor's rules:

- **Constants** — `Discontinued Item` always exports `FALSE`, `No Inventory` always the text `NULL`. Neither is mappable.
- **Fallback** — `Customer Item Number` uses Model Number, falling back to Part Number when blank.
- **Present but unmapped** — `Packaging Description` and the five `Shipping *` columns ship empty and stay available in the dropdown.

Cell types are chosen per column so the sheet survives Excel: UPC and GTIN columns are written as **text** (a numeric cell would eat the leading zero on `099198568294`), while dimensions, weights, and quantities are written as numbers so they stay usable in formulas. `JS Item Number` is numeric when the part number is, and text otherwise.

Defaults for the 31 standard columns are applied by `npm run db:seed-qc-dims`, which maps by attribute key — stable across relabeling — and never overwrites a mapping that is already set. It is safe to re-run.

The sheet's formatting comes from a committed template at `src/lib/templates/qc-dims-template.xlsx`. To change the header, edit that file in Excel rather than the export code; update `src/lib/qc-dims.ts` only if columns are added, removed, or reordered.

---

## Salsify Integration

1. **Admin → Settings** (admins): enter the Organization ID and enable the **Enable Salsify Sync** toggle.
2. **My Profile → Salsify API Key** (each user who syncs): paste your own Salsify API key, from Salsify → User Settings → API Access. Keys are per-user, not global — every sync, pull, and debug call authenticates as the user who ran it, so Salsify attributes each change to the right person. Syncing without a key on file fails with a pointer to your profile.
3. In **Admin → Attributes**, enable Salsify on each attribute you want to sync and enter the Salsify Property ID.
4. Sync products in one of three ways (all require `EXPORT_READY` status):
   - **Full project** — click **Sync to Salsify** in the project header.
   - **Selected rows** — check rows in the product grid, then click **Sync to Salsify** in the selection toolbar.
   - **Single product** — click **Sync to Salsify** on the product edit page (`/products/[id]`).
5. A pre-sync **change report** opens before anything is written. It reads each product's current state from Salsify and shows what the push would do:
   - **Summary** — products already in Salsify, products that will be newly created, values that change, and values that will be **cleared**.
   - **Per attribute** — every property whose value differs, expandable to the per-product `Salsify's current value → what Sympl will send`. New records are marked, and each attribute carries a count of how many products it clears.
   - **Clearing warning** — Sympl sends blank fields as `null`, which empties the property in Salsify. Those are counted up front, tagged per attribute, and rendered as `(cleared)` in red, since they are the destructive case.
   - **Checkboxes** — uncheck any attribute to exclude it from this run without changing its Salsify settings. Attributes with no pending change are still sent (a no-op) so a product whose preview lookup failed is never silently under-sent.

   The preview builds its payload with the same `buildSalsifyPayload` the real push uses, so it cannot drift from what actually gets sent.

**Drift detection:** every successful sync records a per-product timestamp. The grid's **Salsify** column shows *Synced* (green, unchanged since last sync), *Changed* (yellow, edited since last sync — Salsify is stale), or *—* (never synced).

**Resolving drift field by field:** the **Out-of-Sync Products** report (Reports → Out-of-Sync Products) lists every drifted product across the projects you can see. Click a row to open a detail panel with:

- **Changes since last sync** — one card per field: old value → new value, who changed it, when, and the source (Project Grid / Product Record / Import).
- **Links** to the product record, the project, and the product's page in Salsify.
- **Per-field sync** for users with `products:sync_salsify` — pushes that one property via `PUT /products/{id}` and leaves the rest of the Salsify record untouched.

Each per-field push is logged as an `EXPORTED` activity entry tagged `Salsify Field Sync`. A field counts as resolved once it has been pushed more recently than it was last edited; when nothing is left outstanding the product's `salsifyLastSyncedAt` is stamped and it flips back to *Synced* everywhere, exactly as a full sync would. The report's **Unsynced Fields** column counts what remains, so it ticks down as fields are resolved.

Two deliberate limits:

- A product with no prior full sync is never auto-cleared — one pushed property is no evidence the rest of the record matches. A per-field push against a part number that doesn't exist in Salsify returns `409` asking for a full sync first.
- The diff is built from `ActivityLog`, which records core product fields. Drift caused only by custom (EAV) attribute edits shows no field-level detail and must be cleared with a full sync.

**Bulk pull into the product grid:** with Salsify configured and the grid holding Part Numbers, users with `products:pull_salsify` and edit access to the project get a **Pull from Salsify** button — in the grid toolbar for every row, or in the selection toolbar for checked rows only. Unlike push, a pull does not require `EXPORT_READY`.

Clicking it opens a **change report** before anything is written:

- A summary of how many products matched in Salsify, how many aren't there yet, and how many values would change. Rows with no Part Number, and Part Numbers Salsify doesn't have, are listed and left untouched.
- **Warnings** for any value Salsify sent that the target field can't represent — text into a numeric column, something other than Yes/No into a boolean. These are named with their product and attribute rather than skipped silently, since they usually mean a property is mapped to the wrong attribute type in Admin → Attributes. They are never written.
- One row per Salsify-enabled attribute that actually differs, with its change count. Expand any attribute to see every affected product as `old → new`.
- A **checkbox per attribute** — uncheck one to leave that column alone for this run.
- An **Export current data first** button, so the existing grid can be saved to Excel before it is overwritten.
- An explicit warning that the data will be overwritten and cannot be undone; nothing is written until **Overwrite & Pull** is clicked.

Values are matched to Salsify by Part Number, scoped by category the same way a push is, and the Part Number column itself is never overwritten (it is the lookup key). Multi-valued attributes are replaced wholesale rather than merged, so a property that shrank in Salsify shrinks in Sympl too. The whole pull is recorded as one activity-log entry.

**Pull from Salsify (single product):** on the product edit page, pull the product's current Salsify state (digital-asset URLs, version, last-updated) back into Sympl. Assets display as Cloudinary-transformed thumbnails in an "In Salsify" panel with a **View in Salsify** link to the product's page on Salsify (`https://app.salsify.com/app/orgs/{orgId}/products/v2/{partNumber}`). Clicking an image thumbnail opens a lightbox gallery with square (1:1) images and prev/next navigation when multiple assets exist.

Enable **Salsify Debug** in Admin → Settings to show **Salsify Log** and **Salsify Debug** pages in the admin sidebar (useful for troubleshooting payloads and sync errors).

---

## Production Deployment (SymplPM — Python venv)

The production server runs at **10.0.10.106:8010** and uses a Python-venv process manager instead of Docker or PM2. All services and files are named **SymplPM**.

### One-time setup

```bash
# Clone the repo (production branch)
git clone -b main https://github.com/ecommercejsp/sympl-pm /home/jsadmin/jsproducts/SymplPM
cd /home/jsadmin/jsproducts/SymplPM

# Create Python venv and install the process manager
bash scripts/venv_setup.sh         # defaults to /home/jsadmin/jsproducts/SymplPM/venv
# Run as root to also install the systemd unit for boot persistence:
# sudo bash scripts/venv_setup.sh

# Install Node.js (without root — uses nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts

# Create .env (see Environment Variables section above)
# Then seed the database:
npm install
npx prisma db push
npx prisma generate
npm run db:seed
```

The seed prints the bootstrap admin credentials once. Change the password after first login.

### Starting, stopping, restarting

```bash
python3 /home/jsadmin/jsproducts/SymplPM/scripts/sympl_manager.py start
python3 /home/jsadmin/jsproducts/SymplPM/scripts/sympl_manager.py stop
python3 /home/jsadmin/jsproducts/SymplPM/scripts/sympl_manager.py restart
python3 /home/jsadmin/jsproducts/SymplPM/scripts/sympl_manager.py status
```

The manager auto-loads `.env` before spawning the Node.js process, so all variables (including `DATABASE_URL`) are always available without manual exports. Logs are written to `/home/jsadmin/jsproducts/SymplPM/logs/app.log`.

### Deploying updates

```bash
cd /home/jsadmin/jsproducts/SymplPM
# If there are local conflicts from previous pulls:
git checkout scripts/deploy-prod.sh scripts/sympl_manager.py
bash scripts/deploy-prod.sh
```

`deploy-prod.sh` runs: `git pull origin main` → `chmod +x manager` → `npm install` → `prisma db push` → `prisma generate` → `npm run build` → `python3 sympl_manager.py restart`.

### Boot persistence (systemd)

A `SymplPM.service` systemd unit manages boot persistence:

```bash
sudo systemctl start SymplPM
sudo systemctl stop SymplPM
sudo systemctl restart SymplPM
sudo systemctl status SymplPM
```

The unit runs as `jsadmin` with the nvm Node.js path in its `Environment` directive. View startup logs with `journalctl -u SymplPM`.

### DATABASE_URL note

PostgreSQL passwords containing special characters (e.g. `/`) must be percent-encoded in `DATABASE_URL`:

```
DATABASE_URL=postgresql://user:P0bGtqep2QrG6QZq%2FO@localhost:5432/sympl_db
```

`/` → `%2F`, `@` → `%40`, `#` → `%23`, `?` → `%3F`. The simplest fix is to change the PostgreSQL password to one using only alphanumeric characters and hyphens.

---

## Scripts

Utility scripts are in the `scripts/` directory.

| Script | Purpose |
|--------|---------|
| `scripts/sympl_manager.py` | Python process manager — start/stop/restart/status for the SymplPM Next.js process. Auto-loads `.env`. |
| `scripts/venv_setup.sh` | One-time setup: creates the Python venv, log directory, and optionally installs the systemd unit (when run as root). |
| `scripts/deploy-prod.sh` | Production deploy: pull `main`, rebuild, and restart SymplPM. |
| `scripts/deploy.sh` | Dev/staging deploy using PM2 on the `claude/tender-gauss-iovx5c` branch. |
| `scripts/report.sh` | Print a server resource report: process status, Node memory, database size and top tables, disk usage, and overall RAM/disk. |
| `scripts/backup.sh` | Encrypted database dump + uploaded-file archive. Designed for cron — see [Cron Jobs](#cron-jobs). |

### deploy-prod.sh (production)

```bash
bash /home/jsadmin/jsproducts/SymplPM/scripts/deploy-prod.sh
```

Requires the Python venv at `$APP_DIR/venv` (created by `venv_setup.sh`). Pulls from the `main` branch. The PORT is read from `.env` or defaults to `8010`.

### deploy.sh (dev/staging)

```bash
./scripts/deploy.sh
```

Runs: `git pull` → `prisma db push` → `prisma generate` → `npm run build` → `pm2 restart sympl`. Requires pm2 (`npm install -g pm2`).

### report.sh

```bash
./scripts/report.sh
```

Outputs a snapshot of resource consumption: process uptime, Node.js RSS and CPU, PostgreSQL database and table sizes, app directory breakdown, server RAM, and disk usage. The database credentials (`DB_USER`, `PGPASSWORD`, `DB_NAME`) must match your `.env`.

---

## Database Schema Changes

After modifying `prisma/schema.prisma`, run:

```bash
npx prisma db push
npx prisma generate
```

Both are required after pulling a schema change — a missing `prisma generate` shows up as `Property 'x' does not exist on type 'PrismaClient'` at build time.

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
      psir/         # Inspection reports
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
