---
name: stats
description: Log LinkedIn numbers (impressions, reactions, comments, reposts) for the executive's published posts into the Stats tab of Content Tracker.xlsx, and give a short read of what's working. Use when the user runs /launch:stats or pastes post numbers.
argument-hint: "[post ID or link, optional]"
---

# /launch:stats

Read `${CLAUDE_PLUGIN_ROOT}/reference/rules.md` and `${CLAUDE_PLUGIN_ROOT}/reference/tracker.md`, then the tracker.

Input: $ARGUMENTS

## Steps

1. **Which posts.** List Posted posts that have no stats yet, or stats older than 7 days after posting (oldest first, at most 5). If $ARGUMENTS names one, use that.
2. **Get the numbers.** Offer two ways:
   - "Paste them": for each post, impressions · reactions · comments · reposts (from the post's **View analytics**). A screenshot works too.
   - "Read them in Chrome": only if Claude in Chrome is available. Open each Post URL's analytics and read the four numbers. Only read; never click anything else.
3. **Write** to the Stats tab: one row per post, by ID. Logged on = today. Source = Pasted or Read in Chrome. Never fill a number you didn't get.
4. **Read it back in 3 lines at most** (only when there are 3 or more posts with stats): which post did best and a guess why (hook, topic, pillar, day), and one thing to try next. Say it's a guess when the sample is small.

If the best-performing pattern is clear, offer once to note it in `content-strategy.md` under "What works".

End with the status line and the commands footer.
