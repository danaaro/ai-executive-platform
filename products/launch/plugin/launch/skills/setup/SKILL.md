---
name: setup
description: First-time setup of Exec10X Launch (about 5 minutes), or an update of the executive's profile, voice and content strategy. Use when the user runs /launch:setup, says they just installed Launch, or wants to change their role, topics, frequency or voice source.
---

# /launch:setup

Read `${CLAUDE_PLUGIN_ROOT}/reference/rules.md` first, then `${CLAUDE_PLUGIN_ROOT}/reference/voice-method.md`.

Goal: about 5 minutes to the first useful draft. It must feel like a short conversation with a sharp chief of staff, not a form. **Confirm, don't make them fill in:** you do the reading and guessing, and they correct.

## 0. Update mode

If the Launch folder already exists with `me.md`, summarise what you know in 4–5 lines, ask "What's changed?", update only those files and finish with step 6. Skip everything else.

## 1. Welcome (2 sentences) and folder

Say what will happen and how long: "I'll learn who you are and how you write, then draft your first LinkedIn post. About 5 minutes, and everything stays in a folder on your computer."

Ask where to keep the files and suggest `Documents/My Exec Team`. If you can't write there, ask them to select or create that folder in Claude, then continue.

## 2. Learn them from what already exists (one round)

Ask for these in one message. Each is optional, but the more they give, the fewer questions follow:
- their LinkedIn profile link,
- their company website,
- a CV or bio (paste or attach), optional.

Then read what you can. Use Claude in Chrome for the LinkedIn profile if it's available; otherwise ask them to paste the About and current role. Use web fetch for the company site. At most 3 pages in total.

Show a **5-line summary** to correct:
> **You:** [title] at [company], [new in role since X / in role N years]
> **The company:** [one line]
> **Your mandate, as I read it:** [one line, or TBD]
> **Your audience on LinkedIn, probably:** [one line]
> **Topics you could own:** [3 suggested pillars]

"Fix anything that's wrong, or say 'looks right'."

## 3. The 3 choices that matter (one round, 3 questions)

1. **Your voice.** How should I learn how you write?
   a) I read your recent LinkedIn posts in Chrome (best, if you post)
   b) You paste 2–3 posts you wrote yourself
   c) You paste 2–3 real emails or messages you wrote (good start; I'll refine it as we go)
2. **Rhythm.** How many posts a week? I suggest 2.
3. **Topics.** Are those pillars right? And should ideas come from me (research), from you, or both?

Then collect the voice samples as chosen (see voice-method.md, including what isn't acceptable). Don't ask the detailed voice questions; infer them from the samples and show a 3-line voice summary to confirm.

## 4. Write the folder

Copy and fill the templates in `${CLAUDE_PLUGIN_ROOT}/templates/`:
`me.md`, `company.md`, `stakeholders.md` (light, often near-empty at first), `voice.md`, `content-strategy.md`, and `My Commands.md` (copy as is).

Create `Content Tracker.xlsx` per `${CLAUDE_PLUGIN_ROOT}/reference/tracker.md` (Pipeline, Stats and Commands tabs).

In `me.md`, note which connectors this session has (Chrome, email, calendar, web search). Don't require any. Say in one line what Chrome adds (reading their posts and stats).

## 5. First win

Research quickly (at most 2 web searches) and suggest **3 post ideas**, one line each, each tied to a pillar and their real context. Mark which are researched (with source) and which come from their profile.

They pick one (or bring their own). Draft it per `${CLAUDE_PLUGIN_ROOT}/reference/post-craft.md`. Add it to the Pipeline as `Awaiting approval`, with the other two as `Idea`.

## 6. Close (short)

- Where the folder is, in one line.
- The commands: show the first table from `${CLAUDE_PLUGIN_ROOT}/reference/commands-card.md` and say "This list is also in `My Commands.md` in your folder and in the Commands tab of your tracker. Type `/launch:commands` anytime."
- The 3 golden rules, one line each:
  1. **Real voice:** the more of your real writing it sees, the more it sounds like you.
  2. **Correct it:** change the draft and say what you changed. Every correction teaches it.
  3. **You post:** it only drafts. You decide what goes out and when.
- Next step in one line: "Approve this draft or tell me what to change. On Monday, run `/launch:plan-week`."

Ask nothing else. Profiling continues gradually in later sessions (see rules).
