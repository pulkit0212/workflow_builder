import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/app/globals.css";
import { OptionalClerkProvider } from "@/components/auth/optional-clerk-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter"
});

export const metadata: Metadata = {
  title: "Artivaa AI — Meetings, summaries, and AI tools in one workspace",
  description:
    "Calendar-backed meetings, structured AI summaries, action items, and four dashboard tools—Meeting Summarizer, Email Generator, Document Analyzer, and Task Generator—with Slack, Gmail, Notion, and Jira sharing.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <OptionalClerkProvider>{children}</OptionalClerkProvider>
      </body>
    </html>
  );
}
