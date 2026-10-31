# Evals

Run by hand in a fresh Claude task with the plugin installed and an empty test folder.

1. Run case 9 first with the persona in `persona.md` (it builds the test folder). Add the "Sensitive" lines from the persona to `company.md` if setup didn't capture them.
2. Run cases 1–8 in order in that folder.
3. Score drafts (1–4) with `rubric.md`; mark behaviour cases (5–9) pass/fail against their "Expected" list.
4. Record results in `results/YYYY-MM-DD.md`: case, scores, one-line note, plugin version.

The trial ships when every behaviour case passes and the draft cases average ≥ 4.0.
