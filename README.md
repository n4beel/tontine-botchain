# Tontine (Project 68)

The last one still checking in takes the pot.

## Overview
Tontine is an attrition commitment pool for up to 30 participants.
Players contribute an identical stake before the game starts. Time is divided into 3 to 60 periods (1 hour to 7 days each). In every period, each player must call `checkIn`.
A player who has missed an elapsed period can be knocked out by anyone.
When one survivor remains, or when all periods conclude, the entire staked pot is shared among the surviving attendees.

## Archetype
- **Layout Archetype**: **BC · Roll call**
- **Ground / Ink / Accent**: `#8A1C3E` / `#FFEFF3` / `#C7F464`
- **Typography**: Cardo (headings) · Literata (UI and body)

## WCAG Contrast Verification
- Ink (`#FFEFF3`) on Ground (`#8A1C3E`): **8.2:1** (Passes AAA)
- Ink (`#FFEFF3`) on Surface (`#5E132A`): **11.8:1** (Passes AAA)
- Muted (`#DCB0BD`) on Surface (`#5E132A`): **6.9:1** (Passes AAA)
- Accent Ink (`#1A0610`) on Accent (`#C7F464`): **15.4:1** (Passes AAA)
- Wallet Menu Text (`#FFEFF3`) on Menu BG (`#5E132A`): **11.8:1** (Passes AAA)
- Wallet Menu Muted (`#B88E9B`) on Menu BG (`#5E132A`): **4.6:1** (Passes AA)

## Test Coverage
- **Foundry Unit & Fuzz**: 21 tests pass
- **Invariant Test**: 1 suite (128,000 calls across 4 actors, 0 reverts, balance conserved)
- **Vitest Unit**: 49 tests pass
- **Integration**: 5 tests pass against local Anvil node (port 8668)
- **Mutation Kill Rate**: 16 / 25 killed (64%, 9 equivalent/defensive documented in `contracts/DECISIONS.md`)
