# Sympl Product Development Platform

A product lifecycle management platform for retail brands — centralizes product data, tracks approvals through configurable workflows, manages compliance events and pre-shipment inspections, and integrates with Salsify for data syndication.

---

## Features

- **Projects** — Organize products into projects with statuses, team members, and workflow stages. Search, filter by status, and switch between card and list views.
- **Product Grid** — Spreadsheet-style inline editing with custom EAV attributes, column tooltips, freezable columns, bulk edit, and Excel/CSV import & export.
- **Product Record** — Full edit page per product with core fields, custom attributes by section, category inheritance from project, Salsify sync button (Admin/PM), and tabs for Compliance and Inspections.
- **Workflows** — Configurable approval stages per project with per-stage approvers, voting, automatic status transitions, and reusable templates.
- **Compliance** — Track regulatory events (Prop 65, REACH, CPSC, etc.) linked to products. Bulk-link products by pasting part numbers.
- **Pre-Shipment Inspections (PSIR)** — Inspection reports with custom attributes, file attachments, pass/fail results, and bulk product linking.
- **Salsify Integration** — Map attributes to Salsify property IDs; sync all products in a project or a single product from its edit page.
- **Backup & Restore** — AES-256-GCM encrypted PostgreSQL backups written to local disk, with scheduling, retention policy, and one-click restore.
- **Admin** — Users, categories, attributes (with EAV), workflow templates, compliance types, PSIR attributes, backup, and settings.

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
NEXTAUTH_URL=http://localhost:3000

# Salsify (optional — configure in Admin → Settings)
SALSIFY_API_KEY=
SALSIFY_ORG_ID=

# Backup encryption (optional — falls back to NEXTAUTH_SECRET if not set)
# Generate with: openssl rand -hex 32
BACKUP_ENCRYPTION_KEY=
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
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

**Scheduled backup:** Sympl does not have a built-in scheduler. Add a cron job on your server:

```bash
# Daily at 2:00 AM
0 2 * * * curl -s -X POST https://your-server/api/admin/backup/run \
  -H "Cookie: next-auth.session-token=<admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"triggeredBy":"SCHEDULE"}'
```

**Restore:** Go to Admin → Backup & Restore → Restore tab. Select a snapshot and click Restore. This runs `pg_restore --clean --if-exists` — all current data is overwritten. Reload the app after restoring.

---

## Salsify Integration

1. Go to **Admin → Settings** and enter your Salsify API Key and Organization ID.
2. In **Admin → Attributes**, enable Salsify on each attribute you want to sync and enter the Salsify Property ID.
3. Sync a full project from the project page (**Sync to Salsify** button, requires `EXPORT_READY` status), or sync a single product from its edit page.

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
      admin/        # Admin pages (users, attributes, backup, etc.)
      compliance/   # Compliance events
      products/     # Global product browser + per-product edit page
      projects/     # Project list + per-project grid
      psir/         # Pre-shipment inspection reports
    api/            # API route handlers
  components/
    grid/           # Product grid (inline editing, EAV, tooltips)
    layout/         # Sidebar, shell
    ui/             # Shared UI primitives
  lib/              # Auth, Prisma client, validation, backup key
prisma/
  schema.prisma
```
