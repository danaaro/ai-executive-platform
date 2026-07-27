import type { Metadata } from "next";
import { Roboto, Roboto_Slab } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "SusieBrain",
  description: "AI hiring intelligence — evidence-based hiring, agent by agent.",
};

// Susan Pike & Partners type pairing (UX-Shell.md §5): Roboto for body,
// Roboto Slab for display/headings.
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

const robotoSlab = Roboto_Slab({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-roboto-slab",
  display: "swap",
});

// "SusieBrain" is the working app name (public product brand still ADR-002).
// The localization override fixes the Clerk card saying "My Application"
// regardless of the Clerk dashboard app name. Sign-in copy follows
// wireframe #4a ("Sign in to your workspace").
const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to your workspace",
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

// Clerk renders into its own DOM, so the SPP palette reaches the sign-in
// card (#4a) through Clerk's variables rather than our Tailwind classes.
// Hex literals are required — Clerk cannot resolve our CSS custom properties.
// Primary is accent-ink (#8a6524), not brass (#c69746): Clerk uses this color
// for link TEXT as well as buttons, and brass on white fails contrast.
const clerkAppearance = {
  variables: {
    colorPrimary: "#8a6524",
    colorText: "#0a1119",
    colorTextSecondary: "#4b535d",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#0a1119",
    colorDanger: "#a33323",
    borderRadius: "10px",
    fontFamily: "var(--font-roboto), system-ui, sans-serif",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${roboto.variable} ${robotoSlab.variable}`}>
      <body>
        <ClerkProvider localization={clerkLocalization} appearance={clerkAppearance}>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
