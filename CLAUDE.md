# exec10x.ai Platform — Core Rules

## Context
- B2B multi-tenant platform. Customers are companies hiring senior roles in Europe and Asia.
- Step 1: JD agent interviews the hiring manager using our proprietary method and produces an approved job description.
- Step 2 (next): interview kit generated from the approved job description.
- Dana is not an engineer. Explain every significant step in plain English before building. Ask before adding any new service or package.

## Architecture
- exec10x.ai = public marketing site (no admin links).
- app.exec10x.ai = customer app.
- admin.exec10x.ai = back office for admins only.
- Stack: Vercel (hosting), Supabase (database), Clerk (auth with Organizations), Stripe (payments), Anthropic API (agents), GitHub private repo (source of truth).
- Frontend may be built in Lovable via GitHub sync. Never edit the same files in both at once.
- Agents only for tasks needing judgment (interviews, drafting). Fixed processes (onboarding, payments, credits) are plain code.

## Data model
- Company: one account per customer. Holds company context, users, role-credit balance, payment history.
- Role (workspace): belongs to one company. Has locked title, salary range, status, versions.
- Every table has company_id. Row-level security enabled on every table.

## Security (non-negotiable)
- No hardcoded secrets. Use environment variables; .env in .gitignore; provide .env.example.
- Server keys never in frontend code.
- All prompts and agent logic stay on the server. Never send them to the browser.
- Every API route checks authentication. company_id always comes from the session, never from the browser.
- Admin pages and API routes require the admin role in Clerk, checked on the server. Admins use two-factor authentication.
- Validate and sanitize all user input.
- Never write prompts, API keys or personal data to application logs.
- All usage limits enforced on the server.

## Agent behaviour changes
- All interview agent behaviour lives in prompt files on the server (e.g. products/interview-intelligence/prompts/01-job-description.md for the JD agent; shared rules in prompts/system/).
- When I ask for a change in how the agent behaves, update the relevant prompt file. Never hardcode behaviour elsewhere.
- After each change, tell me which file you changed and what you added.
- Add the decision to docs/decisions.md.

## Documentation rules — always follow
After any change or decision, update the right file before finishing the task:
- How the interview agent behaves → the agent's prompt file (e.g. products/interview-intelligence/prompts/01-job-description.md; shared rules in prompts/system/)
- Screens, flow, onboarding, payments → docs/customer-journey.md
- Limits, IP protection, monitoring → docs/guardrails.md
- Quality tests → docs/evals.md
- Every decision, with date and reason → docs/decisions.md

At the end of every task, report:
1. Which files you changed
2. What you added or changed in each, in one line
If a request doesn't fit any file, ask me where it belongs.

## Read before working on specific areas
- Before working on onboarding, payments, credits, roles or the job description flow → read docs/customer-journey.md
- Before working on agent prompts, usage limits, IP protection or monitoring → read docs/guardrails.md
- Before changing any prompt, or when asked to test quality → read docs/evals.md
- Before creating folders or files, or moving code → read docs/repo-structure.md
- Before working on the Company Intelligence tool → read docs/company-intel.md
- If a task touches more than one area, read all relevant files first.

## Before finishing any task
- State whether the change touches security, auth, payments or data access.
- After major features, run the security review below.

## Security review checklist
Review as a security auditor and report issues ranked by severity, with plain-English explanations and fixes:
1. Hardcoded secrets anywhere, including git history?
2. Any prompts or agent logic reaching the browser?
3. RLS enabled with company_id policies on every table?
4. Every API route checks authentication?
5. Could company A reach company B's data by changing an ID?
6. Is user input validated before reaching the database or the AI?
7. Outdated packages with known vulnerabilities? (npm audit)
8. Anything sensitive written to logs?
