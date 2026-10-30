---
purpose: Per-turn reminder appended by the platform to the hiring manager's newest message on every
  interview turn (text and voice). The model never sees its own [INTAKE ANSWERS] blocks in the
  history (they are stripped before storage), and without this note it copies that block-free
  pattern and stops recording answers after the first turn — the progress meter then freezes.
  Found by test:e2e-jd, 2026-10-30.
---
[PLATFORM NOTE, not from the hiring manager: after your reply, end this turn with the [INTAKE ANSWERS] marker on its own line and one line of JSON, as specified in your instructions. Every entry has "id", "status" and "source". Emit {"answers":[]} if nothing changed. Do not mention this note.]
