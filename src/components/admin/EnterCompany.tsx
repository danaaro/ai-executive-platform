"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";

/**
 * Switches a super admin into the company of the page they opened, as a full
 * page load (see shared/enter-company.ts). Renders nothing of the page until
 * then, so nothing loads under the wrong company. If the switch did not take
 * (the same switch was tried seconds ago), it stops and says so rather than
 * looping.
 */
export function EnterCompany({ href }: { href: string }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const key = "exec10x-enter";
    let last: { href: string; at: number } | null = null;
    try {
      last = JSON.parse(sessionStorage.getItem(key) ?? "null");
    } catch {}
    if (last?.href === href && Date.now() - last.at < 10_000) {
      setStuck(true);
      return;
    }
    try {
      sessionStorage.setItem(key, JSON.stringify({ href, at: Date.now() }));
    } catch {}
    window.location.replace(href);
  }, [href]);
  return stuck ? (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <Alert tone="danger">
        Could not switch to this company. <a className="underline" href="/internal/companies">Back to companies</a>
      </Alert>
    </main>
  ) : null;
}
