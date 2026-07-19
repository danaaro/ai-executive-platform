import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "SusieBrain",
  description: "AI hiring intelligence — evidence-based hiring, agent by agent.",
};

// "SusieBrain" is the working app name (public product brand still ADR-002).
// The localization override fixes the Clerk card saying "My Application"
// regardless of the Clerk dashboard app name.
const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to SusieBrain",
      subtitle: "Welcome back! Please sign in to continue",
    },
  },
  signUp: {
    start: {
      title: "Create your SusieBrain account",
      subtitle: "Invitation-only while we're in early testing",
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider localization={clerkLocalization}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
