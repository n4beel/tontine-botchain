// lib/limits.ts - Contract-level parameter bounds for Tontine (Spec §2.1)

export const MAX_PLAYERS = 30;
export const MAX_NAME_BYTES = 48;
export const MIN_STAKE = 10000000000000000n; // 0.01 ether
export const MAX_STAKE = 10000000000000000000000n; // 10,000 ether
export const MIN_PERIOD = 3600; // 1 hour
export const MAX_PERIOD = 604800; // 7 days
export const MIN_PERIODS = 3;
export const MAX_PERIODS = 60;
export const MIN_LEAD = 3600; // 1 hour
export const MAX_LEAD = 2592000; // 30 days
export const MAX_PAGE = 50;

export const LIMITS = {
  MAX_PLAYERS,
  MAX_NAME_BYTES,
  MIN_STAKE,
  MAX_STAKE,
  MIN_PERIOD,
  MAX_PERIOD,
  MIN_PERIODS,
  MAX_PERIODS,
  MIN_LEAD,
  MAX_LEAD,
  MAX_PAGE,
} as const;

export const CONTRACT_LIMITS = LIMITS;
