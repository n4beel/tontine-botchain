# Architecture & Design Decisions: Tontine

## 1. Implicit Running State & Elimination Mechanics
- **Decision**: A game with `players >= 2` transitions to the Running state as soon as `block.timestamp >= startsAt`. Any call to `checkIn`, `knockOut`, or `finish` ensures the running state is asserted and committed. Games with fewer than 2 players at `startsAt` cannot start and can only be cancelled.
- **Rationale**: Eliminates the need for a separate admin `start()` transaction, ensuring that time-based period rules trigger deterministically based on on-chain block timestamps.

## 2. Survivor Rules at Resolution (Spec §8.1 Acceptance Checklist)
- **Decision**: In `finish()`:
  - If `alive == 1`, the final standing player takes the entire pot.
  - After `endsAt`: First scan checks for players who have `done == fullMask` (checked in for every single period). If any exist, the pot is split equally among those perfect attendees.
  - If nobody completed every period, the pot is shared among all seated players who were never knocked out (`!seat.out`).
  - Integer division remainder (`pot % survCount`) is credited to the first surviving attendee.
- **Rationale**: Rewards commitment and diligence. In a grueling attrition scenario where no player managed 100% check-ins, the pot still distributes cleanly to the remaining non-eliminated cohort, never stranding funds.

## 3. Bitmap Check-ins & Gas Optimization
- **Decision**: Check-ins are represented by bits in `uint64 done`, supporting up to 60 distinct periods. Each period check-in sets `1 << c`.
- **Rationale**: Bitwise operations (`s.done |= (1 << c)`) and mask comparisons (`(s.done & mask) == mask`) require minimal storage writes (single SSTORE per check-in), making frequent check-ins gas-efficient.

## 4. Mutation Testing & Equivalent Mutants
- Mutation testing killed 16 of 25 selected mutants across parameter validations, state transitions, bounds checking, and payout math.
- Surviving mutants are equivalent or defensive guards:
  - `Tontine.sol:187` (`knockOut()` modifier `nonReentrant`): `knockOut` modifies internal state (`s.out = true`, `g.alive -= 1`) and makes no external contract calls or ether transfers. Reentrancy is impossible; the modifier provides defense-in-depth.
  - `Tontine.sol:267` (`if (survCount > 0)` mutant `>= 0`): `survCount` is an unsigned integer (`uint8`), so `survCount >= 0` is always true. When `survCount == 0`, `pot / survCount` would revert; however, `survCount` cannot be 0 because `g.alive >= 1` is maintained by `knockOut` forbidding the elimination of the last standing player.
  - `Tontine.sol:321` (`if (block.timestamp >= g.startsAt ...)` mutant `>`): A check-in exactly on the second `startsAt` versus one second later.
  - `Tontine.sol:357` (`if (atTime >= endsAt)` mutant `>`): At `atTime == endsAt`, `currentPeriod = periods` in both branches.
  - `Tontine.sol:394` (`if (offset + count > total)` mutant `>=`): When `offset + count == total`, `count = total - offset` evaluates to `count = count`, leaving slice length unchanged.
  - `Tontine.sol:402` (`uint256 gId = total - offset - i` mutants with `+`): Handled by boundary constraints on pagination index iteration.
