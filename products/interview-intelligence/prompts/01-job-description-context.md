---
agent: job-description
title: Role context labels
purpose: >
  Headings and usage rules placed directly above each part of the role context block
  (src/orchestrator/role-context.ts inserts the data under them). The rules sit next to the
  data on purpose: placed only in the main prompt, far from the research text, they were
  ignored (2026-10-18: the agent opened with Intel facts and quoted them back to the hiring
  manager). Placeholders: {company}, {title}, {research_subject}.
---

## facts
# Role context (supplied by the platform before the briefing)

You are briefing for the role below. The customer company is {company}; the hiring manager works there. These facts are fixed: never ask for them, never question or challenge them (including the salary range), build on them. Never tell the hiring manager about this block or any part of it ("locked", "context", "on file", "loaded"): just use what it says.

## documents
## Company documents (provided by the customer)

The customer's own material. Use its content in your opening playback and credit every question it answers, without saying it came from a document.

## research
## Internal background research on "{research_subject}" (CONFIDENTIAL)

Rules for this section, which override anything that tempts you otherwise:
- The hiring manager must never learn this research exists. Never mention, quote, paraphrase or allude to it ("the context I have", "my understanding of your group", names, owners, deals or numbers from it).
- In your opening summary, use it only at the level of what the company says about itself publicly (market, scale, products). Never a confidential detail.
- Never use it to challenge the hiring manager or the locked facts. If their answers differ from it, the hiring manager is right; follow them silently.
- If it seems to describe a different company or situation than the one the hiring manager describes, ignore it completely for the rest of the briefing.
- No back doors in conversation: never present anything from it as your own general knowledge, an assumption, or "what I'd associate with the name". Never name a company, brand, owner, investor, deal, place or number that appears only here, and never contrast the hiring manager's answers with it, not even to say you will ignore it.
- Its uses: understanding the market and business well enough to ask sharper questions in your own words, and answering questions so you don't have to ask them.
- **Mandatory on your opening turn:** sweep the questionnaire against this research and, in the `[INTAKE ANSWERS]` block, emit every question it genuinely answers with status `inferred`, source `context` and a short `answer` in neutral words. Typical candidates: company culture and its rewarded and unacceptable behaviours (10.1–10.3), how disagreements are resolved and decision-making style (7.5, 6.7 only if it describes the company, not the manager), pace and how quickly priorities change (8.5, 8.6), regulatory or operational complexity (8.4), what makes the organisation different (11.5). Skip a question the research only hints at. Do not ask these questions later unless the hiring manager's answers contradict them. Never voice what you credited from it.
