# exec10x Digital Team: Trial Plan v0.1

> STATUS: 🟡 v0.1 built 2026-10-31 (`products/launch/plugin/launch/`, zip in `plugin/dist/`). Next: Dana's dry run, then Susie.

## 0. Part of Exec10X Launch (decided 2026-10-31)

The Digital Team trial is Launch's **Communications Partner**, delivered as an installable Claude plugin instead of a manually built Claude Project.
- It reuses Launch's context pack (mandate, company profile, stakeholders, priorities) and adds what posts need (voice, content strategy, tracker).
- Brand: Exec10X Launch, with "your digital team" as the tagline.
- Trial docs live in `products/launch/docs/digital-team-trial/`.

## 1. Goal of the trial

Prove with Susie, before anyone else, that an executive can:
1. download and install it without help,
2. set it up in a light, pleasant session,
3. publish a couple of useful LinkedIn posts in her own voice, based on her context.

**Success:** Susie installs it alone, finishes setup in about 5 minutes, and posts at least 2 drafts with light edits in the first two weeks.
**Failure signals:** she needs help installing, setup feels like a form, or the drafts don't sound like her.

## 2. Who it is for

- **Positioned for:** newly appointed VPs and C-level executives, as part of their onboarding success.
- **Also works for:** established executives.
- **Trial user:** Susie (Mac, Claude Pro, desktop app). English only.

## 3. Scope

**In the trial:** LinkedIn posts, end to end up to approval.
research → topic suggestions → pipeline → draft in her voice → approval → **she posts it herself** → she logs the numbers.

**Out (see the Phase 2 wishlist):** auto-posting, other channels, emails and newsletters, dashboard UI, automatic stats, Hebrew.

## 4. Principles

- **Pure content.** The plugin holds only markdown and JSON, no scripts. Claude's built-in tools create the Excel file.
- **Local only.** Everything lives in one folder the user picks. Only the user sees it.
- **Draft, never post.** Nothing is published without the user.
- **Respect the time.** About 5 minutes to the first value, at most 3 questions at a time, and the rest is learned later.
- **Lean on usage.** Keep setup and research small so a Pro plan doesn't hit its limits in the first session.

## 5. User journey

1. **Install:** drag the `.plugin` file into Claude desktop and follow INSTALL.md. If Pro doesn't support that, use a GitHub marketplace instead.
2. **`/setup` (about 5 minutes):**
   - Two-sentence welcome. Pick the folder (default `Documents/My Exec Team`).
   - **Confirm instead of fill in:** the user shares their LinkedIn profile, company website, and optionally a CV or bio. The agent pre-fills the profile and the user corrects a short summary.
   - **The 3 required choices:**
     1. **Voice source:** Chrome reads my LinkedIn posts, or I paste 2–3 posts, or I paste emails (provisional voice).
     2. **Frequency:** posts per week (suggest 2).
     3. **Topics:** what they want to be known for, plus how ideas should come (research suggests, I bring my own, or both).
   - **First win:** 3 researched topic ideas → user picks one → draft ready → saved to the tracker.
   - **Close:** where the files are, the commands, and the 3 golden rules.
   - An assistant or chief of staff can run setup on the executive's behalf.
3. **Weekly cycle:** `/plan-week` suggests posts to match the chosen frequency, with dates, and puts them in the pipeline. If Pro supports scheduled tasks, it can run automatically every Monday morning.
4. **Draft → approve → post:** the user edits, approves, and posts. Every correction is offered for saving to the voice profile.
5. **Stats:** `/stats` logs the numbers (pasted, or read through Chrome) into the Stats tab.
6. **Gradual profiling:** at most one context question per session, only when it is relevant.
7. **Session status line:** "2 drafts awaiting approval, next post due Thursday."

## 6. What gets built

**Plugin (content only):**

| Part | Job |
|---|---|
| `skills/exec-setup` | 5-minute setup, update mode, gradual profiling |
| `skills/exec-posts` | research, topic suggestions, drafting, learning loop, tracker updates |
| `/setup` `/plan-week` `/draft` `/voice` `/stats` `/guide` | entry points |
| `templates/` | context files plus the tracker layout |
| `GUIDE.md` `INSTALL.md` `README.md` | for the executive, plain language |
| `evals/` | rubric and cases |

**User's folder (created at setup):**

| File | Contents |
|---|---|
| `me.md` | role, mandate, new-in-role or not, connected tools |
| `company.md` | what the company does, strategy, sensitivities |
| `stakeholders.md` | starts light, grows over time |
| `voice.md` | voice profile, samples, learned preferences, provisional flag |
| `content-strategy.md` | audience, topic pillars, frequency, how ideas come |
| `Content Tracker.xlsx` | **Pipeline** tab (idea → draft → approved → posted, with dates and the post text) and **Stats** tab (impressions, reactions, comments, simple charts), mirroring Dana's LinkedIn agent |

## 7. Changes from the original prompt

| Original | Now | Why |
|---|---|---|
| Message drafts (email, board, notes) | LinkedIn posts first | Dana: posts are the first value |
| 20–30 minute interview | about 5 minutes, confirm instead of fill in, gradual profiling | executives don't have 30 minutes |
| Asks for pasted emails | user chooses: Chrome, pasted posts, or emails | post voice ≠ email voice; flexibility |
| English + Hebrew | English only | Dana |
| No tracker | Excel tracker with pipeline and stats | mirrors Dana's LinkedIn agent |
| 4 commands | adds `/plan-week` and `/stats` | proactive pipeline and statistics |
| Generic exec persona for evals | newly appointed exec persona, post cases | matches the positioning |

## 8. To verify against current docs before building

1. Plugins in Claude desktop (Cowork) on the **Pro** plan: install by file and through a private GitHub marketplace.
2. Scheduled tasks on Pro, for the Monday `/plan-week`.
3. Creating and updating `.xlsx` files on Pro without breaking the "no code in the plugin" story.
4. Claude in Chrome on Pro, for reading her posts and stats.
5. Web search availability, for topic research.

**Checked 2026-10-31:** all five work on Pro. Install = Customize › Plugins › upload file (GitHub repo as backup). Scheduled tasks that use local files run only while the Mac is awake and Claude is open. Excel needs Settings › Capabilities › Code execution and file creation (in INSTALL.md). Chrome on Pro may be limited to a smaller model, so pasting posts stays an option.

If any of these fails, use the fallback: on-demand commands, a CSV or markdown tracker, and pasted posts.

## 9. Evals (rewritten for posts)

**Rubric (1–5 each):** sounds like the executive, fits the audience, worth reading, concise, no invented facts, flags real risks.

**Persona:** a newly appointed VP Operations at a 400-person tech company.

**Cases:**
1. "I just joined" announcement post
2. First-90-days lesson post
3. Team shout-out post
4. A post about a sensitive company topic (must flag the risk)
5. Researched topic suggestions match the pillars
6. "Post this for me" (must refuse and hand over a ready-to-copy draft)
7. Learning loop: an edited draft is pasted back
8. Weak samples: AI-written text only, so the voice is marked provisional
9. 5-minute setup completes with only the 3 required choices

## 10. Build steps

1. ✅ Dana approves this plan and decides section 0.
2. ✅ Verify section 8 against the docs and adjust.
3. ✅ Build. Plugin name `launch` (commands `/launch:*`). Added `/launch:commands`, `My Commands.md` and a Commands tab in the tracker so the commands are always visible (Dana).
4. Dry run with the persona and score the eval cases.
5. Package and install on Dana's machine first.
6. Install with Susie and watch the first session.
7. Review after two weeks against the success criteria in section 1.

## 11. Open

- Dana's remaining clarifications.
- Susie isn't new in a role. Her trial posts will likely be about SusanDana and exec10x, which is good for us too.
