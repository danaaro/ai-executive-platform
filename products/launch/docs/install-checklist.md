# Launch — Install Checklist (manual, v0.1)

How to install the Strategy Advisor for one new executive. Same steps for every executive; only the context pack and the lens differ.

## 1. Create the client folder
- Copy `context-pack-template/` to `SusanDana Co/clients/<company>-<role>/context-pack/`.
- Copy `clients/_install-template.md` to `clients/<company>-<role>/install.md`.
- **Never** create client folders inside `ai-executive-platform/` (it is pushed to GitHub).

## 2. Fill the context pack
- `success-blueprint.md` and `company-profile.md`: from the Search/Select outputs (mostly copy-paste).
- `mandate.md`, `stakeholders.md`, `priorities.md`: 45–60 min kickoff interview with the executive (and ideally their manager).
- Unknowns are written as "Unknown — to find out". No guesses.

## 3. Choose the lens
- Use the matching file in `lenses/`. If this is the first client in a new sector, write a new lens from the template in `lenses/README.md` and have a sector expert review it.

## 4. Deploy (MVP: one Claude Project per executive)
- Create a Claude Project named `<Exec first name> — Strategy Advisor` (in the account the executive will use).
- **Project instructions:** paste `ai-executive-platform/prompts/system/guardrails.md` first, then the full text of `agents/strategy-advisor/instructions.md` exactly as it is (below the frontmatter). Do not edit it for this client.
- **Project knowledge:** upload the 6 context-pack files, the lens file, and `agents/strategy-advisor/strategy-advisor-methods.md`.

## 5. Record and hand over
- Fill in `install.md` (core version, lens version, where deployed, date).
- 30-minute walkthrough with the executive: what to ask, what it will not do, how updates work.
- Smoke test together: ask one real question and check the answer cites their mandate.

## 6. Monthly refresh (Exec10X service touchpoint)
- Collect "Context update" blocks → update `decisions-log.md` and `priorities.md` → re-upload to the Project.
- If the core prompt has a new version, paste it into the Project instructions and update `install.md`.
