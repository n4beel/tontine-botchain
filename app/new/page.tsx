"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { TONTINE_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { formatTontineError } from "@/lib/errors";
import { assertActiveChain } from "@/lib/useChainWrite";
import { LIMITS } from "@/lib/limits";

export default function NewGamePage() {
  const router = useRouter();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;

  const publicClient = usePublicClient({ chainId: activeBotChain.id });

  const [name, setName] = useState("");
  const [stakeEth, setStakeEth] = useState("1.0");
  const [leadHours, setLeadHours] = useState("2");
  const [periodHours, setPeriodHours] = useState("24");
  const [periodsCount, setPeriodsCount] = useState("7");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletClient || !publicClient) {
      setErrorMsg("Please connect your wallet first.");
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      await assertActiveChain(walletClient);

      const parsedStake = parseEther(stakeEth);
      const leadSecs = BigInt(Math.floor(parseFloat(leadHours) * 3600));
      const periodSecs = Math.floor(parseFloat(periodHours) * 3600);
      const periods = parseInt(periodsCount, 10);

      const currentBlock = await publicClient.getBlock();
      // The contract checks the start against the block timestamp at mining time, which is
      // later than the block read here by however long the wallet prompt stays open (10 minutes
      // was seen). So a lead near the one-hour minimum is lifted to 1.5 hours; longer leads
      // already have that room. Capped at the contract's 30-day maximum.
      const effectiveLead = leadSecs < BigInt(LIMITS.MIN_LEAD + 1800) ? BigInt(LIMITS.MIN_LEAD + 1800) : leadSecs;
      const wanted = currentBlock.timestamp + effectiveLead;
      const cap = currentBlock.timestamp + BigInt(LIMITS.MAX_LEAD);
      const startsAt = wanted > cap ? cap : wanted;

      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: TONTINE_ABI,
        functionName: "open",
        args: [name, parsedStake, startsAt, periodSecs, periods],
        value: parsedStake,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("Transaction reverted on chain.");
      }

      router.push("/");
    } catch (err: any) {
      console.error("Failed to open tontine:", err);
      setErrorMsg(formatTontineError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell
      title="Found a Tontine Syndicate"
      subtitle="Establish a collective survival pool. You take seat 1 by staking the entry deposit."
    >
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Panel heading="Tontine Configuration">
            <div className="flex flex-col gap-4 text-xs font-mono">
              {errorMsg && (
                <div className="p-3 bg-[var(--danger)]/15 border border-[var(--danger)] text-[var(--danger)] text-xs font-sans">
                  {errorMsg}
                </div>
              )}

              {/* Game Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[var(--text-muted)] font-heading uppercase text-[11px] font-bold">
                  Syndicate Name (max 48 bytes)
                </label>
                <input
                  type="text"
                  required
                  maxLength={LIMITS.MAX_NAME_BYTES}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Iron Will Cohort"
                  className="p-2 border border-[var(--border-default)] bg-[var(--bg-overlay)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Stake Amount */}
              <div className="flex flex-col gap-1">
                <label className="text-[var(--text-muted)] font-heading uppercase text-[11px] font-bold">
                  Entry Stake (BOT per player)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  max="10000"
                  required
                  value={stakeEth}
                  onChange={(e) => setStakeEth(e.target.value)}
                  className="p-2 border border-[var(--border-default)] bg-[var(--bg-overlay)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  Range: 0.01 - 10,000 BOT. You deposit this amount immediately to claim Seat 1.
                </span>
              </div>

              {/* Lead Time to Start */}
              <div className="flex flex-col gap-1">
                <label className="text-[var(--text-muted)] font-heading uppercase text-[11px] font-bold">
                  Recruitment Lead Time (hours until start)
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  max="720"
                  required
                  value={leadHours}
                  onChange={(e) => setLeadHours(e.target.value)}
                  className="p-2 border border-[var(--border-default)] bg-[var(--bg-overlay)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  Minimum 1 hour, maximum 30 days (720 hrs). Game becomes Running after this window. A lead under 1.5 hours is raised to 1.5 hours so the transaction can't be rejected while you confirm it.
                </span>
              </div>

              {/* Period Length */}
              <div className="flex flex-col gap-1">
                <label className="text-[var(--text-muted)] font-heading uppercase text-[11px] font-bold">
                  Period Length (hours per roll call)
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  max="168"
                  required
                  value={periodHours}
                  onChange={(e) => setPeriodHours(e.target.value)}
                  className="p-2 border border-[var(--border-default)] bg-[var(--bg-overlay)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  Between 1 hour and 7 days (168 hrs). Every player must check in once during each period.
                </span>
              </div>

              {/* Number of Periods */}
              <div className="flex flex-col gap-1">
                <label className="text-[var(--text-muted)] font-heading uppercase text-[11px] font-bold">
                  Total Periods (cycles)
                </label>
                <input
                  type="number"
                  step="1"
                  min="3"
                  max="60"
                  required
                  value={periodsCount}
                  onChange={(e) => setPeriodsCount(e.target.value)}
                  className="p-2 border border-[var(--border-default)] bg-[var(--bg-overlay)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
                />
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  Between 3 and 60 periods.
                </span>
              </div>
            </div>
          </Panel>

          <Button
            type="submit"
            sizing="prominent"
            disabled={isSubmitting || !name}
            inFlight={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Founding Tontine..." : `Lock ${stakeEth} BOT & Open Tontine`}
          </Button>
        </form>
      </div>
    </PageShell>
  );
}
