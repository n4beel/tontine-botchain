import { describe, it, expect } from "vitest";
import {
  currentPeriod,
  completedMask,
  isKnockable,
  missedPeriods,
  survivors,
  shares,
  deriveGameStatus,
  GameState,
  GameSeat,
} from "../tontine";

describe("Tontine pure math & game helpers", () => {
  const startsAt = 1000n;
  const periodSecs = 3600; // 1 hour
  const periods = 5;

  it("calculates currentPeriod correctly", () => {
    // Before start
    expect(currentPeriod(startsAt, periodSecs, periods, 999n)).toBe(0);
    // Exactly at start
    expect(currentPeriod(startsAt, periodSecs, periods, 1000n)).toBe(0);
    // Within period 0
    expect(currentPeriod(startsAt, periodSecs, periods, 2000n)).toBe(0);
    // Period 1 (1000 + 3600 = 4600)
    expect(currentPeriod(startsAt, periodSecs, periods, 4600n)).toBe(1);
    // Period 4
    expect(currentPeriod(startsAt, periodSecs, periods, 1000n + 4n * 3600n + 10n)).toBe(4);
    // At and after end (1000 + 5 * 3600 = 19000)
    expect(currentPeriod(startsAt, periodSecs, periods, 19000n)).toBe(5);
    expect(currentPeriod(startsAt, periodSecs, periods, 25000n)).toBe(5);
  });

  it("calculates completedMask correctly", () => {
    expect(completedMask(0, 5)).toBe(0n);
    expect(completedMask(1, 5)).toBe(1n); // bit 0 (2^1 - 1)
    expect(completedMask(2, 5)).toBe(3n); // bits 0, 1 (2^2 - 1 = 3)
    expect(completedMask(5, 5)).toBe(31n); // 2^5 - 1 = 31
    expect(completedMask(10, 5)).toBe(31n); // capped at periods = 5
  });

  it("evaluates isKnockable correctly", () => {
    const seatUpToDate: GameSeat = { done: 3n, inGame: true, out: false }; // bits 0 and 1 set
    const seatMissedP1: GameSeat = { done: 1n, inGame: true, out: false }; // bit 0 set, bit 1 missing
    const seatOut: GameSeat = { done: 1n, inGame: true, out: true };

    // In period 0 (0 completed periods): nobody is knockable
    expect(isKnockable(seatMissedP1, 0, 5, 2)).toBe(false);

    // In period 2 (2 completed periods: 0 and 1):
    // seatUpToDate has done=3 (mask 3) -> not knockable
    expect(isKnockable(seatUpToDate, 2, 5, 2)).toBe(false);
    // seatMissedP1 has done=1 (mask 3) -> knockable!
    expect(isKnockable(seatMissedP1, 2, 5, 2)).toBe(true);

    // If only 1 player remains alive -> cannot knock out the last one!
    expect(isKnockable(seatMissedP1, 2, 5, 1)).toBe(false);

    // Already out player cannot be knocked out
    expect(isKnockable(seatOut, 2, 5, 2)).toBe(false);
  });

  it("tracks missedPeriods accurately", () => {
    // done = 5 (binary 00101 => checked in 0 and 2; missed 1)
    expect(missedPeriods(5n, 3)).toEqual([1]);
    // done = 0 => missed all
    expect(missedPeriods(0n, 3)).toEqual([0, 1, 2]);
    // done = 7 => missed none
    expect(missedPeriods(7n, 3)).toEqual([]);
  });

  it("identifies survivors with full attendance or fallback", () => {
    const p1 = "0x1111111111111111111111111111111111111111";
    const p2 = "0x2222222222222222222222222222222222222222";
    const p3 = "0x3333333333333333333333333333333333333333";

    const endsAt = 1000n + 3n * 3600n; // 3 periods = fullMask 7
    const fullMask = 7n;

    const seats: Record<string, GameSeat> = {
      [p1.toLowerCase()]: { done: fullMask, inGame: true, out: false },
      [p2.toLowerCase()]: { done: 3n, inGame: true, out: false },
      [p3.toLowerCase()]: { done: fullMask, inGame: true, out: true }, // marked out
    };

    // p1 has full mask and not out; p2 missed period 2; p3 is out
    const surv = survivors([p1, p2, p3], seats, 3, endsAt, endsAt + 10n);
    expect(surv).toEqual([p1]);

    // Fallback: nobody completed fullMask
    seats[p1.toLowerCase()].done = 3n;
    const survFallback = survivors([p1, p2, p3], seats, 3, endsAt, endsAt + 10n);
    expect(survFallback).toEqual([p1, p2]);
  });

  it("calculates equal shares and remainder to first survivor", () => {
    const pot = 100n;
    const { share, remainder } = shares(pot, 3);
    expect(share).toBe(33n);
    expect(remainder).toBe(1n);

    const even = shares(100n, 2);
    expect(even.share).toBe(50n);
    expect(even.remainder).toBe(0n);
  });

  it("derives game status reliably", () => {
    // Open before start
    expect(deriveGameStatus(GameState.Open, 1000n, 2, 500n)).toBe("Open");
    // Open after start with >= 2 players -> Running
    expect(deriveGameStatus(GameState.Open, 1000n, 2, 1200n)).toBe("Running");
    // Open after start with < 2 players -> Cancellable
    expect(deriveGameStatus(GameState.Open, 1000n, 1, 1200n)).toBe("Cancellable");
    // Explicit Running
    expect(deriveGameStatus(GameState.Running, 1000n, 2, 1200n)).toBe("Running");
    // Finished
    expect(deriveGameStatus(GameState.Finished, 1000n, 2, 5000n)).toBe("Finished");
  });
});
