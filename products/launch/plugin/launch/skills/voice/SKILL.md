---
name: voice
description: Show and improve the executive's voice profile - summary, number of samples and learned preferences, provisional flag - and add new samples, fix the profile, or remove a learned preference. Use when the user runs /launch:voice or says the drafts don't sound like them.
---

# /launch:voice

Read `${CLAUDE_PLUGIN_ROOT}/reference/rules.md` and `${CLAUDE_PLUGIN_ROOT}/reference/voice-method.md`, then `voice.md` from the Launch folder.

## Show (short)

> **Your voice, as I know it:** [3 lines]
> **Based on:** N samples (posts / emails) · N learned preferences · N drafts so far
> **Status:** solid / provisional (and what would make it solid)

Then offer, as one line: "Add samples · Fix something · Remove a learned preference · Re-read my LinkedIn posts"

## Actions

- **Add samples:** follow voice-method.md (Chrome, pasted posts, or emails). Update the profile and say in one line what changed.
- **Fix something:** take their words ("I never use emoji", "shorter") and write them under Learned preferences with the date. These override anything inferred.
- **Remove a learned preference:** list them numbered, remove the one they pick.
- **Re-read LinkedIn:** only with Claude in Chrome. Read their latest own posts and refresh the profile. Only read; never interact.

Clear the `provisional` flag when the rule in voice-method.md is met, and tell them.

End with the commands footer.
