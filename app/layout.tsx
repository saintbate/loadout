import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteHeader } from "./_components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loadout",
  description:
    "Pick the right combination of AI tools for what you want to build.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-neutral-50 text-neutral-900">
          <SiteHeader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
