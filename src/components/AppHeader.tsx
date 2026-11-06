"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";

const SUPER_USER_MENU = [
  { href: "/internal/companies", label: "Companies" },
  { href: "/internal/company-intel", label: "Company Intel" },
  { href: "/internal/flags", label: "Flagged activity" },
];

/**
 * Persistent top bar: the Exec10X wordmark (UI review U1, 2026-10-17), set in
 * Newsreader like exec10x.ai and the Lovable mockup.
 */
export function AppHeader({
  children,
  breadcrumb,
}: {
  children?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  // Internal tools (ADR-009) render only for platform admins — Dana + Susan.
  // Customers never see the link; the pages/APIs also check server-side.
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  const pathname = usePathname();
  const trail = useAdminTrail(isAdmin, pathname);
  // Super admins always see where they are: Companies / company / role / section
  // (Dana 2026-11-01). Other pages keep their own breadcrumb.
  const inCompany = /^\/(projects\/[0-9a-f-]{36}|internal\/companies\/[0-9a-f-]{36})/i.test(pathname);
  // Its own full-width row under the menu, so names are never cut short (2026-11-02).
  const adminTrail = isAdmin && inCompany && trail?.company ? <AdminTrail trail={trail} pathname={pathname} /> : null;
  if (adminTrail) breadcrumb = undefined;

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link href={isAdmin ? "/internal/companies" : "/projects"} className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-normal text-ink">Exec10X</span>
          <span className="label-mono hidden sm:inline">Executive Search</span>
        </Link>

        {breadcrumb && (
          <>
            <span className="text-line-strong" aria-hidden>
              /
            </span>
            <div className="min-w-0 flex-1">{breadcrumb}</div>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {children}
          {/* Menu (Dana 2026-11-06): super users (Dana, Susan) get the back
              office; customers get no links, their home is their roles. */}
          {isAdmin &&
            SUPER_USER_MENU.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[13px] font-medium transition-colors hover:text-ink ${
                  pathname.startsWith(item.href) ? "text-ink" : "text-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
          <UserButton />
        </div>
      </div>
      {adminTrail && (
        <div className="border-t border-line">
          <div className="mx-auto flex h-11 max-w-6xl items-center px-4">{adminTrail}</div>
        </div>
      )}
    </header>
  );
}

type Trail = { company: { id: string; name: string } | null; entered: boolean; role: { id: string; title: string } | null };

/** Super admins: the company they are working inside, and the role on screen. */
function useAdminTrail(isAdmin: boolean, pathname: string): Trail | null {
  const project = pathname.match(/^\/projects\/([0-9a-f-]{36})/i)?.[1] ?? "";
  const [trail, setTrail] = useState<Trail | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    fetch(`/api/admin/trail?project=${project}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => live && setTrail(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isAdmin, project]);
  return trail;
}

function AdminTrail({ trail, pathname }: { trail: Trail; pathname: string }) {
  const sep = <span className="text-line-strong" aria-hidden>/</span>;
  const crumb = "truncate hover:text-ink";
  const role = trail.role;
  const tab = (href: string, label: string, active: boolean) => (
    <Link href={href} className={active ? "truncate text-ink" : crumb}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Where you are" className="flex min-w-0 items-center gap-2 text-sm text-muted">
      <Link href="/internal/companies" className={crumb}>
        Companies
      </Link>
      {sep}
      <Link href={`/internal/companies/${trail.company!.id}`} className={role ? crumb : "truncate text-ink"}>
        {trail.company!.name}
      </Link>
      {role && (
        <>
          {sep}
          <Link href={`/projects/${role.id}`} className={pathname === `/projects/${role.id}` ? "truncate text-ink" : crumb}>
            {role.title}
          </Link>
          {sep}
          {tab(`/projects/${role.id}/review`, "Job description", /\/(review|interview|start)$/.test(pathname))}
          <span aria-hidden>·</span>
          {tab(`/projects/${role.id}/kit`, "Interview kit", pathname.endsWith("/kit"))}
        </>
      )}
    </nav>
  );
}
