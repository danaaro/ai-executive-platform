# Company Context Framework (Company Context → Hiring Fit)

> STATUS: 🟢 ready. Converted from Dana's `Company Intelligent Agent/context to add .docx` (2026-10-01).
> It is the methodology the Company Intelligence agent answers (ADR-009 §17). The machine-readable
> question list is the category registry in `src/shared/company-context.ts`; this file explains it.

**Principle:** we are not hiring the strongest executive in the abstract. We are identifying the
executive whose proven capabilities and way of operating transfer into *this* organisational system.

**No made-up data.** Every answer is **Found** (sourced and dated), **Inferred** (labelled, showing
the facts it rests on) or **Unknown**. Every Unknown becomes a question in **"Include these questions
in your interview"**.

## The six layers
1. **Ownership & Purpose:** who owns it and what are they trying to achieve?
2. **Strategy & Business:** how does the company win, and what must happen next?
3. **Organisation & Power:** how is it structured, and where does power really sit?
4. **Decisions & Operating System:** who decides, how does information flow, how does execution happen?
5. **Culture & Leadership:** which behaviours, relationships and leadership styles actually work?
6. **External & Role environment:** which external relationships decide success? (The role itself comes later.)

## The 15 company categories

### 1. Ownership & capital context
Start here, because ownership often explains behaviour that otherwise looks irrational.
- **Ownership model** (pick one or a hybrid), each with its hiring implications:
  - **Founder-owned:** founder influence, personal trust, informal power, speed.
  - **Family-owned:** family governance, legacy, relationships, long-term orientation.
  - **Privately owned, institutional:** professional governance but fewer public-market constraints.
  - **VC-backed:** growth, speed, fundraising, experimentation, changing priorities.
  - **Growth-equity-backed:** scaling, professionalisation, growth plus economics.
  - **PE-backed:** value-creation plan, EBITDA and cash focus, transformation, exit horizon.
  - **Publicly listed:** governance, disclosure, quarterly and annual commitments, investor expectations.
  - **Subsidiary of a public company:** local versus group authority becomes critical.
  - **State-owned:** government stakeholders, governance, public objectives.
  - **Sovereign-wealth-fund-backed:** commercial plus strategic or national objectives.
  - **Government-controlled strategic enterprise:** policy, regulation and commerce intersect.
  - **Joint venture:** multiple shareholders and complicated decision rights.
  - **Consortium-owned:** multiple stakeholders with competing interests.
  - **Cooperative / member-owned:** member interests shape governance.
  - **Foundation / trust-owned:** purpose and long-term stewardship.
  - **Employee-owned:** different governance and incentive dynamics.
  - **Hybrid:** for example founder plus PE.
- **Then capture:** ownership concentration, board composition, shareholder involvement, investment horizon, return expectations, governance intensity, founder influence, activist influence, and exit or liquidity expectations.
- **Then ask:** what does the owner actually care about? Growth, EBITDA, cash, market share, innovation, strategic influence, IPO, exit, dividend, legacy or national interest?

### 2. Company evolution & maturity
- **The stages:** founding → product-market fit → scale-up → international expansion → professionalisation → mature growth → transformation → turnaround → consolidation → exit/IPO → post-merger integration.
- **Current chapter:** where is the company now?
- **Next chapter:** where must it be in 2–3 years?
- **Leadership transition:** which behaviours created today's success but won't create tomorrow's?
- **The recruitment question:** are we hiring for the company that exists today, or for the one that needs to exist tomorrow?

### 3. Business model & economic engine
- **Map:** revenue model; customer segments; B2B, B2C or B2B2C; transactional, subscription, licensing or services; enterprise, SMB or consumer; recurring vs non-recurring revenue; high-margin vs volume; capital intensity; regulatory intensity; sales cycle; distribution model; product complexity; technology dependence; geographic concentration; competitive advantages.
- **Then:** what really drives enterprise value (sales execution, distribution, customer acquisition, product, technology, network effects, operational excellence, regulatory access, brand, IP)? This shows which experience matters and which attractive-looking CV credentials don't.

### 4. Strategy & value creation
- **The real strategy, not the corporate presentation:** current priorities, such as growth, profitability, international expansion, market entry, product transformation, AI or digital transformation, M&A, integration, cost reduction, turnaround, professionalisation, IPO readiness, customer retention, regulatory approval or operational scaling.
- **Then:** the top 3 outcomes expected over the next 24–36 months, and what could prevent them. This becomes the candidate's mission.

### 5. Organisational architecture
- **Structural archetype:** functional, divisional, geographic, product-led, customer- or segment-led, business-unit structure, holding company, federation, matrix, platform/ecosystem, or hybrid.
- **Hierarchy:** shareholders → board → group CEO → group functions → business units or regions → countries → functions.
- **Formal structure ≠ real organisation.** Map both. The second is more useful for executive search.

### 6. Centralisation & local autonomy
Score each area from 1 (completely local) to 5 (completely group-controlled): strategy, budget, P&L, pricing, product, technology, sales, marketing, brand, hiring, compensation, senior hiring, CapEx, M&A, partnerships.
This separates a "GM as CEO of a country" from a "GM as commercial orchestrator of global functions".

### 7. Power & decision rights
- **Who can say yes, who can say no, who can block, and who must be consulted?**
- **Bain RAPID decision-rights map** (Recommend, Input, Agree, Decide, Execute) for: country strategy, annual budget, pricing, senior hire, product launch, major client terms, headcount, investment.
- **Formal vs actual decision-maker** (for example "Formally the country CEO, actually the regional CEO plus CFO").

### 8. Informal power & influence
- **Power map:** CEO, founder, chair, board members, CFO, CHRO, regional president, country leaders, functional leaders, long-tenured executives, founder confidants, investors, government stakeholders and major customers.
- **Influence type for each:** formal authority, informal influence, information access, veto power, resource control, proximity to the founder or board.
- **Then:** does an executive here need authority, influence, diplomacy, political navigation or independent execution?

### 9. Information flow
- **Direction:** bottom-up, top-down, lateral or network-based?
- **Questions:** who knows what? Who gets information first? Are problems escalated early? Is bad news welcomed? Is information filtered? Are meetings used to decide, debate, inform, or validate decisions already made?
- **Where decisions are really made:** in meetings, before them, after them, 1:1, over WhatsApp/Slack, in written memos, or through relationships.

### 10. Leadership & management system
- **Dominant style:** founder-led, command-and-control, professional managerial, consensus-driven, data-driven, performance-driven, entrepreneurial, expert-led, relationship-led, process-led or mission-led.
- **Scales:**
  - accountability: individual ↔ collective
  - management: hands-on ↔ hands-off
  - planning: emergent ↔ highly structured
  - risk: experimental ↔ risk-averse
  - performance: forgiving ↔ demanding
  - conflict: explicit ↔ avoided
  - failure: learning opportunity ↔ career-limiting
  - speed: deliberate ↔ extremely fast

### 11. Culture map (Erin Meyer, adapted to corporate context)
- **The eight scales:**
  - communicating: low-context ↔ high-context
  - feedback: direct ↔ indirect
  - leading: egalitarian ↔ hierarchical
  - deciding: consensual ↔ top-down
  - trusting: task-based ↔ relationship-based
  - disagreeing: confrontational ↔ avoids confrontation
  - scheduling: linear ↔ flexible
  - persuading: principles-first ↔ applications-first
- **Assess separately:** company culture, leadership-team culture, country culture and candidate culture.

### 12. Performance & accountability
- **What constitutes excellent performance?** Revenue, EBITDA, growth, market share, innovation, execution, cost, team building, stakeholder management, transformation?
- **Also:** individual vs collective KPIs; short- vs long-term incentives; financial vs non-financial metrics; bonus structure; equity/LTI; promotion criteria; consequences of underperformance; tolerance for missing targets.

### 13. Talent philosophy
- **Who succeeds here, in practice rather than in theory?** Where did they come from, what style do they share, how long do they stay, who gets promoted, who gets listened to?
- **Who fails?** Three senior hires that didn't work, and why. For example: too corporate, too independent, couldn't influence HQ, needed too much clarity, moved too slowly, too confrontational, couldn't challenge the founder, or challenged the founder too much.

### 14. Change & ambiguity context
- **Scales:**
  - stable ↔ transformation
  - predictable ↔ ambiguous
  - established processes ↔ build from scratch
  - abundant resources ↔ resource-constrained
  - low politics ↔ highly political
  - clear mandate ↔ evolving mandate
  - low complexity ↔ extreme matrix complexity
  - local role ↔ global stakeholder complexity
- **Result:** how much **builder / operator / transformer / diplomat** the person needs to be.

### 15. External ecosystem
- **Map:** customers, regulators, government, investors, banks, partners, distributors, suppliers, media, industry bodies, unions, communities, key opinion leaders.
- **Then:** which external relationships materially determine success?

## Later (role input, not in this build)
Sections 16–19 need a specific role: role context and mission; context → candidate translation; the one-page **Context Fit Profile** (with star ratings for operator, builder, transformer, commercial, matrix influencer, external stakeholder leader, people leader and technical depth); and candidate context match (what they did, where, and how they succeeded).

This build adds a generic **"What this means for any senior hire"** list, which turns known findings into candidate implications.
