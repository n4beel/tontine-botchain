"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

export interface TontineActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "checkin" | "neutral" | "danger" | "subtle";
  sizing?: "compact" | "regular" | "prominent";
  inFlight?: boolean;
  // Aliases for compatibility
  variant?: "checkin" | "neutral" | "danger" | "subtle" | "ghost" | "primary" | "secondary";
  size?: "compact" | "regular" | "prominent" | "sm" | "md" | "lg";
  loading?: boolean;
}

const TontineButton = forwardRef<HTMLButtonElement, TontineActionProps>(
  (
    {
      children,
      tone = "checkin",
      sizing = "regular",
      disabled,
      inFlight = false,
      variant,
      size,
      loading,
      className = "",
      ...rest
    },
    ref
  ) => {
    let effectiveSizing = sizing;
    if (size === "sm" || size === "compact") effectiveSizing = "compact";
    else if (size === "lg" || size === "prominent") effectiveSizing = "prominent";
    else if (size === "md" || size === "regular") effectiveSizing = "regular";

    const isSpinning = loading !== undefined ? loading : inFlight;

    let effectiveTone = tone;
    if (variant === "ghost" || variant === "secondary") effectiveTone = "subtle";
    else if (variant === "danger") effectiveTone = "danger";
    else if (variant === "primary") effectiveTone = "checkin";

    const sizingStyles = {
      compact: "px-3 py-1.5 text-xs font-semibold uppercase tracking-wider",
      regular: "px-4 py-2 text-sm font-semibold tracking-wide",
      prominent: "px-6 py-3 text-base font-bold tracking-wide shadow-md",
    }[effectiveSizing];

    const toneStyles = {
      checkin:
        "bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-95 active:scale-[0.98] border border-[var(--accent)] font-bold",
      neutral:
        "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] active:scale-[0.98]",
      danger:
        "bg-[var(--danger)] text-[var(--accent-ink)] hover:opacity-90 active:scale-[0.98] border border-transparent font-bold",
      subtle:
        "bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)]",
    }[effectiveTone];

    return (
      <button
        ref={ref}
        disabled={disabled || isSpinning}
        className={`inline-flex items-center justify-center font-heading rounded-none transition duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none ${sizingStyles} ${toneStyles} ${className}`}
        {...rest}
      >
        {isSpinning ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span>{children}</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

TontineButton.displayName = "TontineButton";

export default TontineButton;
