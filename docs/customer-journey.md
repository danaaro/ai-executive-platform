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
