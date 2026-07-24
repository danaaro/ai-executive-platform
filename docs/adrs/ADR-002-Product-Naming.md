# ADR-002 — Product Naming & Branding

Date: 2026-07-11 | Status: **accepted** (updated 2026-07-24 — decided ahead of the first website/PR copy)

## Title
Internal name vs. public brand for the first product.

## Context
The first product's vision originated under the name "Interview Intelligence (INT²)" — a name associated with previous owners. Dana explicitly does not want to use it publicly without permission. The folder/domain name `interview-intelligence` is used **internally only** as a descriptive working label.

## Decision
- **Public brand: "SusieBrain."** Promoted from its working/internal name (used in the live app's Clerk sign-in screens) to the public product brand — decided 2026-07-24 ahead of the first website section and stakeholder PR.
- **Internal folder:** `products/interview-intelligence/` stays as-is — it is descriptive, not a brand, and does not need to match the public name.
- "INT²" / "Interview Intelligence" remain permanently barred from any customer-facing artifact (demo, deck, generated output, marketing copy) — that name belongs to previous owners and was never cleared.

## Consequences
- No folder rename needed (internal names are decoupled from brand by design).
- Website/PR copy, the live app's branding, and any future customer-facing artifact must all use "SusieBrain" consistently from this point forward.
- The de-branding pass over seeded vision-doc content (if migrated into `docs/company-blueprint/`) must still strip "INT²"/"Interview Intelligence" and substitute "SusieBrain."
- Related open company decision: brand & legal structure (parent `foundation/appendices/ADRs.md`, ADR-004 there) — still open; SusieBrain is the product brand regardless of how that resolves.
