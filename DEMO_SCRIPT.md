# Sympl PM — Director Presentation
## Demo Script & Feature Overview

---

## Audience Context

A Director of Program Development cares about:
- **Visibility** — where are we, what's blocked, who's responsible
- **Accountability** — is the right person approving the right thing
- **Speed to market** — are we removing friction between teams
- **Data integrity** — is the product data going to retail correct and on time
- **Audit trail** — can we prove what happened and when

Lead with pain, not features. Open with "here's what this replaces" before you show anything.

---

## Opening (2 min)

> *"Right now, product development lives across spreadsheets, email threads, and shared drives. No one has a single view of where a product stands, who's approved what, or whether the data going to retail is accurate. Sympl PM changes that."*

Frame it as three things:
1. **A single source of truth** for product data
2. **A structured process** that moves products from concept to retail-ready
3. **A direct connection** to Salsify — so what you approve is what the retailer sees

---

## Feature Priority List

### Tier 1 — Lead with these (core value, immediate ROI)

**1. Projects & Product Grid**
The daily workspace. Every product, every field, inline — no more versioned spreadsheets flying around. One grid, one truth, everyone working in the same place.

**2. Approval Workflows**
Configurable stages (Legal, Buyer Sign-off, Compliance Sign-off, etc.) with assigned approvers, voting, and automatic status transitions. Nothing moves forward without the right person saying yes. Full audit trail of who voted, when, and what they said.

**3. Project Status Lifecycle**
A defined pipeline from Draft to Export Ready. Leadership gets an instant read on where every project sits without asking anyone.

**4. Salsify Sync**
When a project is Export Ready, one click pushes all product data to Salsify. No re-keying, no copy-paste errors. The data the buyer sees is the data the team approved.

---

### Tier 2 — Show these as differentiators

**5. Compliance Tracking**
Prop 65, REACH, CPSC — logged against specific products, with severity, due dates, and status. Overdue events surface automatically. Nothing falls through the cracks before a product ships.

**6. Pre-Shipment Inspections (PSIR)**
Inspection reports linked to products, with pass/fail results, factory details, and document attachments. The full quality trail is in the same system as the product data.

**7. Activity Log**
Every field edit, every vote, every status change — timestamped and attributed to a person. Fully auditable history for every project.

**8. Role-Based Access**
Six roles from Admin to Viewer. The right people can edit; others can review or approve. Access control is configurable per permission, per role.

---

### Tier 3 — Mention, don't demo unless asked

**9. Custom Attributes**
Any field the business needs, typed and scoped to a category. Future-proof — the data model grows with the business without a code change.

**10. Backup & Restore**
Encrypted database backups on a schedule, restorable in one click, with API token support for automation.

---

## Demo Agenda (30 min)

### Block 1 — The Problem (3 min)
Don't open the app yet. Ask the question:

> *"How long does it take today to answer: which of our active projects are waiting on Legal approval right now?"*

Let it land. Then: *"In Sympl, that's a five-second filter."*

---

### Block 2 — Projects Overview (5 min)
**Open: Projects list page**

- Show card and list view toggle
- Filter by status — show the pipeline at a glance
- Open one project

**Key line:** *"Every active program has a status. Everyone sees it. No one has to ask."*

---

### Block 3 — Product Grid (7 min)
**Open: Products tab inside the project**

- Scroll across columns — show core fields and custom attributes side by side
- Edit a cell inline — show it saves automatically
- Select two rows → Bulk Edit → change a field across both

**Key line:** *"This replaces the master spreadsheet. Except everyone is editing the same one, and nothing gets overwritten by an emailed version."*

- Show Import button — explain it auto-maps columns from an existing Excel file
- Show Export — explain it's the same file back out, audit-ready

---

### Block 4 — Approval Workflow (8 min)
**Open: Workflow tab**

- Walk through the stages — show assigned approvers per stage
- Show a stage with one approval in, one pending — show the lock icon
- Cast a vote (Approve) — show the stage complete and project status advance automatically

**Key line:** *"No one can say they didn't know it was waiting on them. The system tells them. And when they approve, it moves — automatically."*

- Show the dependency concept briefly — *"stages can declare they depend on a compliance event being resolved first"*

---

### Block 5 — Compliance & Inspections (5 min)
**Open: Compliance tab on the same project**

- Show one or two events linked to products
- Point out the severity and due date
- Mention that overdue events go red

**Switch to: Inspections tab**

- Show a PSIR linked to a product — result, factory, documents attached

**Key line:** *"Quality, regulatory, and product data in one place. When a buyer asks 'is this Prop 65 compliant?' — you don't dig through emails. You open this."*

---

### Block 6 — Salsify Sync (4 min)
**Open: Project header (Export Ready project)**

- Show the Sync to Salsify button
- Click it — walk through the attribute opt-out modal
- Explain: *"Before anything goes to Salsify, you see exactly what attributes will be pushed. You can exclude anything you don't want overwritten this run."*
- Show row selection sync: *"Or select specific products and sync just those."*

**Key line:** *"What the team approved is what the retailer sees. No re-keying. No version drift."*

---

### Block 7 — Wrap & Questions (3 min)

Summarize with three sentences:

> *"Sympl PM gives your team one place to build and approve product data, one process to gate it, and one button to push it to retail. The spreadsheet era ends here. Everything is tracked, everyone is accountable, and nothing ships without the right sign-offs."*

Open for questions.

---

## Likely Questions & Answers

**"How does this replace what we're doing today?"**
It replaces the master product spreadsheet, the approval email chain, the compliance tracker, and the manual Salsify upload — all in one system.

**"What does onboarding look like?"**
Admins configure the attribute schema, workflow templates, and roles once. After that, creating a project and importing products takes minutes. Teams work in the grid the same way they work in Excel — there's almost no learning curve.

**"Who controls what people can see and do?"**
Role-based access, configurable per permission. Contributors edit; Reviewers comment; Approvers vote; Viewers only see. You decide who gets what.

**"What if we need a field that isn't there?"**
Custom attributes. Any field, any type, scoped to a product category. No code change required.

**"Can we run this on our own infrastructure?"**
Yes. It's a self-hosted Next.js application backed by PostgreSQL. You own the data.

**"What about data backup?"**
Built-in. Encrypted backups on a schedule, restorable from the admin panel in one click.

---

## Things to Avoid in the Demo

- Don't get into the weeds on attribute configuration — that's an admin conversation for later
- Don't show the API reference section of Help & Docs
- Don't demo Backup & Restore unless asked — it's important but not a room-stopper
- If something looks slow, narrate past it — *"in production this would be on a dedicated server"*
- Keep the focus on process and accountability, not features and buttons
