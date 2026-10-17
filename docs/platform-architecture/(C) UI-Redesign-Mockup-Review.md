# UI Redesign — Lovable Mockup Review

> STATUS: 🟡 DRAFT (2026-10-17), decisions U1–U8 taken. Analysis only — nothing built. Owner: Dana.
> Mockup: [danaaro/executive-job-studio](https://github.com/danaaro/executive-job-studio) @ `bf4f2fd` (Lovable, design preview with sample data and a simulated agent; not all screens ready).
> Measured against: JD v3 plan ([gap analysis v2.1](../../products/interview-intelligence/docs/(C)%20job-description-v3-gap-analysis.md)), [ADR-010](../adrs/ADR-010-Customer-Accounts-Multi-Tenancy.md), [customer-journey.md](../customer-journey.md), [guardrails.md](../guardrails.md).

---

## 0. Bottom line

The mockup is a strong base for the look and feel, and close to v3 in flow. It is pure front end: no data access, no login code, no secrets, so **nothing in it conflicts with the security rules** as code. It conflicts in four places with *decisions already taken*, and it is missing the screens that ADR-010 and the customer journey added:

- **Conflicts:** it shows the full question bank to the customer (exposes the method), lets anyone approve, offers downloads before approval, and treats the organisation list as the customer's home.
- **Missing:** opening a role (locked title + salary, hiring manager, credit), company profile and documents, version and revision tracking, the admin back office.

**How to use it:** port the design into our Next.js app (same Tailwind v4, same fonts, same colour tokens as exec10x.ai, so most markup carries over almost unchanged) and rebuild each screen against the real data. Keep Lovable as the design sandbox only: no code sync between the two (CLAUDE.md: never edit the same files in both).

---

## 1. What the mockup is

| | Mockup | Our app |
|---|---|---|
| Framework | TanStack Start (Vite + React 19) | Next.js 15 (React 19) |
| Styling | Tailwind v4 + shadcn/Radix | Tailwind v4 + Radix |
| Fonts | Newsreader · IBM Plex Sans · IBM Plex Mono | Roboto / Roboto Slab today (SPP brand) |
| Colours | exec10x.ai tokens (light only in `styles.css`; the plan mentions dark) | SPP brand tokens |
| Data | `src/lib/data.ts`: 3 sample orgs, 4 jobs, 15-question bank, keyword-matching "agent", 80 % threshold | Real database, real agent, `intake_answers` |
| Brand in the header | **"Mandate."** | SusieBrain / Exec10X |

Reusable as is: the design tokens and small utilities (`label-mono`, `btn`, `btn-gold`, `btn-ghost`, `field`, `card-surface`, `gold-glow`, `bg-grain`, the voice waveform), the app shell, and each screen's layout markup. Not reusable: routing, the sample data, the simulated agent and keyword matching, the client-side `.doc` export.

---

## 2. Screen by screen

| # | Mockup screen | Fits v3? | Gaps / conflicts | Recommendation |
|---|---|---|---|---|
| 1 | **Sign in**: split layout, brand line "Every great hire begins with a precise brief." | ✅ | Its own email/password form; we use Clerk | Keep the split layout; put Clerk's sign-in inside the right half, styled with the same tokens (Clerk handles passwords, resets, invitations and later two-factor). |
| 2 | **Organizations** (client list + "Add organization") | ⚠️ | Under ADR-010 a **customer sees only its own company**. A multi-client list is the **admin** view (you and Susan across customers). | Move this screen to the **admin back office** (admin.exec10x.ai). Customers land directly on their company's home (screen 3). |
| 3 | **Organization detail**: roles with status (Interviewing / Draft ready / Approved) and completeness bar; "Start new role" | ✅ mostly | Missing: **credit balance** (and "Start new role" gated on it, U8), **company profile & documents** (customer documents visible; Intel never shown), role status "Reopened" | Make this the customer **home**: roles list + credits + a "Company profile & documents" tab. |
| 4 | **New role: "How would you like to begin?"** (scratch · upload · type freely · voice) | ⚠️ | Missing the **role-opening step**: title + salary range (locked), "show salary on JD" checkbox, name the hiring manager, **spend 1 credit**. "Scratch" and "Type freely" overlap; Susan's opener already invites attachments in the chat. | Add an "Open a role" form before this screen. Reduce the choice to three: **Upload documents first · Talk (voice) · Type**. |
| 5 | **Interview workspace**: chat + right panel (completeness ring, question bank by topic with ticks, documents); Generate locked until 80 % | ✅ layout · ❌ question list | **Shows every question's text**: guardrails forbid revealing the question lists / methodology. Its own opener text instead of Susan's. No marker for answers kept confidential. Mic is simulated (we have dictation **and** live voice). Generate gating at 80 % differs from today (interim draft any time, final when the interview completes). | Keep the layout. Right panel shows the **11 section names** with done / partial / open, never the question text. Susan's fixed opener as the first message. A small "kept internal" tag on confidential answers. Two voice controls: dictate (mic) and live conversation. Gating: see U3. |
| 6 | **Review**: editable sections, "Ask the agent" revise box, Approve, Word / PDF download | ✅ layout · ⚠️ content and rights | Old JD sections (opportunity, responsibilities, profile, compensation, location) instead of the **Exec10X six + header**. **Approve visible to anyone**: only the named hiring manager may approve. **Downloads before approval** and built in the browser; the journey says branded Word + PDF **on approval**, with Role ID. No version history, no revision counter (max 20), no reopen. | Keep the layout. Exec10X sections. Approve only for the hiring manager (others see "Awaiting approval by …"). Version label + "revision 3 of 20" + history. Downloads from the server after approval (see U5). "Reopen" on approved roles. |

## 3. Screens the mockup does not have yet

| Screen | Why it's needed | Where |
|---|---|---|
| Open a role (title, salary, show-salary checkbox, hiring manager, credit) | Customer journey, credits | Customer app |
| Company profile & documents | Customer documents (visible) reused on every role; D9 "save to profile" from a briefing | Customer app |
| Team / invite colleagues | Organisation invitations (ADR-010) | Customer app |
| "Not linked to a company yet" | Signed in without a company | Customer app |
| Approved → Step 2 (interview kit) placeholder | Approval unlocks Step 2 | Customer app |
| Admin: companies list, company detail with credits, attach Company Intel (hidden), all documents, flagged activity | Admin back office | admin.exec10x.ai |
| Company Intel tool | Already exists; restyle only | admin.exec10x.ai |

## 4. Decisions (Dana, 2026-10-17)

| # | Question | Decision |
|---|---|---|
| U1 | Product name in the app | ✅ **Exec10X** (replaces "Mandate.") |
| U2 | Question bank in the side panel | ✅ **Show the questions for now**, grouped by the 11 sections; may be hidden later. Build it behind a single on/off setting so hiding later is a one-line change. Note: guardrails.md lists question lists as protected method; showing them is a deliberate product exception for now, while the agent itself still refuses to recite them. |
| U3 | When can the JD be generated? | ✅ **Locked until 80 % complete**, as in the mockup. Completeness = share of the 71 question IDs with a final status in `intake_answers`. The "Generate draft" button stays disabled below 80 % (replaces today's always-available interim draft); the final draft still comes automatically when the interview completes. |
| U4 | Organisation list | ✅ **Admin back office only**; customers land on their company home |
| U5 | Downloads | ✅ **Approved documents only** (branded Word + PDF with Role ID) |
| U6 | Dark mode | ✅ **Light only for now** (Dana): exactly the mockup's light palette. Dark mode may be added later; the colour tokens make that a contained change. |
| U7 | Start options | ✅ **Three**: Upload documents first · Talk (voice) · Type |
| U8 | Start new role vs credits | ✅ **Depends on available credits** (Dana): the company home shows the balance; "Start new role" is enabled only with ≥ 1 credit and spends it when the role is opened (title + salary locked). With 0 credits the button is disabled with "No role credits left — contact us to add more". Enforced on the server, not just in the button (guardrails: usage limits server-side). Credits are added **only by admins** (Dana, Susan) when a contract is signed, each grant recorded with credits, agreed price, contract/invoice reference and note (customer-journey.md). |

## 5. How it fits the plan

The UI work merges into the JD v3 phases instead of being a separate project:

| Phase | UI work |
|---|---|
| Before phase 1 | Port the design system: tokens, fonts, utilities, app shell, sign-in. The existing screens adopt the new look. |
| JD v3 phase 1 (interview) | Customer home, open-a-role form, start choice, interview workspace (sections panel, opener, voice controls, confidentiality tag) |
| JD v3 phase 2–3 (draft, approve, export) | Review screen with Exec10X sections, hiring-manager approval, versions and revision counter, downloads after approval, reopen |
| Domain move + admin back office | Organisations list, company detail with credits and Intel, flagged activity, Company Intel restyle |
| Later | Team / invites, company profile & documents, Step 2 placeholder |
