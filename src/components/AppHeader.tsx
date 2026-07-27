import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

/**
 * Persistent top bar. The Susan Pike & Partners mark is a brass monogram plus
 * a spaced-caps wordmark (UX-Shell.md §5); the product name itself stays a
 * placeholder until ADR-002 settles.
 */
export function AppHeader({
  children,
  breadcrumb,
}: {
  children?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/projects" className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-[6px] bg-accent font-display text-[13px] font-bold text-white">
            S
          </span>
          <span className="hidden font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-ink sm:inline">
            Susie&thinsp;Brain
          </span>
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
