# Company Intelligence: adding your own documents

> STATUS: 🟢 ready (adapted from the package's `companies/_example/inputs/README.md`, 2026-09-26)

In step 2 of `/internal/company-intel`, you can attach documents you already have about the company. Every research module reads every document, and documents rank **above** web sources in trust.

## Useful things to add
- Employee handbook, values or culture deck, code of conduct
- Internal material the client shares with you: CEO letters, town-hall notes, strategy decks
- Org charts
- Notes from your own conversations with the client
- **Glassdoor exports** (see below)

## Glassdoor export (5 minutes, manual)
The agent can only see Glassdoor's public summary. To go deeper into what employees say:
1. Log in to Glassdoor yourself and open the company's Reviews page.
2. Sort by "Most recent". Optionally filter by the relevant job function or location.
3. Copy the reviews from the first few pages, or use Print → Save as PDF.
4. Upload the file named `glassdoor-YYYY-MM.md` (or `.pdf`). The date in the name matters, because it tells the agent how fresh the reviews are.

The same approach works for any source that requires a login.

## Naming
Use descriptive names with dates, e.g. `values-deck-2026.pdf` or `ceo-letter-2026-03.md`.

## Limits and confidentiality
- Supported formats are PDF, DOCX, MD and TXT, at any size. The text is extracted in your browser and only the text is uploaded. Very long documents are cut off at about 60,000 characters. Scanned PDFs have no text layer, so paste their text instead.
- Uploaded text is stored in the internal `company_inputs` table (Supabase, RLS-protected). Only Dana and Susan can see it.
- Only add client material you have permission to use.
