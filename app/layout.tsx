import type { Metadata } from "next";
import { Cardo, Literata } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { app } from "@/lib/app-config";

const cardo = Cardo({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-heading",
});

const literata = Literata({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: `${app.name} — ${app.tagline}`,
  description: app.description,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${cardo.variable} ${literata.variable}`}>
      <body className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
