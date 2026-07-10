# ADS — Agent Definition Specification (canonical template)

> STATUS: 🟡 DRAFT — seeded from `../../../foundation/25-agent-definition-specification.md`; finalize before the Job Description agent is defined.

Every agent on the platform — executive or specialist, any product — is defined against this specification. The runnable skeletons in `agents/templates/` are derived from this file; if they disagree, this file wins.

## Required fields

| Field | Meaning |
|---|---|
| **Name / id** | kebab-case, unique within its product |
| **Role type** | `executive` \| `specialist` |
| **Product** | which `products/<product>/` it ships in |
| **Mandate** | one-line job description |
| **Parent** | which executive it reports to (specialists only) |
| **Context loaded** | exact docs/knowledge injected at runtime |
| **Inputs / triggers** | what starts it; input schema reference (`schemas/`) |
| **Outputs / hand-off artifact** | what it produces, to whom; output schema reference |
| **Tools** | allowed tools/integrations, explicit allowlist |
| **Authority level** | `autonomous` \| `propose-approve` \| `human-only` |
| **Success metric** | how output is judged; pointer to its eval rubric (`evals/`) |
| **Guardrails** | governance/PII/safety limits; brand rules (ADR-002) |

## File format
Claude-Code-convention `.md` file with YAML frontmatter carrying the machine-readable fields, body carrying the persona/instructions. One file per agent, in `products/<product>/agents/<role-type>s/<name>.md`.

## Definition-of-done for any agent
1. Definition file complete against this spec
2. Input + output schemas exist in the product's `schemas/`
3. Prompt(s) exist in the product's `prompts/<name>/`
4. ≥1 example input/output pair in `examples/`
5. Golden set + rubric in `evals/`
