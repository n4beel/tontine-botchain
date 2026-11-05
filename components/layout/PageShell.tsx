"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { footerLinks } from "@/lib/botchain/chain";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export default function PageShell({ children, title, subtitle }: PageShellProps) {
  const currentPath = usePathname();
  const chainLinks = footerLinks();

  const navigation = [
    { label: "Roll Call", href: "/" },
    { label: "New Tontine", href: "/new" },
    { label: "My Games", href: "/me" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Header bar */}
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-surface)] sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 no-underline">
              <span className="text-2xl" aria-hidden="true">⏱️</span>
              <div>
                <span className="font-heading font-bold text-xl text-[var(--accent)] tracking-tight block leading-tight">
                  {app.name}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-mono block">
                  Last One Standing
                </span>
              </div>
            </Link>

            <nav className="hidden sm:flex items-center gap-2">
              {navigation.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`px-3 py-1 text-xs uppercase font-heading font-bold tracking-wider transition-colors ${
                    currentPath === n.href
                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <NetworkBadge />
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {(title || subtitle) && (
          <div className="mb-6 border-b border-[var(--border-subtle)] pb-4">
            {title && (
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-[var(--text-muted)] leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        )}
        {children}
      </main>

      {/* Shared Footer Contract: exactly 3 links */}
      <footer className="mt-auto border-t border-[var(--border-default)] bg-[var(--bg-surface)] py-6 text-xs text-[var(--text-muted)]">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <BuiltOnBotChain />

          <div className="flex items-center gap-6">
            <a
              href={chainLinks.contract}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors underline font-mono text-xs"
            >
              Contract
            </a>
            <a
              href={chainLinks.site}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors underline font-mono text-xs"
            >
              BOT Chain
            </a>
            <a
              href={chainLinks.explorer}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors underline font-mono text-xs"
            >
              Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
