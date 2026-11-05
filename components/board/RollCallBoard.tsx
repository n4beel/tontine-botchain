"use client";

import { useMemo } from "react";
import { formatAddress, GameSeat, missedPeriods } from "@/lib/tontine";
import Button from "@/components/ui/Button";

interface RollCallBoardProps {
  gameId: bigint;
  name: string;
  players: string[];
  seats: Record<string, GameSeat>;
  periods: number;
  periodSecs: number;
  startsAt: bigint;
  currentPeriodIndex: number;
  aliveCount: number;
  userAddress?: string;
  canKnockOutUser?: (who: string) => boolean;
  onKnockOut?: (who: string) => void;
  isTransacting?: boolean;
}

export default function RollCallBoard({
  gameId,
  name,
  players,
  seats,
  periods,
  periodSecs,
  startsAt,
  currentPeriodIndex,
  aliveCount,
  userAddress,
  canKnockOutUser,
  onKnockOut,
  isTransacting = false,
}: RollCallBoardProps) {
  const normUser = userAddress?.toLowerCase();

  const periodCols = useMemo(() => {
    return Array.from({ length: periods }, (_, i) => i);
  }, [periods]);

  return (
    <div className="flex flex-col gap-4">
      {/* Board Controls and Stats Header */}
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-mono">
        <span>
          {players.length} Players Registered • {aliveCount} Standing
        </span>
        <span>
          Period Length: {Math.floor(periodSecs / 3600)}h {Math.floor((periodSecs % 3600) / 60)}m
        </span>
      </div>

      {/* The Roll-Call Matrix Table (Spec §3.1, §8.3, §8.4) */}
      <div className="overflow-x-auto border border-[var(--border-default)] bg-[var(--bg-surface)]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase tracking-wider font-mono">
              <th className="py-2.5 px-3 whitespace-nowrap">Player</th>
              <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
              {periodCols.map((p) => {
                const isCurrent = p === currentPeriodIndex;
                return (
                  <th
                    key={p}
                    className={`py-2 px-2 text-center font-mono text-[11px] whitespace-nowrap ${
                      isCurrent
                        ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold outline outline-1 outline-[var(--accent)]"
                        : "border-l border-[var(--border-subtle)]"
                    }`}
                  >
                    P{p + 1}
                  </th>
                );
              })}
              <th className="py-2.5 px-3 text-right whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
            {players.map((pAddr) => {
              const seat = seats[pAddr.toLowerCase()] || {
                done: 0n,
                inGame: true,
                out: false,
              };
              const isCaller = Boolean(normUser && pAddr.toLowerCase() === normUser);
              const isKnockableNow = canKnockOutUser ? canKnockOutUser(pAddr) : false;

              // If knocked out, find first missed period
              const missed = missedPeriods(seat.done, currentPeriodIndex);
              const firstMissed = missed.length > 0 ? missed[0] + 1 : undefined;

              return (
                <tr
                  key={pAddr}
                  className={`transition-colors ${
                    isCaller
                      ? "bg-[var(--bg-elevated)] font-semibold text-[var(--text-primary)] border-l-4 border-l-[var(--accent)]"
                      : seat.out
                      ? "opacity-50 line-through text-[var(--text-tertiary)] bg-[var(--bg-base)]/20"
                      : "hover:bg-[var(--bg-elevated)]/40 text-[var(--text-primary)]"
                  }`}
                >
                  {/* Player Address */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="font-mono">{formatAddress(pAddr)}</span>
                    {isCaller && (
                      <span className="ml-2 font-heading not-italic text-[10px] uppercase font-bold px-1.5 py-0.5 bg-[var(--accent)] text-[var(--accent-ink)]">
                        You
                      </span>
                    )}
                  </td>

                  {/* Status Indicator */}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap not-italic">
                    {seat.out ? (
                      <span className="text-[10px] font-bold text-[var(--danger)] uppercase">
                        Out (P{firstMissed})
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-[var(--success)] uppercase">
                        Standing
                      </span>
                    )}
                  </td>

                  {/* Period Columns: tick, box, or dash */}
                  {periodCols.map((p) => {
                    const isCheckedIn = (seat.done & (1n << BigInt(p))) !== 0n;
                    const isPast = p < currentPeriodIndex;
                    const isCurrent = p === currentPeriodIndex;
                    const isUpcoming = p > currentPeriodIndex;

                    return (
                      <td
                        key={p}
                        className={`py-2 px-2 text-center text-sm border-l border-[var(--border-subtle)] not-italic ${
                          isCurrent ? "bg-[var(--bg-overlay)]/40" : ""
                        }`}
                      >
                        {isCheckedIn ? (
                          <span
                            className="text-[var(--success)] font-bold select-none"
                            title={`Period ${p + 1}: Checked in`}
                            aria-label="Checked in"
                          >
                            ✓
                          </span>
                        ) : isPast ? (
                          <span
                            className="text-[var(--danger)] font-bold select-none"
                            title={`Period ${p + 1}: Missed`}
                            aria-label="Missed"
                          >
                            —
                          </span>
                        ) : isCurrent ? (
                          <span
                            className="text-[var(--warning)] font-bold animate-pulse select-none"
                            title={`Period ${p + 1}: Open now`}
                            aria-label="Open now"
                          >
                            ○
                          </span>
                        ) : (
                          <span
                            className="text-[var(--border-default)] select-none"
                            title={`Period ${p + 1}: Upcoming`}
                            aria-label="Upcoming"
                          >
                            □
                          </span>
                        )}
                      </td>
                    );
                  })}

                  {/* Actions (Knock out button if knockable) */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap not-italic">
                    {isKnockableNow ? (
                      <Button
                        tone="danger"
                        sizing="compact"
                        disabled={isTransacting}
                        onClick={() => onKnockOut?.(pAddr)}
                      >
                        Knock Out
                      </Button>
                    ) : seat.out ? (
                      <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
                        Eliminated
                      </span>
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)] font-mono">
                        Up to date
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend for shape and color distinction (Spec §3.1) */}
      <div className="flex items-center gap-4 text-xs font-mono text-[var(--text-muted)] flex-wrap">
        <span className="flex items-center gap-1">
          <strong className="text-[var(--success)] font-bold">✓</strong> Checked in
        </span>
        <span className="flex items-center gap-1">
          <strong className="text-[var(--danger)] font-bold">—</strong> Missed
        </span>
        <span className="flex items-center gap-1">
          <strong className="text-[var(--warning)] font-bold">○</strong> Open for check-in
        </span>
        <span className="flex items-center gap-1">
          <strong className="text-[var(--border-default)]">□</strong> Upcoming
        </span>
      </div>
    </div>
  );
}
