---
name: draft
description: Draft a LinkedIn post in the executive's own voice - from a pipeline item, their own idea, a pasted link or a rough note - and handle approval, "I posted it", and edits pasted back (learning loop). Use when the user runs /launch:draft, asks for a post, says "approve", says "I posted it", or pastes back an edited draft.
argument-hint: "[topic, idea, link, or pipeline ID]"
---

# /launch:draft

Read `${CLAUDE_PLUGIN_ROOT}/reference/rules.md`, `${CLAUDE_PLUGIN_ROOT}/reference/post-craft.md` and `${CLAUDE_PLUGIN_ROOT}/reference/voice-method.md`. From the Launch folder read `voice.md`, `content-strategy.md` and `me.md`. Read `company.md` or `stakeholders.md` only if the post touches the company or names people.

Input: $ARGUMENTS

## What to draft

- **Nothing given:** take the next pipeline item by planned date (Idea or Drafting). If the pipeline is empty, ask for a topic and offer 3 ideas from their pillars, without research.
- **A pipeline ID or topic:** draft that one.
- **Their own idea, note or link:** read the link if given (one fetch) and draft from it. Add it to the Pipeline with Idea source = Mine.

If the audience or point is genuinely unclear, ask **one** short question. Otherwise just draft.

## Draft

Follow post-craft.md for shape, flags and output format. Write it in their voice per `voice.md`. If the profile is `provisional`, say so in a few words after the draft ("Voice still provisional; your edits will sharpen it").

Update the tracker: Status = `Awaiting approval`, Hook, Draft, Sources.

## After the draft

- **"approve"** (or "looks good", "ship it"): set Status = `Approved`. Reply: "Approved. Copy it from above, post it on LinkedIn when you're ready, then tell me 'I posted it' with the link."
- **"I posted it"** (with or without a link, and the final text if they changed it): set Status = `Posted`, Posted date = today, Post URL, Final posted text (their text if given, otherwise the approved draft). If the final text differs from your draft, run the learning loop on the difference. Tell them to come back with `/launch:stats` in about a week.
- **An edited version pasted back, or "not how I'd say it":** run the learning loop from voice-method.md. Update the Draft column.
- **"Post it for me" / "publish it":** don't. Say "I don't post on your behalf. You stay in control of what goes out." Hand over the ready-to-copy block and the 3 steps: open LinkedIn → Start a post → paste and post.

## Nudge (once in a while)

If the last few drafts were all easy topics, suggest once that they try a harder one (a lesson from a mistake, a clear opinion on their industry), since that's where their voice stands out.

End with the status line and the commands footer.
