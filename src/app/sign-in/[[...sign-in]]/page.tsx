import { SignIn } from "@clerk/nextjs";

/**
 * Sign in — split layout from the Exec10X mockup (UI review 2026-10-17): brand
 * panel on the left (wide screens only), Clerk's sign-in on the right. Clerk
 * keeps owning passwords, resets, invitations and two-factor.
 */
export default function SignInPage() {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-2">
      <div className="bg-grain hidden flex-col justify-between border-r border-line bg-card p-12 lg:flex">
        <span className="font-display text-3xl text-ink">Exec10X</span>
        <div>
          <p className="label-mono mb-6">Executive Search</p>
          <h1 className="font-display text-5xl font-light leading-tight text-ink">
            Every great hire begins
            <br />
            with a <em className="text-accent">precise brief.</em>
          </h1>
          <p className="mt-6 max-w-md text-muted">
            Talk, type, or upload. Your agent interviews you, fills the gaps, and drafts a
            board-ready job description.
          </p>
        </div>
        <p className="label-mono">© 2026 Susan Pike &amp; Partners</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-8">
        <SignIn />
      </div>
    </div>
  );
}
