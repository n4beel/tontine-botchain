"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { TONTINE_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import {
  deriveGameStatus,
  GameState,
  formatAddress,
} from "@/lib/tontine";

interface GameSummary {
  id: bigint;
  name: string;
  creator: string;
  startsAt: bigint;
  periodSecs: number;
  periods: number;
  players: number;
  alive: number;
  state: GameState;
  stake: bigint;
  isUserIn?: boolean;
}

export default function HomePage() {
  const { address } = useAccount();
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const publicClient = usePublicClient({ chainId: activeBotChain.id });

  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowSec, setNowSec] = useState<bigint>(
    BigInt(Math.floor(Date.now() / 1000))
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(BigInt(Math.floor(Date.now() / 1000)));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  async function loadGames() {
    if (!publicClient || !isDeployed) {
      setLoading(false);
      return;
    }

    try {
      const count = await publicClient.readContract({
        address: contractAddress,
        abi: TONTINE_ABI,
        functionName: "gameCount",
      });

      const total = Number(count);
      if (total === 0) {
        setGames([]);
        setLoading(false);
        return;
      }

      const list: GameSummary[] = [];
      const callerNorm = address?.toLowerCase();

      for (let i = total; i >= Math.max(1, total - 40); i--) {
        const gId = BigInt(i);
        const [gData, playerAddrs] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: TONTINE_ABI,
            functionName: "gameOf",
            args: [gId],
          }),
          publicClient.readContract({
            address: contractAddress,
            abi: TONTINE_ABI,
            functionName: "playersOf",
            args: [gId],
          }),
        ]);

        const isUserIn = Boolean(
          callerNorm && playerAddrs.some((p) => p.toLowerCase() === callerNorm)
        );

        list.push({
          id: gId,
          name: gData.name,
          creator: gData.creator,
          startsAt: gData.startsAt,
          periodSecs: gData.periodSecs,
          periods: gData.periods,
          players: gData.players,
          alive: gData.alive,
          state: gData.state as GameState,
          stake: gData.stake,
          isUserIn,
        });
      }

      // Sort: user's games first
      list.sort((a, b) => {
        if (Boolean(a.isUserIn) === Boolean(b.isUserIn)) return Number(b.id - a.id);
        return a.isUserIn ? -1 : 1;
      });

      setGames(list);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load tontine games:", err);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, address]);

  return (
    <PageShell
      title="Tontine Roll-Call Docket"
      subtitle="The last one still checking in takes the pot. Elimination by missed check-ins."
    >
      <div className="flex flex-col gap-6">
        {/* Intro Disclaimers / What this game is (Spec §1, §3.4) */}
        <Panel heading="What this game is">
          <ul className="list-disc pl-5 space-y-1 text-xs text-[var(--text-muted)]">
            <li>It proves a wallet checked in, not a person. A lost key is a lost seat.</li>
            <li>Everyone who is out loses their stake. The survivors take the entire pot.</li>
            <li>Anyone can knock out a player who missed a finished period.</li>
          </ul>
        </Panel>

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold text-[var(--text-primary)] uppercase tracking-wider">
            Active & Pending Tontines
          </h2>
          <Link href="/new">
            <Button sizing="regular">＋ Open New Tontine</Button>
          </Link>
        </div>

        {/* Games Matrix / Dot-matrix roll call in miniature (Spec §3.1) */}
        {loading ? (
          <Panel>
            <div className="py-12 text-center text-sm font-mono text-[var(--text-muted)] animate-pulse">
              Calling the roll across registered tontines…
            </div>
          </Panel>
        ) : !isDeployed ? (
          <Panel>
            <div className="py-12 text-center text-sm text-[var(--warning)]">
              Tontine contract not yet deployed on this network.
            </div>
          </Panel>
        ) : games.length === 0 ? (
          <Panel>
            <div className="py-12 text-center flex flex-col items-center gap-3">
              <p className="text-sm text-[var(--text-muted)]">
                No tontines are currently recorded on the chain.
              </p>
              <Link href="/new">
                <Button sizing="regular">Start the First Syndicate</Button>
              </Link>
            </div>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {games.map((g) => {
              const status = deriveGameStatus(g.state, g.startsAt, g.players, nowSec);
              const pot = g.stake * BigInt(g.players);

              return (
                <Link
                  key={g.id.toString()}
                  href={`/game/${g.id.toString()}`}
                  className="no-underline block group"
                >
                  <div className="p-4 border border-[var(--border-default)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[var(--accent)]">
                        #{g.id.toString()}
                      </span>
                      <span
                        className={`text-[10px] font-heading font-bold uppercase px-2 py-0.5 border ${
                          status === "Running"
                            ? "bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]"
                            : status === "Open"
                            ? "bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]"
                            : status === "Finished"
                            ? "bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]"
                            : "bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]"
                        }`}
                      >
                        {status}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-heading text-base font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                        {g.name}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                        Created by {formatAddress(g.creator)}
                      </p>
                    </div>

                    {/* Miniature dot-matrix representation (Spec §3.1) */}
                    <div className="p-2.5 bg-[var(--bg-overlay)]/40 border border-[var(--border-subtle)] flex items-center justify-between">
                      <div className="flex items-center gap-1 font-mono text-[10px] text-[var(--text-muted)]">
                        <span>P:</span>
                        {Array.from({ length: Math.min(g.periods, 12) }).map((_, idx) => (
                          <span
                            key={idx}
                            className={`w-2 h-2 inline-block rounded-none ${
                              status === "Finished"
                                ? "bg-[var(--success)]"
                                : status === "Running"
                                ? "bg-[var(--accent)]"
                                : "bg-[var(--border-default)]"
                            }`}
                          />
                        ))}
                        {g.periods > 12 && <span>…</span>}
                      </div>

                      <div className="text-right font-mono text-xs">
                        <span className="font-bold text-[var(--accent)] block">
                          {formatEther(pot)} BOT
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] block">
                          {g.alive}/{g.players} Alive
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono pt-1">
                      <span>Stake: {formatEther(g.stake)} BOT</span>
                      <span>
                        {g.periods} periods × {Math.floor(g.periodSecs / 3600)}h
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
