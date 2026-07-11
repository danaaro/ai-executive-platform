import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Description Agent — AI Executive Platform",
  description: "Internal test harness for the Job Description agent.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
