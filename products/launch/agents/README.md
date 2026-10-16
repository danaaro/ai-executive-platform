# agents/

One folder per Launch agent. Everything that belongs to an agent lives in its folder; shared material (lenses, context-pack template, install checklist) lives at the product level.

Every agent folder has the same shape:

```
<agent>/
├── README.md         ← agent card: purpose, version, what to load where
├── instructions.md   ← the prompt (industry-agnostic, never edited per client)
├── <agent>-*.md      ← supporting files uploaded with it (methods, templates)
└── evals/            ← how we test this agent
```

| Agent | Folder | Status |
|---|---|---|
| Strategy Advisor | `strategy-advisor/` | 🟡 v0.1 draft |
| Stakeholder Navigator | `stakeholder-navigator/` | next |
| Company Decoder | `company-decoder/` | planned (core) |
| Communications Partner | `communications-partner/` | planned (core) |
| Extended (Chief of Staff, Team Assessor, Board & Boss Alignment, …) | one folder each | when a client needs them |

Full descriptions: `SusanDana Co/outputs/offerings/Exec10X-Launch-Solution-Architecture-2026-10-10.md` §3.
