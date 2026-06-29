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

Six roles with permission grants configurable per role from **Admin → Access Control**:

| Role | Default Access |
|------|----------------|
| **Admin** | Full access — all projects, users, attributes, settings, backup |
| **Product Manager** | Create/manage projects; attribute & category admin; Salsify sync |
| **Contributor** | Edit products in assigned projects |
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
| Access Control | Per-permission toggles for each role |
| Settings | Salsify credentials, debug mode, project status configuration |
| Backup & Restore | Schedule, retention, manual run, API token, restore |

---

### ⚠️ Known Limitations

- Sympl PM does not include a built-in backup scheduler. Use the API token with an external cron job to automate scheduled backups.
- Salsify sync requires the project to be in **Export Ready** status. Projects in earlier stages require a manual status override to sync.
- File attachments (comments, PSIR documents) are stored on the local server filesystem. Ensure that path is backed up independently of the database.

---

### 🚀 Getting Started

See the [README](./README.md) for environment setup, database initialization, and deployment instructions.
