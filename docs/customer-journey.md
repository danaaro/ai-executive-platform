# Customer Journey, Onboarding and Payments

## Sales-led onboarding
- Customers book a call via exec10x.ai; price is agreed per customer.
- Admin panel: select an existing company or create a new one; set number of role credits and a custom total price; generate one Stripe payment link.
- Stripe webhook at /api/stripe-webhook: verify signature, add credits to the company, send Clerk invitation.
- Admin can add credits manually for customers paying by invoice.
- Build and test everything in Stripe test mode first.

## Pricing reference
- Roughly 3% of first-year total pay (base plus target bonus), with a minimum and maximum fee. Prices are set manually per deal in the admin panel.

## Role flow (Step 1)
1. Customer opens a role using one credit: enters title and salary range, which are then locked.
2. Interview in chat, one question at a time, using company context. Before the first question the agent studies everything it has (locked role facts, company documents, documents attached to the role, and the hidden Company Intel), opens with a short "here is what I already know" summary, and never asks what the documents already answer; it may confirm a point, phrased as already knowing it (2026-10-18). Progress saved; can pause and resume.
3. Draft job description shown in sections; editable directly or via agent requests.
4. Only the interviewed hiring manager approves.
5. On approval: save to database, generate branded Word and PDF, unlock Step 2.

## Screens and flow (Exec10X UI, built 2026-10-17/18)
Decisions U1–U8 are in docs/platform-architecture/(C) UI-Redesign-Mockup-Review.md; this is what the screens do.
- **Look:** Exec10X brand (U1), light mode only (U6). Every mandatory form field is marked with *.
- **Sign-in and landing (2026-10-18):** a customer accepts the Clerk invitation (Join) on first sign-in and lands on the company home. Admins land on the companies overview; the Exec10X logo follows the same rule and admins reach their own company's roles via "Our roles"; inside a customer company in admin that link becomes "Roles" and goes to that company's roles (2026-10-19).
- **Company home (/projects):** the company's roles in one list, including roles opened for them by an admin (shown as "opened by … · you are an editor"), and the credit balance. "Open new role" needs at least one credit (U8): title*, salary min/max/currency*, "show salary on the job description" box, hiring manager (me, or by email), optional invites. Opening spends one credit and locks title and salary.
- **How would you like to begin? (/projects/[id]/start):** three options (U7): upload documents, voice conversation, or type. Each opens the interview in that mode.
- **Interview (/projects/[id]/interview):** chat with the agent plus a progress ring. "Generate" stays locked until 80% of the questionnaire is covered (U3); then "Save draft & review". Questions are shown for now (U2, behind a setting). A documents card lists what was attached to the role and links to the company documents.
  - Dictation (mic): shows a moving "Listening… speak, then press Done" bar; the mic is never shown red or muted.
  - Voice: always called "voice conversation" (never "live call"). The agent speaks a role-specific opening line, then its "what I already know" summary.
- **Review (/projects/[id]/review):** the formatted draft; Approve; "Ask the agent" sends a revision request back to the interview; Word/PDF download only once approved (U5).
- **Company documents (/company):** the customer uploads several files at once (PDF, Word, Markdown, text) or removes them. Used on every role. Company Intel never appears here.
- **Admin (admins only, U4):** company list with "Add company" (2026-10-18): company name*, optional Company Intel to attach (hidden), opening credits* (0 = later; above 0 needs the contract / invoice reference*, optional price and note) and the optional first user's email, all in one submit; after saving it returns to the companies overview (the Lovable organizations grid: one card per company with credits, roles and whether Intel is attached), the new company confirmed and highlighted. The company is a Clerk Organization the admin is not a member of. Company page (Lovable "Organization detail" layout, breadcrumb Companies / company): roles first, each with its status (Interviewing / Draft ready / Approved) and opening the admin role view, which has "Back to <company>"; "Start new role" lets the admin open a role for the customer (same form and credit rule; the hiring manager must be someone at the customer and is invited); below, under Account: credits, Company Intel and documents, People (members and pending invitations, invite by email; each pending invite has Copy link, to send it yourself, and Resend, which replaces it with a fresh email and link; every invitation link lands on Exec10X's own sign-up page), credit history; company page with one credits box (type the new balance, then Update: an increase needs the contract / invoice reference and optionally the price, a decrease needs a reason; the history records the difference), roles, credit history, and the attached Company Intel: one report per company, replaced by detaching and attaching another. Each role opens a read-only admin view: role facts, job description versions and the briefing conversation; for a role in the admin's own company a "Continue in the app" button opens the normal role page. Every admin action and view is logged (2026-10-18).

## Role statuses
interviewing → draft → approved (locked) → reopened (creates a new version)

## Decisions (Dana, 2026-10-17)
- **Build order:** Stage A first: admin panel (create company, add credits manually, invite users), credits and locked roles. First customers pay by invoice. Stage B: Stripe payment link + webhook on top.
- **Credits (Dana, 2026-10-17):** only admins (Dana, Susan) add credits, in the admin back office, when a customer's contract is signed / payment agreed. Each grant is recorded with the number of credits, the agreed price, the contract or invoice reference, a note, who added it and when. Customers cannot add or buy credits themselves (a Stripe payment link remains an optional later addition). Opening a role spends one credit; every grant and spend stays in the company's credit history.
- **Who does what:** any user in the customer company can open a role and spend a credit. When opening, they name the hiring manager (invite by email if new). Only that named hiring manager can approve the job description; other company users can view and comment.
- **Salary range:** always required, stored and locked (used for pricing reference and the role-drift check). A checkbox at role opening, "show salary range on the job description", controls whether it is printed (EU pay-transparency cases).
- **Company context:** the customer company has its own **profile** (About us, values / leadership behaviours, culture documents), uploaded once and reused on every role; the customer can edit it. **Company Intel** is attached to the customer **company** (not to a role) by an admin only, optionally, from existing Intel reports. It works in the background: never shown to the customer, and fed into every job description run for that company, where it shapes the interview and the JD (and the internal recruiter brief). If the hiring manager contradicts the research, the hiring manager wins on role facts and the contradiction is flagged internally.
- **Company documents (2026-10-17):** one place per customer company. Company Intel is attached there by admins and is **never visible to the customer**; documents the customer adds (values, culture, leadership behaviours, other hiring material — uploaded on the profile or saved from a role briefing) sit in the same place and **are visible to the customer**. Admins see everything. Every JD run uses both.
- **Generated documents (2026-10-17):** everything the platform produces (job description, and later the interview kit and recruiter brief) is saved **per company, per role**, with every version kept. It belongs to that role's workspace, never to the shared company documents area.
- **Accounts:** see ADR-010 (customer company = Clerk Organization; Company Intel stays separate and is attached to the company by admins, optionally).

## Outputs
- Locked role title and company printed automatically on all documents.
- Role ID in the footer of every download.
- Approved documents are never overwritten; changes create new versions.
- Save every version, including customer edits, for evals.
