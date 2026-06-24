"use client";

import { useState } from "react";
import {
  BookOpen, Package, FolderKanban, Upload, CheckCircle,
  ListFilter, Tag, ChevronDown, ChevronRight, Code2, Zap,
  Info, Search, ExternalLink,
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
          <LI><strong>Admin</strong> — full access to all projects, users, attributes, and settings.</LI>
          <LI><strong>Product Manager</strong> — can create and manage projects; access to admin attribute/category pages.</LI>
          <LI><strong>Editor</strong> — can edit products in projects they belong to.</LI>
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
          <LI><strong>In Review</strong> — submitted for approval; workflow stages are active.</LI>
          <LI><strong>Approved</strong> — all required workflow stages have been approved.</LI>
          <LI><strong>Rejected</strong> — at least one required stage was rejected.</LI>
          <LI><strong>On Hold</strong> — paused; no action pending.</LI>
          <LI><strong>Cancelled</strong> — project will not proceed.</LI>
          <LI><strong>Completed</strong> — project is finalized and archived.</LI>
        </UL>

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
        </UL>

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

        <H3>Import / Export</H3>
        <UL>
          <LI><strong>Import</strong> — upload an Excel or CSV file. Map source columns to Sympl fields on the next screen. Duplicate part numbers are flagged.</LI>
          <LI><strong>Export</strong> — downloads the visible grid rows as an Excel file.</LI>
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

        <H3>Inline editing</H3>
        <P>Click any row to open the edit drawer on the right. Core product fields are editable directly; custom attribute values are shown read-only. Use <ExternalLink className="inline h-3 w-3" /> to open the full project grid for that product.</P>
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

        <H3>Descriptions / Tooltips</H3>
        <P>The <strong>Description</strong> field on each attribute becomes the tooltip shown when hovering the column header in the product grid. Use it to explain what the field means, acceptable formats, or where the value comes from.</P>

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
        <P>Go to <strong>Admin → Settings</strong> and enter your Salsify API Key and Organization ID. Enable Salsify globally to allow syncing.</P>

        <H3>Mapping attributes</H3>
        <P>In <strong>Admin → Attributes</strong>, open any attribute, enable the Salsify toggle, and enter the Salsify Property ID. This is the property name in Salsify that this attribute's value will be written to.</P>

        <H3>Syncing products</H3>
        <P>From a project, click the <strong>Sync to Salsify</strong> button (available when Salsify is enabled). This sends all products in the project with their mapped attribute values to Salsify.</P>

        <H3>Multi-value attributes</H3>
        <P>Attributes with Max Values &gt; 1 are sent to Salsify as JSON arrays, making them compatible with multi-value Salsify properties.</P>

        <Callout type="tip">Check the <strong>Salsify Sync Log</strong> in project settings to see the results of the last sync — how many products were sent and any errors.</Callout>
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
