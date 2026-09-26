# Company Intelligence Report — section guide

> STATUS: 🟢 ready (2026-09-26). The machine contract is the JSON schema in
> `src/shared/company-report.ts` (enforced through structured outputs). This file explains what
> each section is for. The platform renders the data as a visual executive page and serializes
> it to Markdown for download.

The reader is an executive with two minutes. Every section must earn its place.

| Section (JSON field) | What it is for | Rendered as |
|---|---|---|
| **Headline** (`headline`) | The one sentence they remember about the company's moment | Hero line |
| **Trajectory** (`trajectory`) | growing / stable / transforming / under pressure / unclear, plus why | Status chip |
| **Bottom line** (`bottomLine`) | 4–6 analyzed conclusions. A reader who stops here knows what the company is, where it stands, what it's like inside, and the biggest open issue | Numbered cards |
| **Key figures** (`keyFigures`) | 3–5 headline numbers (people, revenue, ownership, rating), each dated | Stat tiles |
| **At a glance** (`atAGlance`) | What they do, ownership, size and footprint, financial direction, leadership, current moment | Fact grid |
| **Where the company is right now** (`currentSituation`) | One analytical paragraph tying together finances, events and leadership. It says what they *mean*. Full mode only | Narrative block |
| **Last 12 months** (`timeline`) | 3–6 events that matter, newest first, each with why it matters. Full mode only | Timeline |
| **Key personas** (`keyPersonas`) | 4–6 decision-makers who matter for our work: role, tenure, background, public focus areas, a public stance, why they matter, and how to open a professional conversation. **Public professional information only.** Full mode only | Persona cards |
| **Culture: who thrives** (`culture.thrives/struggles/cultureAdd`) | Observable behaviors only, never personality types or demographic proxies | Three columns |
| **Culture at a glance** (`culture.dimensions`) | Position 1–5 on the six trade-off spectrums, what it means, and confidence | Spectrum chart ("culture DNA") |
| **What gets rewarded** (`culture.whatGetsRewarded`) | What actually gets people promoted or recognized | Callout |
| **Employee sentiment** (`employeeSentiment`) | Published ratings only (overall, categories, CEO approval, recommend %), source, period, and recurring themes. Never estimated | Bar chart + meters |
| **Say vs. do** (`sayVsDo`) | Where what the company says about itself differs from what it does, and the implication | Side-by-side rows |
| **Risks and watch-outs** (`risks`) | 2–5 risks, each with severity | Severity-labeled list |
| **Opportunities and conversation angles** (`opportunities`) | 2–4 openings for SusanDana (leadership hiring, talent strategy, culture change, AI adoption), each with the angle to open with | Cards |
| **Questions to raise with the client** (`questions`) | 4–7 questions the research couldn't answer, most important first | Numbered list |
| **Confidence and sources** (`overallConfidence`, `coverage`, `sourcesCount`, `confidenceNote`) | How far to trust this: coverage per research area and what was thin | Coverage strip |

## Writing rules
- Analyze, connect and conclude. Don't digest the research. Short, concrete sentences.
- Numbers only when published or sourced, and dated. Use `null` rather than a guess.
- No `(→ 03)` arrows. The research files hold the evidence. Name the key fact in plain words.
- Culture: observable behaviors only. No demographic or background proxies.
- Personas: public professional information only. The approach must rest on public priorities, never on psychological profiling.
