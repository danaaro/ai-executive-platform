# Interview transcript — Ana Duarte (interviewer) × Tomas Berzins (candidate) · 60 min (fixture, entirely fictional)

**Ana:** Thanks for making time, Tomas. I'm Ana, senior platform engineer — you'd be my manager. I want to spend most of our hour on reliability and how you grow teams, then leave time for your questions. Sound good?

**Tomas:** Perfect, that's the part of the job I care most about anyway.

**Ana:** Walk me through the worst production incident you owned end-to-end. What changed in the system and in the team afterwards?

**Tomas:** The one I still think about is from early 2023 at Freightwise. A schema migration locked our core shipments table during peak hours — carriers couldn't book for about 6 hours. I was incident commander. Short term we killed the migration and restored from a read replica. The interesting part is after: our postmortem found the migration had been reviewed but nobody had run it against production-scale data. So we built a staging environment with a nightly anonymized snapshot of production, and made "tested against prod-scale data" a hard gate in the deploy pipeline for schema changes. Time-to-detect went from 11 minutes to under 2 because we also added query-latency SLO alerts on that table. And we made the postmortem blameless — the engineer who shipped it presented it themselves, which set the tone that incidents are system failures.

**Ana:** Who wrote the postmortem?

**Tomas:** The engineer who shipped the change wrote it, I edited. I think the IC writing it is a mistake — the person closest to the change learns the most from writing it down.

**Ana:** Tell me about arguing for reliability work against feature pressure.

**Tomas:** Q3 2023, product wanted a carrier-integration sprint; I wanted two weeks for alert cleanup — we had 40% noise pages. I lost the first argument, honestly. What worked later was reframing it in product terms: I showed that noisy on-call was costing us about 1.5 engineer-days a week, roughly a feature a quarter. I put it in the RFC template our execs read, one page, cost on one axis and risk on the other. We got one week, not two — we cut pages per engineer from 9 to 5 that quarter, then to 2 by the next. The lesson for me was that "reliability debt" isn't an argument executives can act on; "this costs us a feature per quarter" is.

**Ana:** Describe a platform engineer you grew significantly.

**Tomas:** Elza joined us as a mid-level engineer from a bank, very strong technically, terrified of production. Six months in she was still routing every risky change through me — that was the struggle, decision confidence, not skill. My contribution was concrete: I gave her ownership of our Terraform module registry end-to-end, including the on-call for it, but I sat as her named backup for the first two months. We did a weekly 30-minute review that was mostly her telling me what she'd decided, not asking permission. She ran the EKS upgrade herself within a year and got promoted to senior last spring. She now runs the postmortem process.

**Ana:** And when on-call was hurting your team — what did you change, concretely?

**Tomas:** Everything I mentioned on alert noise, plus rotation design: we went from a 1-week solo rotation across 7 people to primary/secondary pairs on 4-day shifts, and we made a rule that any alert firing more than twice a week without action gets deleted or fixed — no zombie alerts. Pages per engineer per week went from 9 to 2, and we track it monthly like a product metric.

**Ana:** That maps well to problems we have. Let me be honest about where we are: 3 platform engineers, on-call is rough, and two seniors outside the team still hold a lot of infra knowledge. What would your first 30 days look like with us?

**Tomas:** I'd resist the temptation to restructure anything for the first few weeks. I'd want to shadow the on-call, read the last six postmortems if they exist, and talk to every squad lead about their top friction. The two seniors holding knowledge — that's the thing I'd move fastest on, because it's a bus-factor risk and it usually means they're also a bottleneck and resentful about it. I'd pair them with my team on a documentation sprint framed as "getting them their time back," not as an audit. Concrete outputs by day 30: an incident runbook v1 and an on-call rotation proposal.

**Ana:** Last one — you've done ISO 27001. Ours is SOC 2 Type II, audit in five months. Honestly, how different is it?

**Tomas:** More similar than different — same control families, same evidence discipline. The Type II part is the trap: it's not a point-in-time audit, the controls have to demonstrably run over the observation window, so the five months matter. I'd want evidence automation in place in the first month, not the last. I haven't done SOC 2 specifically, so I'd get the auditor's control list early rather than assume ISO mappings transfer one-to-one.

**Ana:** Appreciate the honesty. Your questions — and let me tell you how we work today. [Q&A section: candidate asked about RFC culture in practice, incident budget, why the last platform lead left, and how hiring decisions get made. Ana walked through the current stack and team rituals.]
