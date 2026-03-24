import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "@/app/globals.css";
import { OptionalClerkProvider } from "@/components/auth/optional-clerk-provider";

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans"
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "Artiva - From meetings to meaningful work",
  description: "Artiva captures meetings, generates summaries, and turns conversations into actionable tasks."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} font-sans antialiased`}>
        <OptionalClerkProvider>{children}</OptionalClerkProvider>
      </body>
    </html>
  );
}
