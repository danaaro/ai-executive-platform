import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exec10X",
  description: "AI hiring intelligence — evidence-based hiring, agent by agent.",
};

// Exec10X type (UI review 2026-10-17, same as exec10x.ai): Newsreader for
// display, IBM Plex Sans for body, IBM Plex Mono for small labels. next/font
// serves the files from our own domain, so visitors' browsers never call Google.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Product name in the app: Exec10X (UI review U1, 2026-10-17).
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
      title: "Create your Exec10X account",
      subtitle: "Invitation-only while we're in early testing",
    },
  },
};

// Clerk renders into its own DOM, so the Exec10X palette reaches the sign-in
// card through Clerk's variables rather than our Tailwind classes. Hex literals
// are required — Clerk cannot resolve our CSS custom properties. Keep in step
// with the tokens in globals.css.
const clerkAppearance = {
  variables: {
    colorPrimary: "#8a5d19",
    colorText: "#14201c",
    colorTextSecondary: "#47554f",
    colorBackground: "#fafbf9",
    colorInputBackground: "#fafbf9",
    colorInputText: "#14201c",
    colorDanger: "#a33323",
    borderRadius: "8px",
    fontFamily: "var(--font-plex-sans), system-ui, sans-serif",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <ClerkProvider localization={clerkLocalization} appearance={clerkAppearance}>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
