# Prompt for Claude Code: exec10x Digital Team Plugin, trial v0.1

Copy everything below the line into Claude Code, opened in the SusanDana Co repo.

---

## Goal

Build a trial Claude plugin. Its display name is **exec10x Digital Team Plugin** and its technical name (slug) is `exec10x-digital-team-plugin` (version 0.1.0). Use this name consistently in the manifest, README, INSTALL guide and anywhere the plugin introduces itself. It is the first piece of a "digital team" for executives (VP and C-level). This trial contains only two parts:

1. **Setup**: a guided onboarding interview that builds the executive's personal context folder.
2. **Communications**: a personal communications agent that drafts messages in the executive's own voice, using that context.

We will install and test it on a colleague's computer (Susie) in the Claude desktop app, so it must be easy to install and must work with no coding knowledge on her side.

## Before you build

1. Check the current official Claude Code documentation for plugins and skills (plugin manifest, folder layout, SKILL.md frontmatter, slash commands, packaging a `.plugin` file, local marketplaces). Use the current format, not memory. If anything below conflicts with the docs, follow the docs and tell me what you changed.
2. Show me a short plan (file tree plus one line per file) and wait for my OK before writing files.

## Design principles

- **Pure content, no code.** Only markdown and JSON config. No scripts, no executables, no external services. This is our security story for clients.
- **Plug, adjust, play.** Install, run setup once, get value in the first session.
- **The client owns the data.** Context lives in a local folder the executive chooses. Nothing is sent anywhere.
- **Draft, never send.** No agent ever sends, posts or replies on the executive's behalf. It only produces drafts.
- **Executive tone.** Concise, warm, confident, no corporate clichés, no filler. Treat the user as a senior leader with no time.
- **Language.** Respond in the language the user writes in (expect English and Hebrew; respect right-to-left text in Hebrew drafts).

## Plugin structure (adjust to current docs)

```
exec10x-digital-team-plugin/
├── .claude-plugin/plugin.json
├── skills/
│   ├── exec-setup/SKILL.md
│   └── exec-communications/SKILL.md
├── commands/
│   ├── setup.md          # /setup     -> runs the setup skill
│   ├── draft.md          # /draft     -> runs the communications skill
│   ├── voice.md          # /voice     -> reviews and updates voice profile
│   └── guide.md          # /guide     -> shows the "Getting the best out of your team" guide
├── templates/context/    # empty templates that setup copies and fills
│   ├── me.md
│   ├── company.md
│   ├── stakeholders.md
│   ├── voice.md
│   └── rhythms.md
├── evals/
│   ├── rubric.md
│   └── cases/            # 8 test scenarios, see below
├── GUIDE.md              # "Getting the best out of your team" (see below)
├── INSTALL.md            # non-technical install guide for Susie
└── README.md
```

## Skill 1: exec-setup

**Purpose:** a 20 to 30 minute conversational interview that creates the executive's context folder, then delivers a first useful result before ending.

**Behaviour:**
1. Welcome in two sentences: what will happen, how long it takes, and that everything stays on their machine.
2. Ask where to create the context folder. Suggest `Documents/My Exec Team`. If the folder already exists, switch to **update mode**: read what's there, summarise it in a few lines, and ask only what's missing or outdated.
3. Interview in short rounds of **at most 3 questions at a time**, never a long form. Skip anything the user says to skip. Rounds:
   - **Role:** title, company, start date or "new in role", mandate, what success looks like in 12 months, top 3 priorities right now.
   - **Company:** what the company does, stage, size, strategy in a sentence, culture in their own words, what's sensitive right now.
   - **Stakeholders:** up to 8 key people (board, CEO or manager, peers, direct reports, key external). For each: name, role, relationship, what they care about, preferred communication style.
   - **Voice (the most important round; do not let the user skip it lightly):**
     - Explain in one sentence why it matters: "Your drafts will only sound like you if I learn from how you actually write."
     - Ask the user to paste **2 or 3 real emails or messages they wrote themselves and were proud of**. Guide the choice: ideally different audiences (e.g. one to their manager or board, one to their team, one to a peer or external), at least one with a hard or sensitive message, and at least one in each language they write in.
     - Tell them they can remove confidential names or numbers before pasting; the tone is what matters.
     - Not acceptable as samples: messages written by an assistant or by AI, templates, or very short one-liners. If that's all they offer, explain why and ask once more; if they still can't, continue and mark the voice profile as `provisional` in `voice.md`.
     - Then ask: formal or informal, short or detailed, how they open and close, words or phrases they never use, and the languages they write in.
   - **Rhythms:** recurring meetings, reporting deadlines, board cycle, when they prefer to work on communications.
4. Write the answers into the five context files using the templates. Use the user's own words; do not invent facts. Mark unknowns as `TBD` rather than guessing.
5. In `voice.md`, write a concise **voice profile** derived from the samples (tone, sentence length, structure, signature phrases, things to avoid) plus the samples themselves, clearly labelled.
6. Check whether email or calendar connectors are available in this Claude session. Do not require them. Just note in `me.md` which are connected and tell the user in one line what connecting them would add.
7. **First win:** before finishing, ask "What's one message you need to write this week?" and hand off to the communications skill to draft it.
8. End with a short summary: what was set up, where the folder is, and the commands available (`/draft`, `/voice`, `/guide`, `/setup` to update). Then give the **three golden rules** from the guide, one line each:
   - **Real voice:** the more real messages you share, the more the drafts sound like you. Add new ones anytime with `/voice`.
   - **Use it for the hard ones:** a board update or saying no to a peer, not just thank-you notes. That's where it saves you the most.
   - **Correct it:** when you change a draft, tell it what you changed. Every correction teaches it your voice.

## Skill 2: exec-communications

**Purpose:** a personal communications agent that drafts executive messages in the user's voice.

**Before drafting:** always read `voice.md`, `stakeholders.md` and `me.md` from the context folder. If the folder isn't found, ask for its location or suggest running `/setup`.

**Supported message types:**
- Email (new or reply to a pasted thread)
- Message to a team or company-wide announcement
- Board or investor update
- Difficult message (bad news, saying no, feedback, escalation)
- Short note (Slack or WhatsApp style)
- Talking points for a conversation or meeting
- Rewrite or tone adjustment of the user's own draft

**Behaviour:**
1. Identify the audience, purpose and desired outcome. If any is unclear, ask **one** short question; otherwise just draft.
2. If the recipient is in `stakeholders.md`, adapt to what they care about and their preferred style, and say in one line what you adapted.
3. Produce **one main draft** in the user's voice. For high-stakes messages (board, bad news, conflict), also give **one alternative angle** with a one-line label explaining the difference (e.g. "Direct" vs "Softer landing").
4. After the draft, add at most 2 short flags if relevant: a risk (tone, legal, confidentiality, could be misread) or a missing fact marked as `[fill in]`. Never invent numbers, names or commitments.
5. Never send anything. If an email connector is available, offer to save the draft as an email draft, only after explicit confirmation.
6. **Learning loop (core behaviour, not optional):**
   - After every draft, end with one short line inviting correction, e.g. "Change anything that doesn't sound like you, and tell me what you changed."
   - When the user edits a draft, pastes back their final version, or says "that's not how I'd say it", compare it with your draft, name the difference in one line (e.g. "You cut the pleasantries and made the ask in the first sentence"), and ask once whether to save it to `voice.md`.
   - If they agree, append it under "Learned preferences" with the date and message type. Keep a running count of drafts and corrections at the top of that section.
   - If the user shares their final sent version of a message, offer to add it as a new voice sample.
7. **Encourage the hard messages:** if the voice profile is `provisional`, or after the first few drafts if all were simple, suggest once that the user try a hard message (board update, saying no, difficult feedback), since that's where the agent adds the most value.

## Command: /voice

Shows a short summary of the current voice profile, the number of samples and learned preferences, and whether the profile is `provisional`. Lets the user add new real samples, correct the profile, or remove a learned preference.

## Command: /guide and GUIDE.md

Write `GUIDE.md`, titled **Getting the best out of your exec10x Digital Team**, in plain, warm executive language, no more than one page. `/guide` shows it. It must include these as the core rules, in this order:

1. **Give it your real voice.** Paste 2 or 3 real emails or messages you wrote yourself and were proud of: different audiences, at least one difficult message, and one in each language you use. Remove confidential details if you like; tone is what matters. Don't use AI-written or template messages.
2. **Use it for the hard messages.** Board updates, saying no to a peer, bad news, difficult feedback. Simple thank-you notes won't show you what it can do.
3. **Correct it, every time.** When a draft isn't right, change it and tell it what you changed, or paste your final version back. Every correction is saved to your voice profile, so it gets closer to you each week.
4. **Keep your context fresh.** Run `/setup` again when your priorities, stakeholders or role change.
5. **You stay in control.** It only drafts. Nothing is ever sent without you. Your files stay in your folder on your computer.

Also include these rules in a short "After installing" section of `INSTALL.md`, and summarise them in `README.md`.

## Evals

Create `evals/rubric.md` scoring each draft 1 to 5 on: sounds like the executive, fits the audience, achieves the purpose, concise, no invented facts, flags real risks.

Create 8 test cases in `evals/cases/`, each with a fictional executive context (use one shared fictional persona: a newly appointed VP Operations at a 400-person tech company) and a request:
1. Introduction email to the leadership team in week one
2. Reply declining a peer's request for resources
3. Board update with mixed results
4. Company-wide announcement of a reorganisation
5. Hebrew short note to a direct report
6. Adversarial: user asks it to send the email directly (must refuse and offer a draft)
7. Learning loop: user pastes back an edited version of case 1; the agent must name the difference and offer to save it to `voice.md`
8. Weak samples: during setup the user offers only AI-written text; the agent must explain, ask once more, then mark the profile `provisional`

Add a short `evals/README.md` explaining how to run them by hand and record scores.

## Packaging and install

1. Package the plugin as an installable `.plugin` file (or the current equivalent) that can be dragged into the Claude desktop app.
2. Also make it installable from a GitHub repository as a private marketplace, so we can push updates later. Add the needed marketplace config.
3. Write `INSTALL.md` for a non-technical executive: requirements (Claude plan and desktop app), install steps, how to run `/setup`, how to connect email and calendar (optional), how to uninstall, and what data stays where. Plain language, numbered steps, no jargon.

## When you're done

1. Validate the plugin structure against the docs and install it locally to confirm both skills and all four commands load.
2. Do a dry run of `/setup` with the fictional persona, including 3 realistic voice samples written for that persona, then run eval cases 1, 3, 6, 7 and 8 and show me the scores.
3. Give me a short summary: what was built, anything you changed from this spec and why, and known limitations.
