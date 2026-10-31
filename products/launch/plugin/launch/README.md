# Exec10X Launch: your digital team

> STATUS: 🟡 trial v0.1. LinkedIn posts only. Plan: `products/launch/docs/digital-team-trial/(C) Plan v0.1.md`.

A Claude plugin for executives. It learns your role and your voice, plans your week on LinkedIn, researches topics, and drafts posts that sound like you. **It only drafts. You post.**

## Commands

See `reference/commands-card.md` (the same list goes into the user's folder as `My Commands.md` and into the tracker's Commands tab).

`/launch:setup` · `/launch:plan-week` · `/launch:draft` · `/launch:voice` · `/launch:stats` · `/launch:guide` · `/launch:commands`

## How it's built

- **Pure content:** markdown and JSON only. No scripts, no servers, no hooks, no external services.
- **Local only:** the user's data lives in one folder they choose.
- `skills/<command>/SKILL.md`: one skill per command, kept short.
- `reference/`: shared method, read on demand (rules, voice method, post craft, tracker layout, commands card).
- `templates/`: the files setup creates in the user's folder.
- `evals/`: rubric, persona and 9 test cases.

## The three golden rules
1. Real voice. 2. Correct it. 3. You post.

Install: see `INSTALL.md`. User guide: `GUIDE.md`.
