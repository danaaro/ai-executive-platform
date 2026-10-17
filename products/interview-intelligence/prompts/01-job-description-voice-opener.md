---
agent: job-description
title: Voice opening line
purpose: >
  The first sentence the voice agent speaks (ElevenLabs first message), before the model takes
  over. Placeholders {title} and {company} are filled from the locked role facts by
  src/app/api/job-description/voice-token/route.ts. Only this text reaches the browser.
  It invites the hiring manager to begin; the model's first turn then plays back what it
  knows (Phase 0) and asks the first gap. Never mentions what was loaded or gone through.
---

## new
Hi, I'm your Exec10X briefing partner, here to shape the {title} role at {company} with you. Shall we begin?

## continuing
Welcome back. Let's pick up the {title} briefing where we left off. Go ahead whenever you're ready.
