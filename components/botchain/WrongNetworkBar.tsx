"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { activeBotChain, isActiveChain } from "@/lib/botchain/chain";

/**
 * A bar across the top of every page, shown only while a connected wallet is on a network this build does not run on.
 *
 * Wallets that remember a network per site (MetaMask does) can sit on the wrong one while their main network selector says
 * otherwise, and then every write is refused with "Your wallet is on a different network". The fix has to be one tap on the page,
 * not a hunt through the wallet, so this bar carries the button.
 */
export default function WrongNetworkBar() {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  if (!isConnected || isActiveChain(chainId)) return null;

  return (
    <div
      role="alert"
      className="w-full px-4 py-2 text-[13px] flex flex-wrap items-center justify-center gap-3"
      style={{ background: "#FFF3CD", color: "#5C3D00", borderBottom: "1px solid #E0B341" }}
    >
      <span>
        This app runs on <strong>{activeBotChain.name}</strong>. Your wallet is connected to a different network for this site.
      </span>
      <button
        type="button"
        onClick={() => switchChain({ chainId: activeBotChain.id })}
        disabled={isPending}
        className="px-3 py-1 text-[12px] font-semibold cursor-pointer"
        style={{ background: "#5C3D00", color: "#FFF3CD", borderRadius: "2px", border: "none" }}
      >
        {isPending ? "Switching…" : `Switch to ${activeBotChain.name}`}
      </button>
      {error ? <span>Couldn&apos;t switch automatically: change the network in your wallet.</span> : null}
    </div>
  );
}
