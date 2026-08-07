"use client";

import { useState } from "react";
import {
  BookOpen, Package, FolderKanban, Upload, CheckCircle,
  ListFilter, Tag, ChevronDown, ChevronRight, Code2, Zap,
  Info, Search, ShieldCheck, ClipboardCheck, HardDrive,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Section = {
  id: string;
  icon: React.ElementType;
  title: string;
  color: string;
  content: React.ReactNode;
};

// ─── Shared style helpers ────────────────────────────────────────────────────

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-base font-semibold text-gray-900 mt-5 mb-2 first:mt-0">{children}</h3>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-gray-600 leading-relaxed mb-3">{children}</p>
);

const UL = ({ children }: { children: React.ReactNode }) => (
  <ul className="space-y-1 mb-3 pl-4">{children}</ul>
);

const LI = ({ children }: { children: React.ReactNode }) => (
  <li className="text-sm text-gray-600 leading-relaxed list-disc">{children}</li>
);

const Callout = ({ children, type = "info" }: { children: React.ReactNode; type?: "info" | "tip" }) => (
  <div className={`rounded-lg px-4 py-3 mb-3 flex gap-2 ${type === "tip" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-blue-50 text-blue-800 border border-blue-200"}`}>
    <Info className="h-4 w-4 shrink-0 mt-0.5" />
    <p className="text-sm leading-relaxed">{children}</p>
  </div>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="bg-gray-100 text-gray-800 text-xs font-mono px-1.5 py-0.5 rounded">{children}</code>
);

const ApiBlock = ({ method, path, description, params, body, response }: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  params?: { name: string; type: string; desc: string }[];
  body?: { name: string; type: string; required?: boolean; desc: string }[];
  response?: string;
}) => {
  const color = { GET: "bg-blue-100 text-blue-800", POST: "bg-green-100 text-green-800", PATCH: "bg-amber-100 text-amber-800", DELETE: "bg-red-100 text-red-800" }[method];
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${color}`}>{method}</span>
        <code className="text-sm font-mono text-gray-800">{path}</code>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm text-gray-600">{description}</p>
        {params && params.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Query Parameters</p>
            <div className="space-y-1">
              {params.map((p) => (
                <div key={p.name} className="flex gap-2 text-sm">
                  <code className="text-xs font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{p.name}</code>
                  <span className="text-xs text-gray-400 shrink-0 pt-0.5">{p.type}</span>
                  <span className="text-gray-600 text-xs pt-0.5">{p.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {body && body.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Request Body</p>
            <div className="space-y-1">
              {body.map((b) => (
                <div key={b.name} className="flex gap-2 text-sm">
                  <code className="text-xs font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{b.name}</code>
                  <span className="text-xs text-gray-400 shrink-0 pt-0.5">{b.type}</span>
                  {b.required && <span className="text-xs text-red-500 shrink-0 pt-0.5">required</span>}
                  <span className="text-gray-600 text-xs pt-0.5">{b.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {response && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Response</p>
            <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto">{response}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Sections content ────────────────────────────────────────────────────────

const sections: Section[] = [
  {
    id: "getting-started",
    icon: BookOpen,
    title: "Getting Started",
    color: "text-blue-600 bg-blue-50",
    content: (
      <>
        <H3>What is Sympl?</H3>
        <P>
          Sympl is a product development platform for managing the full lifecycle of retail products —
          from initial spec through retailer readiness. It centralizes product data, tracks approvals,
          and integrates with systems like Salsify.
        </P>

        <H3>Your first project</H3>
        <UL>
          <LI>Go to <strong>Projects</strong> in the sidebar and click <strong>New Project</strong>.</LI>
          <LI>Fill in the name, brand, retailer, channel, and target launch date.</LI>
          <LI>Invite team members via the project Settings tab.</LI>
          <LI>Switch to the <strong>Products</strong> tab inside the project and add rows, or use <strong>Import</strong> to bulk-load from Excel.</LI>
        </UL>

        <H3>Roles</H3>
        <UL>
          <LI><strong>Admin</strong> — full access to all projects, users, attributes, settings, and backup.</LI>
          <LI><strong>Product Manager</strong> — can create and manage projects; access to admin attribute/category pages; can sync products to Salsify.</LI>
          <LI><strong>Contributor</strong> — can edit products in projects they belong to.</LI>
          <LI><strong>Reviewer</strong> — can view and comment on projects; cannot edit product data.</LI>
          <LI><strong>Approver</strong> — can cast approval votes on workflow stages they are assigned to.</LI>
          <LI><strong>Viewer</strong> — read-only access to their projects.</LI>
        </UL>

        <Callout>All product data is project-scoped. The global Products page lets you search and edit across all your projects at once.</Callout>
      </>
    ),
  },
  {
    id: "projects",
    icon: FolderKanban,
    title: "Projects",
    color: "text-indigo-600 bg-indigo-50",
    content: (
      <>
        <H3>Project statuses</H3>
        <UL>
          <LI><strong>Draft</strong> — work in progress, not yet submitted.</LI>
          <LI><strong>In Progress</strong> — actively being worked on.</LI>
          <LI><strong>Needs Review</strong> — submitted for internal review.</LI>
          <LI><strong>Changes Requested</strong> — reviewer has requested revisions.</LI>
          <LI><strong>Approved</strong> — all required workflow stages have been approved.</LI>
          <LI><strong>Export Ready</strong> — data is finalized and ready to push to downstream systems (e.g. Salsify).</LI>
          <LI><strong>Archived</strong> — project is closed and no longer active.</LI>
        </UL>

        <H3>Search & Filter</H3>
        <P>The Projects page supports searching by project name and filtering by status. Use the search bar to find projects by name, and the status dropdown to narrow by current status. Toggle between <strong>Card</strong> and <strong>List</strong> view using the icons in the top-right — the list view shows all key columns in a compact table.</P>

        <H3>Members</H3>
        <P>Add members to a project from the Settings tab. Members inherit the permissions of their global role. The project owner always has editor-level access regardless of role.</P>

        <H3>Workflow</H3>
        <P>
          Each project has a workflow made up of stages (e.g. "Legal Review", "Buyer Sign-off"). Stages are worked through in order.
          Approvers are assigned per stage and must vote Approve or Reject.
          When all approvers on a stage approve, the stage completes automatically.
        </P>
        <UL>
          <LI>Use <strong>On Approval → set project status</strong> to automatically advance the project status when a stage is approved.</LI>
          <LI>Use workflow templates (admin) to apply a pre-built set of stages in one click.</LI>
          <LI>Use the <strong>▲ / ▼</strong> buttons on each stage to reorder stages within the workflow.</LI>
          <LI>Set a <strong>Dependency</strong> on a stage to indicate it relies on another workflow stage, a compliance event, or a PSIR being resolved first. Dependencies are informational — they show a lock icon but do not prevent voting or advancing the stage.</LI>
          <LI>Set a <strong>due date</strong> on any open stage using the date picker under its description. Stages past their date show a red <strong>overdue</strong> chip, the project header shows a red <em>&quot;N stages overdue&quot;</em> badge, and pending approvers are notified (in-app and email) when the overdue-check cron runs.</LI>
        </UL>

        <H3>Manual status override</H3>
        <P>Admins and Product Managers can override a project&apos;s status at any time from the project <strong>Settings</strong> tab. Select the desired status from the dropdown and click <strong>Save Status</strong>. This is useful for correcting status without waiting for a workflow stage to complete.</P>

        <H3>Comments &amp; attachments</H3>
        <P>The <strong>Comments</strong> tab on any project lets team members leave notes and attach files. Click the paperclip icon or drag a file onto the comment box to attach it. Supported file types: images, PDFs, spreadsheets, and most document formats (up to 20 MB per file).</P>
        <P>Comment authors and Admins can delete their own comments using the trash icon that appears on hover. Deleting a comment also removes any attached files from the server.</P>
        <P>New comments notify the project owner and members through the notification bell. Type <Code>@</Code> followed by a teammate&apos;s first name, full name, or email prefix (e.g. <Code>@jon</Code>) to send them a dedicated <em>&quot;mentioned you&quot;</em> notification instead.</P>

        <Callout type="tip">Column widths in the product grid are saved per project. Drag the resize handle on any column edge to adjust.</Callout>
      </>
    ),
  },
  {
    id: "products",
    icon: Package,
    title: "Products (Grid)",
    color: "text-teal-600 bg-teal-50",
    content: (
      <>
        <H3>Editing cells</H3>
        <P>Click any cell to enter edit mode. Press <Code>Tab</Code> / <Code>Shift+Tab</Code> to move across columns, <Code>Enter</Code> to commit and move down, <Code>Escape</Code> to cancel. Changes save automatically on blur.</P>

        <H3>Multi-value (EAV) attributes</H3>
        <P>Custom attributes can store multiple values (e.g. multiple engineers on a product). In the cell, values are shown joined by <Code>·</Code>. Click the cell to open a chip editor — add or remove individual values there.</P>

        <H3>Bulk edit</H3>
        <UL>
          <LI>Select one or more rows with the checkboxes on the left.</LI>
          <LI>Click <strong>Bulk Edit</strong> in the toolbar.</LI>
          <LI>Choose <strong>Replace</strong> to overwrite the field, or <strong>Append</strong> to add to multi-value attributes.</LI>
        </UL>

        <H3>Column tooltips</H3>
        <P>Hover over any column header to see its description. An <strong>ⓘ</strong> icon appears on hover — holding over it shows the tooltip. Descriptions are set per attribute in <strong>Admin → Attributes</strong>.</P>

        <H3>Freezing columns</H3>
        <P>Hover over a column header and click the pin icon to freeze it to the left side of the grid. Frozen columns stay visible while scrolling horizontally.</P>

        <H3>Saved views</H3>
        <P>The <strong>Views</strong> menu in the toolbar saves the current sort, column visibility, pinning, and search as a named view (e.g. <em>&quot;Missing UPC&quot;</em>). Views are saved per project on your browser, alongside column widths. Apply or delete them from the same menu.</P>

        <H3>Computed columns</H3>
        <UL>
          <LI><strong>Complete</strong> — the percentage of REQUIRED attributes filled in for each product, color-coded green / yellow / red. Requirement levels are set per attribute in <strong>Admin → Attributes</strong>.</LI>
          <LI><strong>Salsify</strong> — <em>Synced</em> (green) when the product is unchanged since its last Salsify sync, <em>Changed</em> (yellow) when it has been edited since, or <em>—</em> if never synced.</LI>
        </UL>

        <H3>Duplicate part number alert</H3>
        <P>If a product&apos;s Part Number is already used by a product in <em>another</em> project (system-wide), an amber warning triangle appears next to the Part Number cell — hover it to see which project. The same alert appears in the global Products browser and as a banner on the product record page.</P>

        <H3>Sync to Salsify from the grid</H3>
        <P>When one or more rows are selected, a green <strong>Sync to Salsify</strong> button appears in the selection toolbar (alongside Bulk Edit, Duplicate, and Delete). Clicking it opens the same attribute opt-out modal and syncs only the selected products. The button is only shown when the project is in <strong>Export Ready</strong> status and Salsify is enabled.</P>

        <H3>Import / Export</H3>
        <UL>
          <LI><strong>Import</strong> — upload an Excel (<Code>.xlsx</Code>) file. Map source columns to Sympl fields on the next screen (auto-detected by header name), then review a <strong>Verify</strong> step showing exactly how many rows will be created vs. updated — including cell-level old → new diffs — before anything is written.</LI>
          <LI>Rows are matched to existing products by <strong>Part Number</strong>: matches update in place, new part numbers create new rows. Re-importing the same sheet never creates duplicates.</LI>
          <LI><strong>Export</strong> — downloads all products as Excel with every core field and custom attribute, columns ordered by attribute section (matching Admin → Attributes).</LI>
        </UL>
      </>
    ),
  },
  {
    id: "global-products",
    icon: Search,
    title: "Global Products Browser",
    color: "text-cyan-600 bg-cyan-50",
    content: (
      <>
        <H3>Browsing across projects</H3>
        <P>
          The <strong>Products</strong> page in the sidebar shows all products across every project you have access to, paginated 50 at a time. Admins see all products; other users see only products from their projects.
        </P>

        <H3>Filters</H3>
        <UL>
          <LI><strong>Search</strong> — matches part number, model number, item name, brand, or UPC.</LI>
          <LI><strong>Project</strong> — filter to a single project.</LI>
          <LI><strong>Brand</strong> — filter by brand name.</LI>
          <LI><strong>Inventory Status</strong> — filter by status value.</LI>
          <LI><strong>Category</strong> — filter by product category.</LI>
        </UL>

        <H3>Full product edit page</H3>
        <P>Click any row to open the full product edit page at <Code>/products/[id]</Code>. This page shows every core field and every EAV attribute organized by section, plus tabs for <strong>Compliance</strong> events, <strong>Inspections</strong> (PSIRs), and <strong>History</strong> — the full field-level change log showing who changed what, when, and the old → new values.</P>
        <P>The header shows a <strong>% complete</strong> chip (required fields filled in) and, for Admins and Product Managers, <strong>Share</strong>, <strong>Pull from Salsify</strong>, and <strong>Sync to Salsify</strong> buttons.</P>
      </>
    ),
  },
  {
    id: "compliance",
    icon: ShieldCheck,
    title: "Compliance",
    color: "text-indigo-600 bg-indigo-50",
    content: (
      <>
        <H3>What is a compliance event?</H3>
        <P>
          A compliance event captures a regulatory or legal issue that affects one or more products —
          for example a Prop 65 test, a REACH assessment, or a CPSC recall. Each event is linked to
          the products it covers and carries a status, severity, due date, and free-form notes.
        </P>

        <H3>Event types</H3>
        <P>
          Admins define event types at <strong>Admin → Compliance Types</strong>. Each type has a
          name, color, and optional description. Examples: <em>CA Prop 65</em>, <em>REACH / RoHS</em>,
          <em>CPSC</em>, <em>FDA</em>.
        </P>

        <H3>Creating an event</H3>
        <UL>
          <LI>Go to <strong>Compliance</strong> in the sidebar and click <strong>New Event</strong>.</LI>
          <LI>Enter a title, select the event type and severity, and optionally set a due date.</LI>
          <LI>Use <strong>Search</strong> to find individual products, or switch to <strong>Paste / Bulk</strong> to paste a list of part numbers (comma, semicolon, or newline separated) — or click <strong>upload .xlsx</strong> to fill the list from a spreadsheet&apos;s Part Number column — and resolve them all at once.</LI>
        </UL>

        <H3>Statuses</H3>
        <UL>
          <LI><strong>OPEN</strong> — issue identified, no action taken.</LI>
          <LI><strong>IN_PROGRESS</strong> — remediation underway.</LI>
          <LI><strong>RESOLVED</strong> — issue corrected.</LI>
          <LI><strong>CLOSED</strong> — event closed (may not be fully resolved).</LI>
          <LI><strong>WAIVED</strong> — event acknowledged and formally waived.</LI>
        </UL>

        <H3>Search</H3>
        <P>The search bar on the Compliance list matches event title, description, <strong>part number</strong>, and product name. Searching by part number returns all events linked to products with that part number.</P>

        <H3>Product tab on product edit page</H3>
        <P>When viewing a product at <Code>/products/[id]</Code>, switch to the <strong>Compliance</strong> tab to see all events linked to that product and log new ones without leaving the product view.</P>

        <Callout type="tip">Overdue events (due date passed while still OPEN) are highlighted in red on the compliance list, surface on the Dashboard&apos;s <strong>Overdue Compliance</strong> card, and trigger a one-time notification to the event creator and affected project owners when the overdue-check cron runs. Changing the due date re-arms the alert.</Callout>
        <P>Image attachments show as thumbnails in the expanded event card; PDFs open inline in a new tab.</P>
      </>
    ),
  },
  {
    id: "psir",
    icon: ClipboardCheck,
    title: "Pre-Shipment Inspections (PSIR)",
    color: "text-violet-600 bg-violet-50",
    content: (
      <>
        <H3>What is a PSIR?</H3>
        <P>
          A Pre-Shipment Inspection Report documents the quality inspection performed at a factory
          before goods ship. Each report captures the inspector, inspection company, factory, date,
          result (PASS / FAIL / CONDITIONAL / PENDING), and any supporting documents.
          A single PSIR can cover multiple products from one or more projects.
        </P>

        <H3>Creating a report</H3>
        <UL>
          <LI>Go to <strong>Inspections</strong> in the sidebar and click <strong>New Report</strong>.</LI>
          <LI>Enter a title — you are taken to the full report detail page where you fill in all fields.</LI>
          <LI>Link products by searching in the Products section of the report, or use <strong>Bulk Add</strong> to paste a list of part numbers and resolve them all at once.</LI>
          <LI>Upload the inspection document (PDF, Excel, images, or any format) by dragging a file onto the Documents area or clicking <strong>Upload File</strong>.</LI>
        </UL>

        <H3>Results</H3>
        <UL>
          <LI><strong>PASS</strong> — shipment cleared.</LI>
          <LI><strong>FAIL</strong> — shipment blocked; rework or re-inspection required.</LI>
          <LI><strong>CONDITIONAL</strong> — shipment allowed with noted deficiencies.</LI>
          <LI><strong>PENDING</strong> — inspection not yet complete.</LI>
        </UL>

        <H3>Statuses</H3>
        <UL>
          <LI><strong>DRAFT</strong> — report in progress.</LI>
          <LI><strong>SUBMITTED</strong> — report submitted for internal review.</LI>
          <LI><strong>APPROVED</strong> — report accepted.</LI>
          <LI><strong>REJECTED</strong> — report rejected; follow-up required.</LI>
        </UL>

        <H3>Search</H3>
        <P>The search bar on the Inspections list matches the report title, reference number, inspector, inspection company, factory, <strong>part number</strong>, and product name. Searching by part number returns all reports that include a product with that part number.</P>

        <H3>Custom attributes</H3>
        <P>Admins can define additional fields to capture on every PSIR — for example AQL level, sample size, or inspection standard — at <strong>Admin → PSIR Attributes</strong>. Supported types: Text, Text Area, Number, Date, Select (dropdown), and Yes/No.</P>

        <H3>File uploads</H3>
        <P>Drag and drop files directly onto the Documents section or click Upload File. Files are stored on the server and can be downloaded at any time. Deleting a document removes it from disk immediately.</P>

        <H3>Bulk Add products</H3>
        <P>In the Products section of a PSIR, click <strong>Bulk Add</strong> to open a paste panel. Paste part numbers separated by commas, semicolons, or newlines — or click <strong>Upload .xlsx</strong> to fill the list from a spreadsheet&apos;s Part Number column — then click <strong>Look Up</strong>. Sympl resolves each part number and shows a green (found) or red (not found) preview. Click <strong>Add N Products</strong> to link all resolved products at once.</P>

        <H3>Inspections list</H3>
        <P>Reports on the Inspections page expand in place — click the chevron to see notes, linked products, and attachments (with image thumbnails), and change status with one click, without opening the full report. The pencil icon opens the full detail page.</P>

        <H3>Sharing a report</H3>
        <P>Admins and Product Managers can create an expiring read-only <strong>share link</strong> from the report detail page — see the <em>Notifications, Sharing &amp; Alerts</em> section below.</P>

        <H3>Product tab on product edit page</H3>
        <P>When viewing a product at <Code>/products/[id]</Code>, switch to the <strong>Inspections</strong> tab to see all PSIRs linked to that product.</P>
      </>
    ),
  },
  {
    id: "attributes",
    icon: ListFilter,
    title: "Attributes",
    color: "text-purple-600 bg-purple-50",
    content: (
      <>
        <H3>What are attributes?</H3>
        <P>
          Attributes are custom data fields that extend product records beyond the built-in columns.
          They are defined globally by admins and can be scoped to specific categories.
          Attribute values are stored per product and appear as columns in the product grid.
        </P>

        <H3>Attribute types</H3>
        <UL>
          <LI><strong>TEXT / TEXTAREA</strong> — short or long free-text input.</LI>
          <LI><strong>NUMBER / DECIMAL</strong> — numeric values (integer or decimal).</LI>
          <LI><strong>BOOLEAN</strong> — true / false toggle.</LI>
          <LI><strong>DATE</strong> — calendar date.</LI>
          <LI><strong>SELECT / MULTI_SELECT</strong> — dropdown from a defined list of values (LOV).</LI>
          <LI><strong>URL / EMAIL</strong> — validated link or email field.</LI>
          <LI><strong>UPC / GTIN</strong> — barcode identifier fields.</LI>
        </UL>

        <H3>Max Values</H3>
        <P>Setting Max Values &gt; 1 makes an attribute multi-value (e.g. multiple team members). In the grid, values appear joined by <Code>·</Code>.</P>

        <H3>Reordering Lists of Values</H3>
        <P>For SELECT and MULTI_SELECT attributes, use the <strong>▲ / ▼</strong> buttons next to each List of Values entry in the attribute editor to control the order options appear in the dropdown.</P>

        <H3>Descriptions / Tooltips</H3>
        <P>The <strong>Description</strong> field on each attribute becomes the tooltip shown when hovering the column header in the product grid. Use it to explain what the field means, acceptable formats, or where the value comes from.</P>

        <H3>Deleting attributes</H3>
        <P>Non-core custom attributes can be deleted using the trash icon on the Attributes admin page. Deletion is blocked if any product has data stored for that attribute — remove the data first, or deactivate the attribute instead. Core attributes (those backed by typed database columns) cannot be deleted.</P>

        <H3>Salsify integration</H3>
        <P>Enable <strong>Salsify</strong> on an attribute and enter the Salsify Property ID. When products are synced, this attribute's value is sent to that Salsify property. Multi-value attributes are sent as arrays.</P>

        <H3>Bulk update via Export / Import</H3>
        <P>You can update many attribute definitions at once — including their display order — using the Export/Import workflow on the Attributes admin page.</P>
        <UL>
          <LI>Click <strong>Export</strong> (top-right of the Attributes page) to download the current attribute list as an Excel file.</LI>
          <LI>Edit the spreadsheet: update labels, descriptions, types, requirements, LOV values, or the <Code>sortOrder</Code> column to control display order.</LI>
          <LI>The <Code>sortOrder</Code> column is a number — lower numbers appear first within a section. Attributes in the same section are sorted by <Code>sortOrder</Code> ascending.</LI>
          <LI>Save the file and click <strong>Import</strong> on the Attributes page to upload it. Existing attributes (matched by <Code>key</Code>) are updated; rows with a new key create new attributes.</LI>
          <LI>After importing, the Attributes page and all project grids will reflect the new order immediately.</LI>
        </UL>
        <Callout type="tip">Do not change the <Code>key</Code> column — it is the unique identifier used to match rows on import. Changing a key creates a new attribute instead of updating the existing one.</Callout>
      </>
    ),
  },
  {
    id: "import",
    icon: Upload,
    title: "Import",
    color: "text-orange-600 bg-orange-50",
    content: (
      <>
        <H3>Supported formats</H3>
        <P>Excel (<Code>.xlsx</Code>) and comma-separated (<Code>.csv</Code>) files. The first sheet is used by default; you can choose a different sheet on the upload screen.</P>

        <H3>Column mapping</H3>
        <P>After uploading, Sympl auto-maps columns whose names match known Sympl field labels. Review and correct mappings before importing.</P>

        <H3>Duplicate detection</H3>
        <P>Rows whose Part Number already exists in the target project are flagged as duplicates. You can choose to skip or overwrite them.</P>

        <H3>Required fields</H3>
        <P>Part Number is required for every product row. Rows missing it are skipped with a validation error shown in the import summary.</P>

        <Callout type="tip">You can import into a new project directly from the Import page — select "Create new project" in the project picker on the column mapping step.</Callout>
      </>
    ),
  },
  {
    id: "activity",
    icon: CheckCircle,
    title: "Activity Log",
    color: "text-green-600 bg-green-50",
    content: (
      <>
        <H3>What is logged</H3>
        <P>Every significant action in a project is captured in the Activity Log:</P>
        <UL>
          <LI>Product field edits (old value → new value per field).</LI>
          <LI>Workflow stage created, deleted, status changed.</LI>
          <LI>Approver votes (Approved / Rejected), with comments.</LI>
          <LI>Products imported, exported, duplicated, or archived.</LI>
          <LI>Comments added.</LI>
        </UL>

        <H3>Filtering the log</H3>
        <P>Use the filter controls at the top of the Activity tab to narrow by:</P>
        <UL>
          <LI><strong>Type</strong> — Workflow stages, Products, or Project-level changes.</LI>
          <LI><strong>Action</strong> — Approved, Rejected, Status changed, Created, Updated, Deleted, Commented, Assigned.</LI>
          <LI><strong>User</strong> — any project member.</LI>
        </UL>

        <H3>Old → new values</H3>
        <P>Field edits show the previous and new value side by side (e.g. <em>Model Number: 1010 → 1020</em>), with field keys shown in readable form. A <strong>via</strong> badge on each entry shows where the change came from.</P>

        <H3>Source of change</H3>
        <UL>
          <LI><strong>Project Grid</strong> — edited inline in the product grid, including bulk edit.</LI>
          <LI><strong>Product Record</strong> — edited on the full product edit page.</LI>
          <LI><strong>Import</strong> — created or updated via an Excel import.</LI>
        </UL>

        <H3>Per-user activity (Admin)</H3>
        <P>Admins can view any user&apos;s recent activity from <strong>Admin → Users</strong> — click the clock icon on a user&apos;s row to open their last 100 actions across all projects.</P>
      </>
    ),
  },
  {
    id: "api",
    icon: Code2,
    title: "API Reference",
    color: "text-gray-700 bg-gray-100",
    content: (
      <>
        <P>All endpoints require a valid session cookie (sign in via the web UI) or a Bearer token. All request/response bodies are JSON unless noted. Dates are ISO-8601 strings.</P>

        <Callout>The base URL for all endpoints is <Code>/api</Code>. Replace <Code>:id</Code> with the project CUID and <Code>:productId</Code> with the product CUID.</Callout>

        <H3>Projects</H3>

        <ApiBlock
          method="GET"
          path="/api/projects"
          description="List all projects the authenticated user has access to. Admins see all projects."
          response={`[
  {
    "id": "cmqq2t...",
    "name": "Spring Launch 2026",
    "status": "IN_REVIEW",
    "brand": "Acme",
    "retailer": "Target",
    "_count": { "products": 42 }
  }
]`}
        />

        <ApiBlock
          method="POST"
          path="/api/projects"
          description="Create a new project."
          body={[
            { name: "name", type: "string", required: true, desc: "Project name." },
            { name: "brand", type: "string", desc: "Brand name." },
            { name: "retailer", type: "string", desc: "Retailer name." },
            { name: "channel", type: "string", desc: "Sales channel (e.g. ecommerce, brick-and-mortar)." },
            { name: "targetLaunchDate", type: "ISO date", desc: "Expected launch date." },
            { name: "categoryId", type: "string", desc: "Category CUID to scope EAV attributes." },
          ]}
          response={`{ "id": "cmqq2t...", "name": "Spring Launch 2026", ... }`}
        />

        <ApiBlock
          method="PATCH"
          path="/api/projects/:id"
          description="Update project metadata. Pass only the fields you want to change."
          body={[
            { name: "name", type: "string", desc: "New project name." },
            { name: "status", type: "ProjectStatus", desc: "DRAFT | IN_REVIEW | APPROVED | REJECTED | ON_HOLD | CANCELLED | COMPLETED." },
            { name: "brand", type: "string", desc: "Brand name." },
            { name: "tags", type: "string[]", desc: "Array of tag strings." },
          ]}
        />

        <H3>Products</H3>

        <ApiBlock
          method="GET"
          path="/api/projects/:id/products"
          description="List all non-archived products in a project, ordered by rowIndex."
          response={`[
  {
    "id": "cmqq2t...",
    "partNumber": "ABC-123",
    "itemName": "Widget Pro",
    "upc": "012345678901",
    "inventoryStatus": "Active",
    "attributeValues": [
      {
        "attributeDefinitionId": "...",
        "valueIndex": 0,
        "textValue": "Blue",
        "attributeDefinition": { "key": "color", "label": "Color" }
      }
    ]
  }
]`}
        />

        <ApiBlock
          method="POST"
          path="/api/projects/:id/products"
          description="Create a new product record in the project."
          body={[
            { name: "partNumber", type: "string", required: true, desc: "Unique part identifier." },
            { name: "itemName", type: "string", desc: "Display name of the product." },
            { name: "brand", type: "string", desc: "Brand." },
            { name: "upc", type: "string", desc: "12-digit UPC barcode." },
            { name: "attributeValues", type: "AttrValue[]", desc: "Array of EAV values: { attributeDefinitionId, valueIndex, textValue?, numberValue?, booleanValue? }." },
          ]}
        />

        <ApiBlock
          method="PATCH"
          path="/api/projects/:id/products/:productId"
          description="Update a product. EAV attributeValues are replaced (delete-then-insert) per attributeDefinitionId."
          body={[
            { name: "partNumber", type: "string", desc: "New part number." },
            { name: "itemName", type: "string", desc: "New item name." },
            { name: "inventoryStatus", type: "string", desc: "Inventory status string." },
            { name: "attributeValues", type: "AttrValue[]", desc: "Replaces existing values for each attributeDefinitionId present in the array." },
          ]}
        />

        <ApiBlock
          method="DELETE"
          path="/api/projects/:id/products/:productId"
          description="Soft-delete (archive) a product. It no longer appears in the grid but is not removed from the database."
          response={`{ "success": true }`}
        />

        <H3>Global Products</H3>

        <ApiBlock
          method="GET"
          path="/api/products"
          description="Browse products across all accessible projects with server-side filtering and pagination."
          params={[
            { name: "page", type: "number", desc: "Page number, default 1." },
            { name: "search", type: "string", desc: "Full-text search across partNumber, modelNumber, itemName, brand, upc." },
            { name: "projectId", type: "string", desc: "Filter to a single project." },
            { name: "brand", type: "string", desc: "Exact brand match." },
            { name: "inventoryStatus", type: "string", desc: "Exact inventory status match." },
            { name: "categoryId", type: "string", desc: "Filter by category CUID." },
          ]}
          response={`{
  "data": [ /* product records */ ],
  "total": 214,
  "page": 1,
  "pageSize": 50,
  "totalPages": 5
}`}
        />

        <H3>Workflow</H3>

        <ApiBlock
          method="POST"
          path="/api/projects/:id/workflow"
          description="Create a new workflow stage, or apply a workflow template."
          body={[
            { name: "name", type: "string", required: true, desc: "Stage name (e.g. 'Legal Review')." },
            { name: "description", type: "string", desc: "Optional stage description." },
            { name: "sortOrder", type: "number", desc: "Display order (0-indexed)." },
            { name: "onApproveSetStatus", type: "ProjectStatus", desc: "Automatically set project status when this stage is approved." },
            { name: "onRejectSetStatus", type: "ProjectStatus", desc: "Automatically set project status when this stage is rejected." },
            { name: "applyTemplateId", type: "string", desc: "Pass a WorkflowTemplate CUID to apply all its stages at once (ignores other fields)." },
          ]}
        />

        <ApiBlock
          method="PATCH"
          path="/api/projects/:id/workflow"
          description="Update a stage, record an approver vote, or reset a stage."
          body={[
            { name: "stageId", type: "string", required: true, desc: "WorkflowStage CUID." },
            { name: "vote", type: "APPROVED | REJECTED", desc: "Cast your approval vote (only for assigned approvers)." },
            { name: "voteComment", type: "string", desc: "Optional comment with your vote." },
            { name: "status", type: "WorkflowStageStatus", desc: "Manually override stage status (admin/PM only)." },
            { name: "reset", type: "boolean", desc: "Pass true to reset stage and all approvals back to PENDING." },
          ]}
        />

        <H3>Activity Log</H3>

        <ApiBlock
          method="GET"
          path="/api/projects/:id/activity"
          description="Retrieve the project activity log, newest first, paginated 50 per page."
          params={[
            { name: "page", type: "number", desc: "Page number, default 1." },
            { name: "entityType", type: "string", desc: "Filter by entity type: WorkflowStage, ProductRecord, Project." },
            { name: "action", type: "ActivityAction", desc: "Filter by action: CREATED, UPDATED, DELETED, APPROVED, REJECTED, STATUS_CHANGED, etc." },
            { name: "userId", type: "string", desc: "Filter by the user who performed the action." },
          ]}
          response={`{
  "data": [
    {
      "id": "...",
      "action": "APPROVED",
      "entityType": "WorkflowStage",
      "fieldKey": "approval",
      "newValue": "APPROVED",
      "metadata": { "stageName": "Legal Review", "comment": "Looks good" },
      "createdAt": "2026-06-24T14:23:00Z",
      "user": { "id": "...", "name": "Jon Brulotte" }
    }
  ],
  "total": 38,
  "page": 1,
  "pageSize": 50
}`}
        />

        <H3>Attributes</H3>

        <ApiBlock
          method="GET"
          path="/api/attributes"
          description="List all attribute definitions (admins and PMs only)."
        />

        <ApiBlock
          method="POST"
          path="/api/attributes"
          description="Create a new attribute definition."
          body={[
            { name: "key", type: "string", required: true, desc: "Unique machine key (e.g. project_engineer). Cannot be changed after creation." },
            { name: "label", type: "string", required: true, desc: "Display name shown in the grid header." },
            { name: "description", type: "string", desc: "Tooltip text shown on hover in the product grid." },
            { name: "attributeType", type: "AttributeType", desc: "TEXT | TEXTAREA | NUMBER | DECIMAL | BOOLEAN | DATE | SELECT | MULTI_SELECT | URL | EMAIL | UPC | GTIN." },
            { name: "requirement", type: "FieldRequirement", desc: "REQUIRED | CONDITIONAL | OPTIONAL." },
            { name: "maxValues", type: "number", desc: "Maximum number of values (>1 makes multi-value). Default 1." },
            { name: "salsifyEnabled", type: "boolean", desc: "Whether to sync this attribute to Salsify." },
            { name: "salsifyPropertyId", type: "string", desc: "Salsify property name to map to." },
            { name: "categoryId", type: "string", desc: "Scope to a specific category CUID; omit for global." },
            { name: "sectionId", type: "string", desc: "Group this attribute under an attribute section." },
          ]}
        />

        <ApiBlock
          method="PATCH"
          path="/api/attributes/:attrId"
          description="Update an attribute definition. Key cannot be changed."
        />
      </>
    ),
  },
  {
    id: "salsify",
    icon: Zap,
    title: "Salsify Integration",
    color: "text-green-700 bg-green-50",
    content: (
      <>
        <H3>Setup</H3>
        <P>Salsify setup has two halves — one global, one per person:</P>
        <UL>
          <LI><strong>Admin → Settings</strong> (admins) — enter the Organization ID and switch on <strong>Enable Salsify Sync</strong>.</LI>
          <LI><strong>My Profile → Salsify API Key</strong> (every user who syncs) — paste your own Salsify API key, found in Salsify → User Settings → API Access.</LI>
        </UL>

        <H3>Personal API keys</H3>
        <P>Salsify API keys are issued per person, so Sympl stores them per user rather than once for the whole installation. Every sync, pull, and debug call authenticates as the user who triggered it, which means Salsify&apos;s own audit trail attributes each change to the right individual and each user only reaches what their Salsify account permits.</P>
        <P>If you try to sync without a key on file, Sympl stops and points you to your profile. Replacing or removing your key from the profile page takes effect on your next sync; the key is never shown again after saving — only its last four characters.</P>

        <H3>Mapping attributes</H3>
        <P>In <strong>Admin → Attributes</strong>, open any attribute, enable the Salsify toggle, and enter the Salsify Property ID. This is the property name in Salsify that this attribute's value will be written to.</P>

        <H3>Syncing products</H3>
        <P>There are three ways to sync to Salsify, all requiring the project to be in <strong>Export Ready</strong> status and Salsify to be enabled:</P>
        <UL>
          <LI><strong>Full project sync</strong> — click <strong>Sync to Salsify</strong> in the project header. Sends every non-archived product in the project.</LI>
          <LI><strong>Selected rows</strong> — check one or more rows in the product grid, then click <strong>Sync to Salsify</strong> in the selection toolbar. Only the checked products are synced.</LI>
          <LI><strong>Single product</strong> — open a product at <Code>/products/[id]</Code> and click <strong>Sync to Salsify</strong> in the top-right header. Useful for pushing a single update without touching the rest of the project.</LI>
        </UL>

        <H3>Attribute opt-out per sync</H3>
        <P>Before every sync a confirmation modal appears listing all Salsify-enabled attributes grouped by section. Each attribute has a checkbox — uncheck any attribute you want to exclude from <em>this particular sync</em>. This does not permanently change the attribute&apos;s Salsify settings; the exclusion applies only to the current sync run. Use this to avoid overwriting data that already exists correctly in Salsify.</P>
        <Callout>Syncing overwrites the corresponding Salsify property values for each checked attribute. Attributes you uncheck are left untouched in Salsify. This action cannot be undone.</Callout>

        <H3>Multi-value attributes</H3>
        <P>Attributes with Max Values &gt; 1 are sent to Salsify as JSON arrays, making them compatible with multi-value Salsify properties. Only values that are actually stored are sent — if a product has a single value for a multi-value attribute, a scalar (not an array) is sent to Salsify.</P>

        <H3>Debug mode</H3>
        <P>Admins can enable <strong>Salsify Debug</strong> in <strong>Admin → Settings</strong>. When enabled, two additional pages appear in the Admin sidebar: <strong>Salsify Log</strong> (sync history and payloads) and <strong>Salsify Debug</strong> (live API inspection). Disable debug mode to hide these pages for non-technical users.</P>

        <H3>Drift detection</H3>
        <P>Each successful sync records a per-product timestamp. The grid&apos;s <strong>Salsify</strong> column compares it against the product&apos;s last edit: <strong>Synced</strong> (green) means Salsify is current, <strong>Changed</strong> (yellow) means the product has been edited since its last sync and Salsify is stale.</P>

        <H3>Pull from Salsify</H3>
        <P>On the product edit page, Admins and Product Managers can click <strong>Pull from Salsify</strong> to fetch the product&apos;s current state from Salsify. An <strong>In Salsify</strong> panel then shows digital-asset thumbnails, Salsify&apos;s last-updated date, version, and property count — so you can see what retail has without leaving Sympl.</P>

        <Callout type="tip">After a project or row-selection sync, the result (how many products sent and any errors) appears next to the Sync button in the project header.</Callout>
      </>
    ),
  },
  {
    id: "notifications",
    icon: Zap,
    title: "Notifications, Sharing & Alerts",
    color: "text-amber-600 bg-amber-50",
    content: (
      <>
        <H3>Notification bell</H3>
        <P>The bell in the sidebar shows unread notifications: workflow votes needed, stage completions, new comments, @mentions, and overdue alerts. Click it to open the Notifications page and mark items read.</P>

        <H3>@mentions</H3>
        <P>In project comments, type <Code>@</Code> followed by a teammate&apos;s first name, full name, or email prefix to send them a dedicated <em>&quot;mentioned you&quot;</em> notification.</P>

        <H3>Email notifications (SMTP)</H3>
        <P>Sympl can send email for workflow votes, stage completions, approver assignments, project status changes, and password resets. Email is <strong>optional</strong> — without SMTP configured, the app works normally with in-app notifications only.</P>
        <P>To enable email, set the following environment variables in your <Code>.env</Code> file and restart the server:</P>
        <UL>
          <LI><Code>SMTP_HOST</Code> — SMTP server hostname (e.g. <Code>smtp.gmail.com</Code>). <strong>Required</strong> to enable email.</LI>
          <LI><Code>SMTP_PORT</Code> — port number (default: <Code>587</Code>).</LI>
          <LI><Code>SMTP_SECURE</Code> — set to <Code>true</Code> for implicit TLS (port 465). Default uses STARTTLS.</LI>
          <LI><Code>SMTP_USER</Code> / <Code>SMTP_PASS</Code> — credentials for SMTP authentication. For Gmail, use an <strong>App Password</strong>, not your account password.</LI>
          <LI><Code>SMTP_FROM</Code> — sender address (default: <Code>Sympl &lt;no-reply@sympl.app&gt;</Code>).</LI>
        </UL>
        <P>Go to <strong>Admin → Settings → Email Notifications (SMTP)</strong> to verify the connection status and send a test email.</P>
        <P>Users control which notification categories they receive via email in <strong>My Profile → Notification Preferences</strong>. Mentions and assignments default to email on; other categories default to inbox only.</P>

        <H3>Overdue alerts (cron)</H3>
        <P>Compliance events and workflow stages with a due date trigger a one-time in-app notification (and email, when SMTP is configured) once they go overdue. This requires an external cron job hitting <Code>POST /api/cron/overdue-check</Code> with the backup API token — see the README for the exact crontab entry. Changing an item&apos;s due date re-arms its alert.</P>

        <H3>Leadership digest</H3>
        <P>A scheduled email summary for Admins and Product Managers: pipeline by status, open compliance events by severity with overdue count, and an approvals-aging table. Triggered by cron via <Code>POST /api/cron/digest</Code>; Admins can preview the HTML by opening <Code>/api/cron/digest</Code> in the browser.</P>

        <H3>Read-only share links</H3>
        <P>Admins and Product Managers can click <strong>Share</strong> on a product or inspection report to create an expiring link (7 / 30 / 90 days). Anyone with the URL sees a clean read-only view — no account, no attachments, no navigation into the app. Links can be copied and revoked from the same menu; expired or revoked links stop working immediately.</P>

        <H3>API tokens for integrations</H3>
        <P>From <strong>Admin → API Tokens</strong>, create scoped <Code>spt_</Code> tokens that let external tools (ERP, BI) call <Code>GET /api/products</Code> with a <Code>Bearer</Code> header — read-only access to product data with full search, filter, and pagination. Tokens are shown once at creation and can be revoked at any time; last-used time is tracked.</P>
      </>
    ),
  },
  {
    id: "backup",
    icon: HardDrive,
    title: "Backup & Restore",
    color: "text-slate-600 bg-slate-100",
    content: (
      <>
        <H3>Overview</H3>
        <P>
          Admins can create encrypted backups of the PostgreSQL database and restore from any saved snapshot.
          Backups are stored as <Code>.pgenc</Code> files on the local server. Each file is encrypted with
          AES-256-GCM before being written to disk.
        </P>

        <H3>Encryption key</H3>
        <P>
          The encryption key is derived automatically from the <Code>BACKUP_ENCRYPTION_KEY</Code> environment
          variable (64-character hex string). If that variable is not set, the key is derived from
          <Code>NEXTAUTH_SECRET</Code> using HMAC-SHA256. You do not configure the key in the UI —
          it is controlled entirely through environment variables.
        </P>
        <Callout type="tip">
          If you need to restore a backup on a different server, ensure the same <Code>BACKUP_ENCRYPTION_KEY</Code> (or <Code>NEXTAUTH_SECRET</Code>) is set on that server — otherwise decryption will fail.
        </Callout>

        <H3>Configuration</H3>
        <UL>
          <LI><strong>Backup Directory</strong> — the server path where <Code>.pgenc</Code> files are written. The Node.js process must have write permission to this path.</LI>
          <LI><strong>Schedule</strong> — Hourly, Daily, or Weekly. Requires an external cron job to call <Code>POST /api/admin/backup/run</Code>.</LI>
          <LI><strong>Time</strong> — for Daily/Weekly schedules, the hour and minute (24h) at which the backup should run.</LI>
          <LI><strong>Retain last N backups</strong> — older files beyond this count are automatically deleted after each successful backup.</LI>
        </UL>

        <H3>Running a backup manually</H3>
        <P>Two buttons at the top of the Backup & Restore page create snapshots on demand:</P>
        <UL>
          <LI><strong>Back Up Database</strong> — dumps and encrypts the PostgreSQL database to a <Code>.pgenc</Code> file.</LI>
          <LI><strong>Archive Files</strong> — packs the <Code>data/uploads/</Code> directory (all attachments) into a <Code>.tar.gz</Code> archive.</LI>
        </UL>
        <P>The result (file name, size, duration) appears as a banner, and all runs are recorded in the <strong>Activity Log</strong> tab. Both artifact types are subject to the same <strong>Retain last N</strong> setting.</P>

        <H3>Restoring from a backup</H3>
        <P>Go to the <strong>Restore</strong> tab. Every snapshot in the backup directory is listed newest-first with a <strong>Database</strong> or <strong>Files</strong> badge. Click <strong>Restore</strong> next to the one you want.</P>
        <UL>
          <LI><strong>Database</strong> snapshots drop the entire <Code>public</Code> schema and restore the snapshot into it as a single transaction. <strong>All current data is overwritten</strong> — anything created since the backup is gone. On success the banner reports how many projects and products the database now holds; reload the application afterwards.</LI>
          <LI><strong>Files</strong> archives extract back over <Code>data/uploads/</Code>. Files in the archive overwrite files of the same name; files that exist only on this server are left in place.</LI>
        </UL>

        <H3>Download &amp; upload (server migration)</H3>
        <P>Every snapshot has a <strong>Download</strong> button, and the Restore tab has an <strong>Upload a Snapshot</strong> panel. Together these let you move an entire Sympl instance to a new server without shell access:</P>
        <UL>
          <LI>On the <em>old</em> server, click <strong>Back Up Database</strong> and <strong>Archive Files</strong>, then <strong>Download</strong> both artifacts.</LI>
          <LI>On the <em>new</em> server, open Backup &amp; Restore → Restore and upload both files. Large uploads stream with a progress bar.</LI>
          <LI>Restore the database snapshot first, reload the app, then restore the files archive.</LI>
        </UL>
        <Callout type="tip">
          The new server must have the same <Code>BACKUP_ENCRYPTION_KEY</Code> (or, if that is unset, the same <Code>NEXTAUTH_SECRET</Code>) as the server that created the database backup — otherwise decryption fails and the restore cannot proceed. Copy that value across before migrating.
        </Callout>

        <H3>API Token (for automation)</H3>
        <P>
          Generate an API token from the <strong>API Token</strong> section at the bottom of the Backup configuration page.
          The token is shown once — copy it immediately. Use it to trigger backups from external schedulers or automation tools without needing a browser session:
        </P>
        <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto mb-3">{`curl -s -X POST https://your-server/api/admin/backup/run \\
  -H "Authorization: Bearer sbk_<your-token>" \\
  -H "Content-Type: application/json"`}</pre>
        <P>Tokens can be regenerated (invalidating the old one) or revoked entirely from the same section. The token hash is stored server-side — the plaintext is never saved and cannot be recovered after the initial display.</P>

        <H3>Scheduled backups (database only)</H3>
        <P>
          Sympl does not run a built-in scheduler. To automate database-only backups, generate an API token (above) and add a cron entry on your server:
        </P>
        <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto mb-3">{`# Example: daily at 2:00 AM
0 2 * * * curl -s -X POST https://your-server/api/admin/backup/run \\
  -H "Authorization: Bearer sbk_<your-token>" \\
  -H "Content-Type: application/json" \\
  -d '{"triggeredBy":"SCHEDULE"}'`}</pre>

        <H3>Scheduled full backups (database + uploaded files)</H3>
        <P>
          The <strong>Cron Job Setup</strong> section on this page (once an API token is active) shows the exact command for your server. It runs the bundled <Code>scripts/backup.sh</Code>, which calls the same backup API for the database dump and additionally archives <Code>data/uploads/</Code> as a <Code>.tar.gz</Code>, pruning old upload archives to match your retention setting.
        </P>
        <pre className="text-xs font-mono bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto mb-3">{`# Example: daily at 2:00 AM
0 2 * * * /opt/sympl/scripts/backup.sh https://your-server sbk_<your-token> /var/backups/sympl >> /var/log/sympl-backup.log 2>&1`}</pre>
      </>
    ),
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["getting-started"]));
  const [search, setSearch] = useState("");

  const toggle = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const q = search.toLowerCase();
  const filtered = search
    ? sections.filter((s) => s.title.toLowerCase().includes(q))
    : sections;

  return (
    <div className="flex h-full overflow-hidden">
      {/* TOC sidebar */}
      <nav className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto py-4 px-3 space-y-0.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-3">Contents</p>
        {sections.map(({ id, icon: Icon, title, color }) => (
          <button
            key={id}
            onClick={() => {
              const el = document.getElementById(`section-${id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
              setOpenSections((prev) => new Set([...prev, id]));
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-left"
          >
            <div className={`h-5 w-5 rounded flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="h-3 w-3" />
            </div>
            {title}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Help & Documentation</h1>
              <p className="text-sm text-gray-500 mt-0.5">Instructions, reference guides, and API documentation for Sympl.</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search topics…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="px-8 py-6 max-w-4xl space-y-3">
          {filtered.map(({ id, icon: Icon, title, color, content }) => {
            const isOpen = openSections.has(id);
            return (
              <div
                key={id}
                id={`section-${id}`}
                className="border border-gray-200 rounded-xl overflow-hidden scroll-mt-24"
              >
                <button
                  onClick={() => toggle(id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-semibold text-gray-900">{title}</span>
                  <span className="ml-auto">
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-gray-400" />
                      : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                    {content}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">No sections match &ldquo;{search}&rdquo;</p>
          )}
        </div>
      </div>
    </div>
  );
}
