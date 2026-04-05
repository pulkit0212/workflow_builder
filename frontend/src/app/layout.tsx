import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/app/globals.css";
import { OptionalClerkProvider } from "@/components/auth/optional-clerk-provider";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans"
});

export const metadata: Metadata = {
  title: "Artivaa - From meetings to meaningful work",
  description: "Artivaa captures meetings, generates summaries, and turns conversations into actionable tasks."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} font-sans antialiased`}>
        <OptionalClerkProvider>{children}</OptionalClerkProvider>
      </body>
    </html>
  );
}
