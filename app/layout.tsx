import type { Metadata, Viewport } from "next";
import { Cardo, Literata } from "next/font/google";
import { EvmProvider } from "@/components/providers/EvmProvider";
import { ToastProvider } from "@/components/ui/Toast";
import WrongNetworkBar from "@/components/botchain/WrongNetworkBar";
import { app } from "@/lib/app-config";
import "./globals.css";

const cardo = Cardo({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const literata = Literata({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `${app.name} — ${app.tagline}`,
  description: app.tagline,
};

export const viewport: Viewport = {
  themeColor: "#8A1C3E",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${cardo.variable} ${literata.variable}`}>
      <body className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] antialiased font-sans">
        <EvmProvider>
          <ToastProvider>
            <WrongNetworkBar />
            {children}
          </ToastProvider>
        </EvmProvider>
      </body>
    </html>
  );
}
