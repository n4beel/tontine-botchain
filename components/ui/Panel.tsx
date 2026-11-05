"use client";

import { ReactNode } from "react";

interface TontineRosterBoxProps {
  children: ReactNode;
  heading?: string;
  badge?: string;
  className?: string;
  highlighted?: boolean;
}

export default function Panel({
  children,
  heading,
  badge,
  className = "",
  highlighted = false,
}: TontineRosterBoxProps) {
  return (
    <section
      className={`border p-5 transition-all bg-[var(--bg-surface)] ${
        highlighted
          ? "border-[var(--accent)] shadow-sm"
          : "border-[var(--border-default)]"
      } ${className}`}
    >
      {(heading || badge) && (
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
          {heading && (
            <h3 className="font-heading text-base font-bold text-[var(--text-primary)] uppercase tracking-wider">
              {heading}
            </h3>
          )}
          {badge && (
            <span className="font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-muted)] font-medium">
              {badge}
            </span>
          )}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
}
