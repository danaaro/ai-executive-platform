"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";

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
  // Inside a customer company in admin, "Roles" means THAT company's roles,
  // not the admin's own company (Dana 2026-10-19).
  const adminCompany = usePathname().match(/^\/internal\/companies\/([0-9a-f-]{36})/i)?.[1] ?? null;

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
          {isAdmin && (
            <Link
              href={adminCompany ? `/internal/companies/${adminCompany}` : "/projects"}
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              {adminCompany ? "Roles" : "Our roles"}
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/internal/companies"
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              Companies
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/internal/company-intel"
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              Company Intel
            </Link>
          )}
          <Link
            href="/artifacts"
            className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
          >
            Artifacts
          </Link>
          <Link
            href="/agents"
            className="hidden text-[13px] font-medium text-muted transition-colors hover:text-ink sm:inline"
          >
            Assistants
          </Link>
          <UserButton />
        </div>
      </div>
    </header>
  );
}
