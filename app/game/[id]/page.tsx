"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import RollCallBoard from "@/components/board/RollCallBoard";
import { TONTINE_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { formatTontineError } from "@/lib/errors";
import {
  currentPeriod,
  deriveGameStatus,
  isKnockable,
  shares,
  GameState,
  GameSeat,
  GameData,
} from "@/lib/tontine";
import { assertActiveChain } from "@/lib/useChainWrite";

export default function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const gameId = BigInt(resolvedParams.id);

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const publicClient = usePublicClient({ chainId: activeBotChain.id });

  const [game, setGame] = useState<GameData | null>(null);
  const [players, setPlayers] = useState<string[]>([]);
  const [seats, setSeats] = useState<Record<string, GameSeat>>({});
  const [loading, setLoading] = useState(true);
  const [isTransacting, setIsTransacting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txSuccessMsg, setTxSuccessMsg] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState<bigint>(
    BigInt(Math.floor(Date.now() / 1000))
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(BigInt(Math.floor(Date.now() / 1000)));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  async function loadBoardData() {
    if (!publicClient || !isDeployed) {
      setLoading(false);
      return;
    }

    try {
      setErrorMsg(null);
      const [gData, playerAddrs] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: TONTINE_ABI,
          functionName: "gameOf",
          args: [gameId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: TONTINE_ABI,
          functionName: "playersOf",
          args: [gameId],
        }),
      ]);

      const seatRecords: Record<string, GameSeat> = {};
      await Promise.all(
        playerAddrs.map(async (p) => {
          const s = await publicClient.readContract({
            address: contractAddress,
            abi: TONTINE_ABI,
            functionName: "seatOf",
            args: [gameId, p],
          });
          seatRecords[p.toLowerCase()] = {
            done: BigInt(s.done),
            inGame: s.inGame,
            out: s.out,
          };
        })
      );

      setGame({
        creator: gData.creator,
        startsAt: gData.startsAt,
        periodSecs: gData.periodSecs,
        periods: gData.periods,
        players: gData.players,
        alive: gData.alive,
        state: gData.state as GameState,
        stake: gData.stake,
        name: gData.name,
      });
      setPlayers([...playerAddrs]);
      setSeats(seatRecords);
      setLoading(false);
    } catch (err: any) {
      console.error("Failed to load tontine board data:", err);
      setErrorMsg(formatTontineError(err));
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, gameId]);

  if (loading) {
    return (
      <PageShell
        title={`Tontine #${gameId.toString()}`}
        subtitle="Calling the roll and assembling player records…"
      >
        <Panel>
          <div className="py-12 text-center text-sm font-mono text-[var(--text-muted)] animate-pulse">
            Calling the roll across records…
          </div>
        </Panel>
      </PageShell>
    );
  }

  if (!game || game.creator === "0x0000000000000000000000000000000000000000") {
    return (
      <PageShell
        title={`Tontine #${gameId.toString()}`}
        subtitle="Game record not found on this chain."
      >
        <Panel>
          <div className="py-12 text-center flex flex-col items-center gap-3">
            <p className="text-sm text-[var(--text-muted)]">
              This tontine syndicate does not exist.
            </p>
            <Link href="/">
              <Button sizing="compact">Return to Roll Call</Button>
            </Link>
          </div>
        </Panel>
      </PageShell>
    );
  }

  const callerNorm = address?.toLowerCase();
  const callerSeat = callerNorm ? seats[callerNorm] : undefined;
  const isCallerSeated = Boolean(callerSeat?.inGame);
  const isCallerOut = Boolean(callerSeat?.out);

  const status = deriveGameStatus(game.state, game.startsAt, game.players, nowSec);
  const curPeriod = currentPeriod(game.startsAt, game.periodSecs, game.periods, nowSec);
  const endsAt = game.startsAt + BigInt(game.periods) * BigInt(game.periodSecs);

  // Exact boolean predicates for actions
  const isCheckedInCurrentPeriod = Boolean(
    callerSeat && (callerSeat.done & (1n << BigInt(curPeriod))) !== 0n
  );

  const canCheckIn: boolean =
    status === "Running" &&
    isCallerSeated &&
    !isCallerOut &&
    curPeriod < game.periods &&
    !isCheckedInCurrentPeriod;

  const canJoin: boolean =
    game.state === GameState.Open &&
    nowSec < game.startsAt &&
    !isCallerSeated &&
    game.players < 30;

  const canFinish: boolean =
    status === "Running" &&
    (game.alive === 1 || nowSec >= endsAt);

  const canCancel: boolean =
    status === "Cancellable" ||
    (game.state === GameState.Open && nowSec >= game.startsAt && game.players < 2);

  // Time calculations
  let periodEndsIn = 0;
  if (status === "Running" && curPeriod < game.periods) {
    const nextBoundary = game.startsAt + BigInt(curPeriod + 1) * BigInt(game.periodSecs);
    periodEndsIn = Math.max(0, Number(nextBoundary - nowSec));
  }

  // Knockable evaluator
  function checkKnockable(pAddr: string): boolean {
    if (!game) return false;
    const s = seats[pAddr.toLowerCase()];
    if (!s) return false;
    return isKnockable(s, curPeriod, game.periods, game.alive);
  }

  // Tx execution helper
  async function executeTx(
    fnName: "join" | "checkIn" | "knockOut" | "finish" | "cancel",
    args: any[],
    value?: bigint,
    successText?: string
  ) {
    if (!walletClient || !publicClient) {
      setErrorMsg("Please connect your wallet first.");
      return;
    }
    setErrorMsg(null);
    setTxSuccessMsg(null);
    setIsTransacting(true);

    try {
      await assertActiveChain(walletClient);
      const hash = await (walletClient.writeContract as any)({
        address: contractAddress,
        abi: TONTINE_ABI,
        functionName: fnName,
        args,
        value,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Transaction reverted on chain.");
      }

      setTxSuccessMsg(successText || "Transaction succeeded!");
      await loadBoardData();
    } catch (err: any) {
      console.error(`Error during ${fnName}:`, err);
      setErrorMsg(formatTontineError(err));
    } finally {
      setIsTransacting(false);
    }
  }

  const pot = game.stake * BigInt(game.players);

  return (
    <PageShell
      title={`Tontine #${gameId.toString()}: ${game.name}`}
      subtitle="The last one still checking in takes the pot."
    >
      <div className="flex flex-col gap-6">
        {/* Navigation & Status bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs font-mono text-[var(--accent)] hover:underline flex items-center gap-1"
          >
            ← Back to Roll Call
          </Link>
          <span className="font-mono text-xs text-[var(--text-muted)]">
            Total Pot: <strong className="text-[var(--accent)] font-bold">{formatEther(pot)} BOT</strong>
          </span>
        </div>

        {/* Alerts */}
        {txSuccessMsg && (
          <div className="p-3 bg-[var(--success)]/15 border border-[var(--success)] text-[var(--success)] text-xs font-sans">
            {txSuccessMsg}
          </div>
        )}
        {errorMsg && (
          <div className="p-3 bg-[var(--danger)]/15 border border-[var(--danger)] text-[var(--danger)] text-xs font-sans">
            {errorMsg}
          </div>
        )}

        {/* The One Primary Action: Check In button (Spec §0, §3.3) */}
        {status === "Running" && isCallerSeated && !isCallerOut && (
          <Panel heading="Your Roll Call Duty" highlighted={!isCheckedInCurrentPeriod}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="font-heading text-sm text-[var(--text-primary)] font-bold">
                  {/* Period copy required by Spec §3.4 */}
                  Period {curPeriod + 1} of {game.periods} ends in{" "}
                  {Math.floor(periodEndsIn / 3600)}h {Math.floor((periodEndsIn % 3600) / 60)}m {periodEndsIn % 60}s. Check in before then.
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {isCheckedInCurrentPeriod
                    ? "✓ You have already checked in for this period."
                    : "Failure to check in before period closes will make you knockable by any player."}
                </p>
              </div>

              <Button
                tone="checkin"
                sizing="prominent"
                disabled={!canCheckIn || isTransacting}
                inFlight={isTransacting}
                onClick={() =>
                  executeTx(
                    "checkIn",
                    [gameId],
                    undefined,
                    `Check-in recorded for period ${curPeriod + 1}!`
                  )
                }
              >
                {isCheckedInCurrentPeriod ? "Checked In" : "Check In"}
              </Button>
            </div>
          </Panel>
        )}

        {/* State: OPEN / Joinable */}
        {status === "Open" && (
          <Panel heading="Recruitment Phase">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="font-heading text-sm text-[var(--text-primary)] font-bold">
                  Syndicate Recruitment Open
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Starts at block time{" "}
                  {new Date(Number(game.startsAt) * 1000).toLocaleString()}. Stake is{" "}
                  {formatEther(game.stake)} BOT.
                </p>
              </div>

              {canJoin ? (
                <Button
                  tone="checkin"
                  sizing="regular"
                  disabled={isTransacting}
                  onClick={() =>
                    executeTx(
                      "join",
                      [gameId],
                      game.stake,
                      "You have claimed a seat in this tontine!"
                    )
                  }
                >
                  Join Syndicate ({formatEther(game.stake)} BOT)
                </Button>
              ) : isCallerSeated ? (
                <span className="text-xs font-mono text-[var(--success)] font-bold px-3 py-1 bg-[var(--success)]/10 border border-[var(--success)]">
                  ✓ Seat Claimed
                </span>
              ) : (
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  Roster Full
                </span>
              )}
            </div>
          </Panel>
        )}

        {/* State: Cancellable */}
        {canCancel && (
          <Panel heading="Game Cancelled Due to Low Attendance">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-[var(--danger)]">
                The start time passed with fewer than 2 players. Anyone may trigger cancellation to refund all staked deposits.
              </p>
              <Button
                tone="danger"
                sizing="compact"
                disabled={isTransacting}
                onClick={() =>
                  executeTx(
                    "cancel",
                    [gameId],
                    undefined,
                    "Tontine cancelled! Stakes refunded to pending balances."
                  )
                }
              >
                Cancel & Refund Stakes
              </Button>
            </div>
          </Panel>
        )}

        {/* State: Finish available */}
        {canFinish && (
          <Panel heading="Resolution Phase" highlighted>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-heading text-sm text-[var(--text-primary)] font-bold">
                  Tontine Concluded!
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {game.alive === 1
                    ? "Only one survivor remains standing! They claim the entire pot."
                    : "The final period has elapsed. Surviving players share the pot."}
                </p>
              </div>
              <Button
                tone="checkin"
                sizing="regular"
                disabled={isTransacting}
                onClick={() =>
                  executeTx(
                    "finish",
                    [gameId],
                    undefined,
                    "Tontine finished! Survivors have been credited with their shares."
                  )
                }
              >
                Disburse Pot ({formatEther(pot)} BOT)
              </Button>
            </div>
          </Panel>
        )}

        {/* The Roll-Call Matrix Board */}
        <RollCallBoard
          gameId={gameId}
          name={game.name}
          players={players}
          seats={seats}
          periods={game.periods}
          periodSecs={game.periodSecs}
          startsAt={game.startsAt}
          currentPeriodIndex={curPeriod}
          aliveCount={game.alive}
          userAddress={address}
          canKnockOutUser={checkKnockable}
          onKnockOut={(target) =>
            executeTx(
              "knockOut",
              [gameId, target],
              undefined,
              `Player knocked out for missed check-in!`
            )
          }
          isTransacting={isTransacting}
        />

        {/* Terminal state banners */}
        {game.state === GameState.Finished && (
          <div className="p-4 bg-[var(--success)]/10 border border-[var(--success)] text-[var(--success)] text-xs font-mono">
            <strong className="block text-sm font-heading font-bold mb-1">
              Tontine Finished — Payouts Credited
            </strong>
            The pot has been divided among the surviving attendees. Survivors can withdraw their funds under{" "}
            <Link href="/me" className="underline font-bold">
              My Games
            </Link>
            .
          </div>
        )}

        {game.state === GameState.Cancelled && (
          <div className="p-4 bg-[var(--danger)]/10 border border-[var(--danger)] text-[var(--danger)] text-xs font-mono">
            <strong className="block text-sm font-heading font-bold mb-1">
              Tontine Cancelled
            </strong>
            Insufficient players joined before the deadline. All stakes have been returned to depositors.
          </div>
        )}
      </div>
    </PageShell>
  );
}
