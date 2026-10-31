# launch

> Public brand: **Exec10X Launch**. Internal product slug: `launch`.

Onboarding for newly appointed executives. Once the appointment is made, Exec10X installs a small **agentic team** around the executive's mandate so they become effective faster — without having to become an AI expert.

Launch starts where `interview-intelligence` (Search/Select) ends: the mandate, Success Blueprint and company intelligence produced during hiring become the executive's starting context.

## The core idea: one brain, many briefing files

Every agent here is **industry- and company-agnostic**. The same prompt serves a genomics CSO and an architecture-firm CEO. What changes the advice is the context loaded next to it:

| Layer | Lives in | How many | Contains |
|---|---|---|---|
| 1. Core | `agents/<agent>/` (this repo) | One for all | Role, method, rules, output formats. **No industry or company words.** |
| 2. Industry lens | `lenses/` (this repo) | One per sector, reused | Sector economics, regulation, norms, typical traps |
| 3. Executive context pack | `../../../clients/<exec>/context-pack/` (**outside this repo**) | One per executive | Mandate, blueprint, company, stakeholders, priorities, decisions |

**Rule:** if a client needs something different, change their context pack or the lens — never fork the core prompt.

## Agent catalog

| Agent (slug) | Status |
|---|---|
| Strategy Advisor (`agents/strategy-advisor/`) | 🟡 v0.1 draft — ready for first manual installs |
| Stakeholder Navigator (`agents/stakeholder-navigator/`) | next — reuses the JD interview pattern |
| Company Decoder (`agents/company-decoder/`) | planned (core) |
| Communications Partner (`agents/communications-partner/`) | 🟡 trial v0.1 built as the Claude plugin `launch` (`plugin/launch/`, package in `plugin/dist/`). LinkedIn posts first. Plan: `docs/digital-team-trial/` |
| Extended: Chief of Staff · Team Assessor · Board & Boss Alignment · Transition Coach · Sponsor Update · Agent Builder coach | added when a client needs them — the list is open-ended |

## Layout

```
launch/
├── agents/
│   └── strategy-advisor/        ← one folder per agent: prompt + methods + evals
├── lenses/                      ← shared: one industry lens per sector
├── context-pack-template/       ← shared: empty files copied per executive
├── docs/                        ← install checklist, product docs
└── plugin/                      ← Claude plugin `launch` + marketplace config; dist/ = zip for clients
```

Deviation from the standard product shape (ADR-001), on purpose: each agent is a **folder** that holds its own prompt, supporting files and evals, instead of `agents/specialists/*.md` + separate `prompts/` and `evals/`. Easier to see and manage one agent as one unit.

`schemas/` and `examples/` will be added once the first install has run.

## Where client data lives

Never in this repo. Client context packs live in `SusanDana Co/clients/`, next to this repo but outside git. See `docs/install-checklist.md`.
