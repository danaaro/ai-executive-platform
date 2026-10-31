---
name: plan-week
description: Plan this week's LinkedIn posts for the executive - research topics within their pillars, suggest posts with dates to match their posting frequency, and add them to the pipeline in Content Tracker.xlsx. Use when the user runs /launch:plan-week, asks "what should I post this week", or a Monday scheduled task fires.
---

# /launch:plan-week

Read `${CLAUDE_PLUGIN_ROOT}/reference/rules.md`, then `content-strategy.md` and the tracker's Pipeline and Stats tabs from the Launch folder. Read `me.md` only if you need it for an idea.

## Steps

1. **What's already there.** Count open items: drafts awaiting approval, approved but not posted, ideas with dates this week. If the week is already covered, say so, list them, and offer to draft the next one. Stop there.
2. **What works (the feedback loop).** If the Stats tab has 3 or more posts, look at which pillars, hooks and days did best, plus the "What works" notes in `content-strategy.md`. Lean this week's picks toward that, and say so in one line ("Your story-led posts get about 2× the reactions, so both picks open with a moment").
3. **Research (at most 3 web searches).** Look for the last 2–3 weeks of news in their industry, their company and their pillars. If ideas come from "me" (the user) only, skip research and ask for their 1–2 ideas instead.
4. **Keep an idea bank of about 10.** Unused `Idea` rows without a date are the bank. Top it up to about 10 from the research, without duplicates, and drop stale news ideas older than 4 weeks (Status = Dropped).
5. **Pick this week's posts from the bank to match the frequency** (for example 2 posts → 2 picks plus 1 spare). For each:
   - **Day and date** (spread through the week; default Tue and Thu morning)
   - **Topic** and pillar
   - **Angle:** one line on why *they* in particular should say this
   - **Source:** a link and date if researched, or "from your context"
6. Ask: "Keep these? Swap any? (I have N more ideas in the bank.)" Then give the kept ones a Planned date in the Pipeline.
7. Offer to draft the first one now.

## Weekly automation (offer once)

The first time this runs, offer once: "Want me to do this every Monday morning?" If they say yes and you can create a scheduled task in this session, create one that runs every Monday at 08:00 with the prompt `/launch:plan-week`, in their Launch folder. Otherwise give these 3 steps: **Scheduled** in the left sidebar → **New task** → prompt `/launch:plan-week`, weekly, Monday 08:00, folder `My Exec Team`. Mention that it runs when the Mac is awake and Claude is open. Note in `content-strategy.md` that it's set, so you don't offer again.

## Gradual profiling

If one missing fact would clearly improve the ideas (for example, upcoming moments such as a launch or a conference), ask that **one** question at the end and save the answer.

End with the status line and the commands footer.
