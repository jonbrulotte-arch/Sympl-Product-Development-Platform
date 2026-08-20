# Release Notes

---

## 🎉 v1.0.0 — Initial Release

**June 29, 2026**

> First production release of **Sympl PM** — a product lifecycle management platform built for retail brands. Everything below shipped in v1.0.

---

### 📦 Projects

Organize product development work into projects with configurable statuses, team members, and a full approval workflow. Projects move through a defined lifecycle:

`DRAFT` → `IN_PROGRESS` → `NEEDS_REVIEW` → `CHANGES_REQUESTED` → `APPROVED` → `EXPORT_READY` → `ARCHIVED`

Statuses advance automatically via workflow outcomes or can be overridden manually by Admins and Product Managers at any time. Browse projects in **card** or **list** view, filter by status, and search by name.

---

### 🗂️ Product Grid

A spreadsheet-style inline editor at the heart of every project. Ships with:

- Core product fields — Part Number, Model Number, UPC, brand, inventory status, HTS codes, dimensions, carton data, pallet data, and more
- Unlimited custom attribute columns defined per category
- Resizable, freezable, and sortable columns — widths saved per project
- **Bulk Edit** — update a field across many products at once (replace or append)
- **Import** — load products from Excel (`.xlsx`) with auto-mapped column detection
- **Export** — download the full grid as Excel with every core field and custom attribute
- **Row selection** — check any rows to scope Bulk Edit, Duplicate, Delete, or Salsify Sync to just those products

---

### 🏷️ Custom Attributes (EAV)

Admins define custom data fields beyond the built-in columns. Supported types:

`TEXT` `TEXTAREA` `NUMBER` `DECIMAL` `BOOLEAN` `DATE` `SELECT` `MULTI_SELECT` `URL` `EMAIL` `UPC` `GTIN`

Attributes can be scoped to a category, grouped into display sections, ordered with a sort index, and given a description that appears as a **column tooltip** in the grid. Multi-value attributes store up to N values per product. Bulk-manage attribute definitions by exporting to Excel, editing, and reimporting.

---

### ✅ Approval Workflows

Each project has a configurable workflow — an ordered set of stages such as *Legal Review* or *Buyer Sign-off*:

- Approvers assigned per stage vote **Approve** or **Reject**
- All approvers approving a stage triggers automatic completion and optional project status advancement
- Stages support **dependencies** — informational links to other stages, compliance events, or PSIRs — shown as a lock icon
- Stages can be reordered with ▲ / ▼ controls
- **Workflow Templates** let Admins define reusable stage sets that apply to any project in one click

---

### 🛡️ Compliance Tracking

Log regulatory and legal events — Prop 65, REACH/RoHS, CPSC, FDA, and any custom type — and link them to the products they affect:

- Events carry a **title**, **type**, **severity**, **status**, **due date**, and **notes**
- Link products individually or **bulk-link** by pasting a list of part numbers (comma, semicolon, or newline separated)
- Overdue open events are highlighted in **red**
- **Search** by title, description, part number, or product name
- Compliance events surface on each product's edit page under the Compliance tab

---

### 🔍 Pre-Shipment Inspections (PSIR)

Document quality inspections before goods ship:

- Captures inspector, inspection company, factory, date, **result** (Pass / Fail / Conditional / Pending), and **status** (Draft → Submitted → Approved / Rejected)
- **Custom PSIR attributes** defined globally — AQL level, sample size, inspection standard, etc. (Text, Number, Date, Select, Yes/No)
- **File attachments** — PDFs, photos, spreadsheets — stored per report; drag-and-drop upload
- Link products individually or via **Bulk Add** by pasting part numbers
- **Search** by title, reference number, inspector, factory, part number, or product name

---

### ⚡ Salsify Integration

Map any attribute to a Salsify property ID and sync product data to Salsify three ways (all require `EXPORT_READY` status):

| Method | How |
|--------|-----|
| **Full project** | Click **Sync to Salsify** in the project header |
| **Selected rows** | Check rows in the grid → **Sync to Salsify** in the selection toolbar |
| **Single product** | **Sync to Salsify** button on the product edit page |

Before every sync a **confirmation modal** lists all Salsify-enabled attributes grouped by section. Uncheck any attribute to exclude it from that run — without permanently changing the attribute's settings. Sync results appear inline next to the button.

Enable **Salsify Debug** mode in Admin → Settings to surface a sync log and live API inspector in the sidebar.

---

### 🌐 Global Product Browser

Search and browse products across every accessible project from a single page:

- Filter by **project**, **brand**, **inventory status**, or **category**
- Search across part number, model number, item name, brand, and UPC
- Paginated at 50 per page
- Click any product to open its full edit page with all core fields, custom attributes by section, and tabs for linked Compliance events and Inspections

---

### 💬 Comments & Attachments

Every project has a Comments tab for team discussion:

- Attach files by dragging onto the comment box or clicking the paperclip (images, PDFs, documents up to **20 MB**)
- Comment authors and Admins can delete their own comments; attached files are removed from disk on delete

---

### 💾 Backup & Restore

- **AES-256-GCM** encrypted PostgreSQL backups written to a configurable local path as `.pgenc` files
- Configure schedule (hourly, daily, weekly), time-of-day, and retention count
- **Run Now** for manual one-click backups
- **API Token** — generate a scoped `sbk_` token to trigger backups from external automation without a browser session:

  ```bash
  curl -s -X POST https://your-server/api/admin/backup/run \
    -H "Authorization: Bearer sbk_<your-token>" \
    -H "Content-Type: application/json"
  ```

- **Restore** from any saved snapshot — runs `pg_restore --clean --if-exists`; all current data is overwritten

---

### 👥 Roles & Access Control

Seven roles with permission grants configurable per role from **Admin → Access Control**:

| Role | Default Access |
|------|----------------|
| **Admin** | Full access — all projects, users, attributes, settings, backup |
| **Director** | Org-wide read access to every project, dashboard, and report; Product Manager permissions plus bulk project actions. Editing requires ownership or membership |
| **Product Manager** | Create/manage projects; attribute & category admin; Salsify sync and pull |
| **Contributor** | Edit products in assigned projects; create/edit compliance events and inspection reports |
| **Reviewer** | View and comment; no product edits |
| **Approver** | Cast approval votes on assigned workflow stages |
| **Viewer** | Read-only on assigned projects |

---

### ⚙️ Admin

| Page | What it manages |
|------|----------------|
| Users | Invite users, set roles, deactivate accounts |
| Categories | Hierarchical product categories that scope EAV attributes |
| Attributes | Create, edit, deactivate, reorder, and bulk import/export attribute definitions |
| Workflow Templates | Reusable stage sets for quick workflow setup |
| Compliance Types | Event types with name, color, and description |
| PSIR Attributes | Custom fields that appear on every inspection report |
| Event Log | Platform-wide audit trail with filters, search, and detail drawer |
| Access Control | Per-permission toggles for each role |
| Settings | Salsify credentials, debug mode, project status configuration |
| Backup & Restore | Schedule, retention, manual run, API token, restore |

---

### 📊 Reports

Seven operational reports with filters, drill-down detail panels, and one-click Excel export — scoped to each user's projects (Admins and Directors see everything):

| Report | Covers |
|--------|--------|
| Inspections | All inspection reports: result, status, inspector, factory, linked products |
| Compliance | Events by type, severity, status, due date, days overdue |
| Overdue Stages | Workflow stages past due with pending approvers |
| Overdue Projects | Active projects past target launch |
| Roadblocks | Blocked stages, stalled projects, failed inspections, aging approvals |
| Out-of-Sync Products | Products edited since their last Salsify push, with field-level drift |
| Pipeline Summary | Project and product counts by status and owner |

Every row is clickable — opens a side panel with related records, owners, blocking dependencies, and links to jump straight to the source.

---

### 🔗 Read-Only Share Links

Expiring tokenized URLs (7/30/90 days) let a buyer or vendor view one product or inspection report without an account. Revocable at any time from the record page. Available to Admins, Directors, and Product Managers.

---

### 🔑 Read-Only API Tokens

Scoped `spt_` tokens (Admin → API Tokens) let ERP/BI tools pull product data via the API without a browser session. Tokens are shown once at creation; the system stores only the SHA-256 hash.

---

### ⬇️ Pull from Salsify

Bidirectional sync — pull current Salsify values back into Sympl:

- **Bulk pull into the grid** — pull all rows or a selection, with a change report preview before anything is written. Warnings for type mismatches.
- **Single product pull** — pull digital-asset URLs and state from Salsify into the product edit page, with thumbnail previews and a lightbox gallery.

---

### 🔔 Notification Preferences

Users control per-category notification channels (inbox and/or email) from My Profile → Notification Preferences. Seven categories: Assignment, Workflow, Comment, Mention, Compliance, Inspection, General. Mentions and assignments default to email on; others default to inbox only.

---

### 📧 Leadership Digest

A weekly summary email sent to all active Admins, Directors, and Product Managers. Contains pipeline by status, compliance risk summary, and approvals aging. Triggered by external cron (`/api/cron/digest`); admin users can preview via GET without sending.

---

### 📐 QC Dims Export

Select rows in a project's product grid and click **Export QC Dims** to download the QC dimensions sheet in the exact 39-column layout the inspection vendor expects, with styled header, freeze panes, and correct cell types (text for UPC/GTIN to preserve leading zeros, numbers for dimensions). Mapping is configured per attribute in Admin → Attributes. Defaults for 31 standard columns seeded by `npm run db:seed-qc-dims`.

---

### 📦 Bulk Project Actions

Admin → Bulk Project Actions (Admins and Directors by default) works over a filtered set of projects: transfer ownership, change status, or archive. Filter by owner and product category. Permanent delete is admin-only. Previous owners can be kept as editing members.

---

### 🔧 Module Toggles

Admin → Settings → Modules can disable the Inspections module platform-wide (sidebar, pages, product/project tabs, reports, API). All inspection data is retained; re-enabling restores everything.

---

### 👤 User Invitations & Password Reset

- **Invitations** — Adding a user takes name, email, and role. An emailed single-use link (7 days) lets them set their own password. Admins never handle a password.
- **Password reset** — Scrambles the stored password to a random value and emails a 1-hour reset link. Nobody, including the admin, ever sees the interim password.
- **Self-service forgot password** — rate-limited to 5 requests per 15 minutes per email.

---

### 📧 MS Graph API Email

Email notifications can now be delivered via the **Microsoft Graph API** as an alternative to SMTP. When both are configured, MS Graph takes priority. Set `MSGRAPH_TENANT_ID`, `MSGRAPH_CLIENT_ID`, `MSGRAPH_CLIENT_SECRET`, and `MSGRAPH_FROM_ADDRESS` in your `.env` file. The app registration needs the `Mail.Send` application permission. The Admin → Settings → Email Notifications panel shows which provider is active and supports test emails for both.

---

### 📋 Event Log

A comprehensive platform-wide audit trail available at **Admin → Event Log**. Every action is recorded with full context:

- **Product & project events** — create, update, delete, status changes, imports, exports, duplications
- **Workflow events** — votes, stage completions, approver assignments
- **Login events** — successful logins, failed attempts, and lockouts (with email and IP)
- **User management** — account creation, role changes, deactivation, password resets
- **Admin config** — settings changes, permission matrix updates, category/attribute/template edits, backup/restore operations
- **Salsify** — sync and pull operations

Filter by user, action type, entity type, project, part number, or date range. Click any row to open a detail panel showing old and new values for changes, metadata, and links to the affected entity. Gated by the `admin:event_log` permission (Admin only by default).

---

### 🔐 Login Security

Reduced lockout threshold from 5 to **3 failed login attempts** before a 15-minute lockout. The lockout timer is fixed — additional failed attempts during the lockout period do not extend it. All login events are now recorded in the Event Log.

---

### 🔒 Security Hardening

- **Encryption at rest** — Salsify API keys encrypted with AES-256-GCM via `ENCRYPTION_KEY` env var; database backups encrypted with AES-256-GCM via `BACKUP_ENCRYPTION_KEY`
- **Security headers** — HSTS (1 year, includeSubDomains), X-Frame-Options DENY, X-Content-Type-Options nosniff, strict Referrer-Policy, Permissions-Policy (disables camera/mic/geo)
- **Rate limiting** — login (3 failures / 15 min per email+IP, fixed window — additional attempts do not extend lockout), forgot-password, reset-password endpoints
- **Session invalidation** — deactivated accounts lose their session within 60 seconds via JWT callback
- **Last-admin lockout protection** — prevents deactivating or demoting the last admin
- **Upload validation** — magic-byte verification for PNG, JPEG, GIF, WebP, PDF; 20 MB limit and extension allowlist
- **XLSX safety limits** — max 100,000 rows, 500 columns, 10 sheets per workbook
- **Email security** — HTML-escaped interpolations, header injection blocked by newline validation
- **IDOR protection** — compliance events and PSIRs scoped to user's project memberships
- **Error sanitization** — raw errors to server logs, generic messages to clients
- **Cron token separation** — dedicated `CRON_API_TOKEN` so a compromise doesn't expose backup credentials
- **Library migration** — replaced SheetJS (`xlsx`) with ExcelJS for all spreadsheet operations (CVE remediation)

---

### ⚠️ Known Limitations

- Sympl PM does not include a built-in backup scheduler. Use the API token with an external cron job to automate scheduled backups.
- Salsify sync requires the project to be in **Export Ready** status. Projects in earlier stages require a manual status override to sync.
- File attachments (comments, PSIR documents) are stored on the local server filesystem. Ensure that path is backed up independently of the database.

---

### 🚀 Getting Started

See the [README](./README.md) for environment setup, database initialization, and deployment instructions.
