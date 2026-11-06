#!/usr/bin/env python3
"""
PreToolUse hook: blocks any edit that writes a .env file, or text that looks
like an API key, a Supabase service role key or a database password, into the
codebase (CLAUDE.md "Secrets and keys").

Reads the tool call as JSON on stdin. Exit 2 = blocked (the message on stderr
goes back to Claude); exit 0 = allowed. Never prints the secret itself.
Fails open on unreadable input so a hook bug never blocks all editing.
"""
import json
import os
import re
import sys

ENV_FILE = re.compile(r"(^|/)\.env(\.[\w.-]+)?$")
ENV_ALLOWED = re.compile(r"\.example$")
# Shell writes into a .env file: > .env, >> .env.local, tee .env, cp/mv x .env
BASH_ENV_WRITE = re.compile(
    r"(>>?|\btee\s+(-a\s+)?|\b(cp|mv)\s+\S+\s+)\s*['\"]?[^\s'\"]*\.env(\.[\w.-]+)?['\"]?(\s|$|;|&|\|)"
)

SECRETS = [
    ("Anthropic API key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}")),
    ("Stripe / Clerk secret key", re.compile(r"\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}")),
    ("ElevenLabs API key", re.compile(r"\bsk_[a-f0-9]{40,}\b")),
    ("Supabase secret key", re.compile(r"\bsb_secret_[A-Za-z0-9_\-]{20,}")),
    ("JWT (e.g. Supabase service role key)", re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,})")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,}")),
    ("Vercel token", re.compile(r"\bvcp_[A-Za-z0-9]{20,}")),
    ("private key", re.compile(r"-----BEGIN ([A-Z]+ )?PRIVATE KEY-----")),
]
# postgres://user:PASSWORD@host — a real password, not a placeholder or a
# throwaway local test database (localhost / 127.0.0.1)
DB_URL = re.compile(r"postgres(ql)?://[^:\s/@]+:([^@\s]+)@([^:/\s]+)")
LOCAL_HOST = re.compile(r"^(localhost|127\.0\.0\.1|\[::1\])$")
PLACEHOLDER = re.compile(r"^(\[.*\]|<.*>|\$\{?\w+\}?|x+|\*+|\.\.\.|…|password|pass|pw|secret|your[-_]?\w*|changeme)$", re.I)
# NAME_SECRET = "literal value"
ASSIGNED = re.compile(
    r"\b[A-Z0-9_]*(SERVICE_ROLE_KEY|SECRET_KEY|SECRET|API_KEY|PRIVATE_KEY|ACCESS_TOKEN|AUTH_TOKEN)\s*[=:]\s*[\"']?([A-Za-z0-9_\-\.+/=]{24,})"
)
NOT_A_VALUE = re.compile(r"^(process\.env|os\.environ|import\.meta\.env|env\.)", re.I)


def find_secret(text: str):
    for name, rx in SECRETS:
        if rx.search(text):
            return name
    for m in DB_URL.finditer(text):
        if not PLACEHOLDER.match(m.group(2)) and not LOCAL_HOST.match(m.group(3)):
            return "database URL with a password"
    for m in ASSIGNED.finditer(text):
        value = m.group(2)
        if not NOT_A_VALUE.match(value) and not PLACEHOLDER.match(value):
            return f"{m.group(1)} assigned a literal value"
    return None


def block(reason: str):
    sys.stderr.write(
        f"BLOCKED by .claude/hooks/block-secrets.py: {reason}. "
        "Secrets live only in environment variables (Vercel / .env.local, edited by a person), "
        "never in code, docs or commands. Use process.env.NAME and ask Dana to set the value.\n"
    )
    sys.exit(2)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    tool = data.get("tool_name", "")
    inp = data.get("tool_input") or {}

    path = inp.get("file_path") or inp.get("notebook_path") or ""
    if tool in ("Write", "Edit", "MultiEdit", "NotebookEdit") and path:
        base = os.path.basename(path)
        if ENV_FILE.search(base) and not ENV_ALLOWED.search(base):
            block(f"writing the env file {base}")

    texts = []
    if tool == "Write":
        texts.append(inp.get("content") or "")
    elif tool == "Edit":
        texts.append(inp.get("new_string") or "")
    elif tool == "MultiEdit":
        texts += [e.get("new_string") or "" for e in inp.get("edits") or []]
    elif tool == "NotebookEdit":
        texts.append(inp.get("new_source") or "")
    elif tool == "Bash":
        cmd = inp.get("command") or ""
        m = BASH_ENV_WRITE.search(cmd)
        if m and not re.search(r"\.example['\"]?(\s|$|;|&|\|)", m.group(0)):
            block("a shell command writing into a .env file")
        texts.append(cmd)

    for t in texts:
        found = find_secret(t)
        if found:
            block(f"text that looks like a secret ({found})")
    sys.exit(0)


def scan_files(paths):
    """--scan FILE...: prints 'path<TAB>kind' for files holding a secret. Never prints values."""
    hits = 0
    for path in paths:
        base = os.path.basename(path)
        if ENV_FILE.search(base) and not ENV_ALLOWED.search(base):
            print(f"{path}\tenv file tracked")
            hits += 1
            continue
        try:
            with open(path, encoding="utf-8") as f:
                found = find_secret(f.read())
        except (UnicodeDecodeError, OSError):
            continue
        if found:
            print(f"{path}\t{found}")
            hits += 1
    sys.exit(1 if hits else 0)


def scan_history():
    """--scan-history: reads `git log -p --format='commit %H'` on stdin; prints 'commit<TAB>kind' for added lines holding a secret."""
    hits, commit = set(), ""
    for line in sys.stdin:
        if line.startswith("commit "):
            commit = line.split()[1][:10]
        elif line.startswith("+") and not line.startswith("+++"):
            found = find_secret(line[1:])
            if found and (commit, found) not in hits:
                hits.add((commit, found))
                print(f"{commit}\t{found}")
    sys.exit(1 if hits else 0)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--scan":
        scan_files(sys.argv[2:])
    elif len(sys.argv) > 1 and sys.argv[1] == "--scan-history":
        scan_history()
    else:
        main()
