// lib/tontine.ts - Reference implementation and helper functions for Tontine (Spec §2, §4)

export enum GameState {
  Open = 0,
  Running = 1,
  Finished = 2,
  Cancelled = 3,
}

export interface GameSeat {
  done: bigint;
  inGame: boolean;
  out: boolean;
}

export interface GameData {
  creator: string;
  startsAt: bigint;
  periodSecs: number;
  periods: number;
  players: number;
  alive: number;
  state: GameState;
  stake: bigint;
  name: string;
}

/**
 * Calculates current period index: (t - startsAt) / periodSecs
 * Valid while startsAt <= t < endsAt.
 */
export function currentPeriod(startsAt: bigint, periodSecs: number, periods: number, now: bigint): number {
  if (now < startsAt) return 0;
  const endsAt = startsAt + BigInt(periods) * BigInt(periodSecs);
  if (now >= endsAt) return periods;
  return Number((now - startsAt) / BigInt(periodSecs));
}

/**
 * completedMask(c) = (1 << min(c, periods)) - 1
 */
export function completedMask(completedPeriods: number, totalPeriods: number): bigint {
  const c = Math.min(completedPeriods, totalPeriods);
  if (c <= 0) return 0n;
  return (1n << BigInt(c)) - 1n;
}

/**
 * Checks whether a seat is knockable:
 * seat is seated, not out, and missed at least one finished period.
 */
export function isKnockable(
  seat: GameSeat,
  completedPeriods: number,
  totalPeriods: number,
  alive: number
): boolean {
  if (!seat.inGame || seat.out || alive <= 1) return false;
  if (completedPeriods <= 0) return false;

  const mask = completedMask(completedPeriods, totalPeriods);
  return (seat.done & mask) !== mask;
}

/**
 * Returns an array of period indices that a player has missed out of elapsed periods.
 */
export function missedPeriods(done: bigint, elapsedPeriods: number): number[] {
  const missed: number[] = [];
  for (let p = 0; p < elapsedPeriods; p++) {
    if ((done & (1n << BigInt(p))) === 0n) {
      missed.push(p);
    }
  }
  return missed;
}

/**
 * Calculates survivors among seats according to contract spec §2.2 / finish():
 * At or after endsAt: survivors with fullMask (all periods checked in).
 * If none have fullMask or alive == 1: all seated who are not marked out.
 */
export function survivors(
  playerAddrs: string[],
  seats: Record<string, GameSeat>,
  periods: number,
  endsAt: bigint,
  now: bigint
): string[] {
  const fullMask = (1n << BigInt(periods)) - 1n;
  const perfect: string[] = [];

  if (now >= endsAt) {
    for (const p of playerAddrs) {
      const s = seats[p.toLowerCase()];
      if (s && !s.out && s.done === fullMask) {
        perfect.push(p);
      }
    }
  }

  if (perfect.length > 0) return perfect;

  const notOut: string[] = [];
  for (const p of playerAddrs) {
    const s = seats[p.toLowerCase()];
    if (s && !s.out) {
      notOut.push(p);
    }
  }
  return notOut;
}

/**
 * Splits pot equally among n survivors, returning { share, remainder }
 */
export function shares(pot: bigint, n: number): { share: bigint; remainder: bigint } {
  if (n <= 0) return { share: 0n, remainder: 0n };
  const count = BigInt(n);
  return {
    share: pot / count,
    remainder: pot % count,
  };
}

/**
 * Derives the effective running state of a game.
 * Lesson from design review: derive in one place in lib/, never show a fake zero.
 */
export function deriveGameStatus(
  state: GameState,
  startsAt: bigint,
  playersCount: number,
  now: bigint
): "Open" | "Running" | "Finished" | "Cancelled" | "Cancellable" {
  if (state === GameState.Finished) return "Finished";
  if (state === GameState.Cancelled) return "Cancelled";
  if (state === GameState.Open) {
    if (now >= startsAt) {
      if (playersCount >= 2) return "Running";
      return "Cancellable";
    }
    return "Open";
  }
  return "Running";
}

/**
 * Formats a wallet address into a compact format 0x1234…5678
 */
export function formatAddress(addr: string | undefined): string {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
