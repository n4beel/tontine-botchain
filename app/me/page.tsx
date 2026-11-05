"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { TONTINE_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { formatTontineError } from "@/lib/errors";
import {
  deriveGameStatus,
  GameState,
  GameSeat,
} from "@/lib/tontine";
import { assertActiveChain } from "@/lib/useChainWrite";

interface MyGameSummary {
  id: bigint;
  name: string;
  stake: bigint;
  periods: number;
  periodSecs: number;
  startsAt: bigint;
  status: string;
  isAlive: boolean;
  done: bigint;
}

export default function MyGamesPage() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const publicClient = usePublicClient({ chainId: activeBotChain.id });

  const [pendingBalance, setPendingBalance] = useState<bigint>(0n);
  const [games, setGames] = useState<MyGameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState<bigint>(
    BigInt(Math.floor(Date.now() / 1000))
  );

  async function loadUserData() {
    if (!publicClient || !isDeployed || !address) {
      setLoading(false);
      return;
    }

    try {
      setWithdrawError(null);
      const bal = await publicClient.readContract({
        address: contractAddress,
        abi: TONTINE_ABI,
        functionName: "pending",
        args: [address],
      });
      setPendingBalance(bal);

      const count = await publicClient.readContract({
        address: contractAddress,
        abi: TONTINE_ABI,
        functionName: "gameCount",
      });

      const total = Number(count);
      const userGames: MyGameSummary[] = [];

      for (let i = total; i >= 1; i--) {
        const gId = BigInt(i);
        const seat = await publicClient.readContract({
          address: contractAddress,
          abi: TONTINE_ABI,
          functionName: "seatOf",
          args: [gId, address],
        });

        if (seat.inGame) {
          const gData = await publicClient.readContract({
            address: contractAddress,
            abi: TONTINE_ABI,
            functionName: "gameOf",
            args: [gId],
          });

          const status = deriveGameStatus(
            gData.state as GameState,
            gData.startsAt,
            gData.players,
            nowSec
          );

          userGames.push({
            id: gId,
            name: gData.name,
            stake: gData.stake,
            periods: gData.periods,
            periodSecs: gData.periodSecs,
            startsAt: gData.startsAt,
            status,
            isAlive: !seat.out,
            done: BigInt(seat.done),
          });
        }
      }

      setGames(userGames);
      setLoading(false);
    } catch (err: any) {
      console.error("Failed to load user tontine records:", err);
      setWithdrawError(formatTontineError(err));
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, address]);

  async function handleWithdraw() {
    if (!walletClient || !publicClient) {
      setWithdrawError("Please connect your wallet first.");
      return;
    }
    setWithdrawSuccess(null);
    setWithdrawError(null);
    setIsWithdrawing(true);

    try {
      await assertActiveChain(walletClient);
      const hash = await (walletClient.writeContract as any)({
        address: contractAddress,
        abi: TONTINE_ABI,
        functionName: "withdraw",
        args: [],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Withdraw transaction reverted on chain.");
      }

      setWithdrawSuccess("Funds successfully withdrawn to your wallet!");
      await loadUserData();
    } catch (err: any) {
      console.error("Failed to withdraw:", err);
      setWithdrawError(formatTontineError(err));
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <PageShell
      title="My Tontine Caseload"
      subtitle="Your active and concluded tontine participation, and pending survivor payouts."
    >
      <div className="flex flex-col gap-6">
        {withdrawSuccess && (
          <div className="p-3 bg-[var(--success)]/15 border border-[var(--success)] text-[var(--success)] text-xs font-sans">
            {withdrawSuccess}
          </div>
        )}
        {withdrawError && (
          <div className="p-3 bg-[var(--danger)]/15 border border-[var(--danger)] text-[var(--danger)] text-xs font-sans">
            {withdrawError}
          </div>
        )}

        {/* Pull Payout Balance Panel */}
        <Panel heading="Withdrawable Earnings & Refunds">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <span className="text-xs uppercase font-mono text-[var(--text-muted)] block">
                Available Survivor Winnings
              </span>
              <div className="mt-1 font-mono text-2xl font-bold text-[var(--accent)]">
                {formatEther(pendingBalance)} <span className="text-sm font-normal text-[var(--text-primary)]">BOT</span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Payouts earned from completed tontines or refunded stakes from cancelled games.
              </p>
            </div>

            <Button
              tone="checkin"
              sizing="regular"
              disabled={pendingBalance === 0n || isWithdrawing}
              inFlight={isWithdrawing}
              onClick={handleWithdraw}
            >
              {isWithdrawing ? "Withdrawing..." : "Withdraw Funds"}
            </Button>
          </div>
        </Panel>

        {/* User's games roster */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Enlisted Tontines
            </h2>
            <Link href="/new">
              <Button sizing="compact">＋ Open New Tontine</Button>
            </Link>
          </div>

          {!address ? (
            <Panel>
              <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                Connect your wallet to inspect your tontine games.
              </div>
            </Panel>
          ) : loading ? (
            <Panel>
              <div className="py-8 text-center text-xs font-mono text-[var(--text-muted)] animate-pulse">
                Calling the roll for your account…
              </div>
            </Panel>
          ) : games.length === 0 ? (
            <Panel>
              <div className="py-8 text-center flex flex-col items-center gap-3">
                <p className="text-xs text-[var(--text-muted)]">
                  You are not currently enrolled in any tontines.
                </p>
                <Link href="/">
                  <Button sizing="compact">Browse Open Tontines</Button>
                </Link>
              </div>
            </Panel>
          ) : (
            <div className="border border-[var(--border-default)] bg-[var(--bg-surface)] divide-y divide-[var(--border-subtle)]">
              {games.map((g) => (
                <Link
                  key={g.id.toString()}
                  href={`/game/${g.id.toString()}`}
                  className="p-4 flex items-center justify-between flex-wrap gap-3 hover:bg-[var(--bg-elevated)] transition-colors no-underline text-[var(--text-primary)] block group"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-[var(--accent)]">
                      #{g.id.toString()}
                    </span>
                    <div>
                      <h4 className="font-heading text-sm font-bold group-hover:text-[var(--accent)] transition-colors">
                        {g.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 border ${
                            g.isAlive
                              ? "bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]"
                              : "bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]"
                          }`}
                        >
                          {g.isAlive ? "Alive & Standing" : "Knocked Out"}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                          Status: {g.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs">
                    <span className="font-bold text-[var(--text-primary)] block">
                      Stake: {formatEther(g.stake)} BOT
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {g.periods} periods
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
