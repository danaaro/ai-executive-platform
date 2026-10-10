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
| Chief of Staff | `chief-of-staff/` | planned |
| Stakeholder & Listening-Tour | `listening-tour/` | planned |
