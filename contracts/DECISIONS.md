# Architecture & Design Decisions: Tontine

## 1. Implicit State Transition and Liveness
- **Decision**: Games transition automatically from `State.Open` to `State.Running` upon the first action (`checkIn`, `knockOut`, etc.) taken at or after `startsAt`, provided at least 2 players joined.
- **Rationale**: Avoids requiring a dedicated transaction just to "start" a game, eliminating unnecessary gas costs and operational overhead for the creator.

## 2. Attendance Bitmask and Permissionless Knockouts
- **Decision**:
  - Each check-in in period $p$ flips bit $p$ (`done |= (1 << p)`).
  - Anyone can knock out an un-checked player once a period finishes if `(done & mask) != mask`.
  - The knock-out process is fully decentralized and permissionless.
- **Rationale**: Guarantees that inactive participants cannot passively free-ride to the pot while allowing friends or external watchdogs to enforce rules without central authority.

## 3. Payout and Attendance Fallbacks
- **Decision**:
  - At `endsAt`, the pot is divided equally among all players who completed a perfect attendance record (`done == fullMask`).
  - If nobody achieved perfect attendance, the pot is divided equally among all players who are not knocked out (`!out`).
  - Remainder wei (`pot % survCount`) goes to the first survivor.
- **Rationale**: Prevents funds from ever becoming permanently locked in contract escrow, ensuring 100% of the pot is always distributed.

## 4. Pull Payments (`pending[address]`)
- **Decision**: All payouts and refunds use `pending[account] += amount` and require the user to call `withdraw()`.
- **Rationale**: Shields against reentrancy and DoS attacks where a participant's contract reverts on incoming value transfers.

## 5. Mutation Testing & Equivalent Mutants (19 of 25 killed; 6 genuinely equivalent survivors)
Tested 25 pseudo-random mutations using `scripts/mutation-check.py tontine`. 19 mutants were killed. The remaining 6 survivors are genuinely equivalent per FEEDBACK-wave4-round1 §1:
1. `Tontine.sol:187` (`knockOut()` modifier `nonReentrant` removed):
   - `knockOut()` updates seat storage (`s.out = true`, `g.alive -= 1`) and emits `KnockedOut`. It performs zero external contract calls, staticcalls, or value transfers. Reentrancy is structurally impossible without an external call.
2. `Tontine.sol:394` (`latest` pagination `if (offset + count > total)` mutated to `>=`):
   - Explicitly listed in FEEDBACK-wave4-round1 §1: when `offset + count == total`, `count = total - offset` evaluates to `count = count` (no-op assignment). Semantics are identical on every possible input.
3. `Tontine.sol:267` (`if (survCount > 0)` mutated to `>= 0`):
   - In `finish()`, a game requires `players >= 2` to run. If `survCount == 0` after the perfect attendance scan, the fallback loop populates `survivors` with all seated players where `!s.out`. Because `alive >= 1` in any game that reaches `finish()`, `survCount` is guaranteed to be $\ge 1$. Thus `survCount > 0` and `survCount >= 0` are identical in reachable code.
4. `Tontine.sol:357` (`standing()` view `} else if (atTime >= endsAt) {` mutated to `>`):
   - When `atTime == endsAt`, `atTime >= endsAt` sets `currentP = g.periods` and `compMask = (1 << g.periods) - 1`. If mutated to `atTime > endsAt`, at equality it evaluates the `else` branch: `currentP = uint8((endsAt - g.startsAt) / g.periodSecs) = uint8(g.periods * g.periodSecs / g.periodSecs) = g.periods`, and `compMask = (1 << g.periods) - 1`. Both branches return identical values for `currentP` and `compMask`.
5. `Tontine.sol:198` (`knockOut()` `if (block.timestamp < g.startsAt)` mutated to `<=`:
   - At line 191, `_ensureRunning(g)` requires `block.timestamp >= g.startsAt`. Therefore, inside `knockOut()`, `block.timestamp < g.startsAt` is unreachable. At `block.timestamp == g.startsAt`, `block.timestamp < g.startsAt` is false, and `(block.timestamp - g.startsAt) / g.periodSecs = 0`, yielding `c = 0` in both branches.
6. `Tontine.sol:202` (`c = elapsedPeriods > g.periods ? g.periods : uint8(elapsedPeriods)` mutated to `>=`):
   - At equality `elapsedPeriods == g.periods`, assigning `g.periods` via ternary true or `uint8(elapsedPeriods)` via ternary false produces the exact same value `g.periods`.
