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
  title: "AI Workflow Builder",
  description: "Production-ready SaaS foundation for multi-tool AI workflows."
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
