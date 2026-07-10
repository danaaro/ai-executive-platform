# products/

The portfolio. One subfolder per sellable product, all built on the shared runtime in `src/`.

**A product is declarative** (ADR-001): agent definitions, prompts, schemas, docs, examples, evals — no code. Adding a product = adding a folder with this exact shape:

```
products/<product>/
├── README.md      # offering: what it is, who buys it, agents included
├── agents/        # executives/ + specialists/ (the sellable agents)
├── prompts/       # product-specific prompts
├── schemas/       # product I/O contracts (JSON Schema)
├── docs/          # product PRDs + product-specific docs
├── examples/      # sample inputs/outputs per agent
└── evals/         # golden sets + rubrics (run by src/evaluation)
```

Current products:
- `interview-intelligence/` — AI-powered hiring transformation (first; in build)
- (planned) training — sold training offering
