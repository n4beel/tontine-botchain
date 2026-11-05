"use client";

import { useCallback } from "react";
import {
  useWriteContract as useWagmiWriteContract,
  useWaitForTransactionReceipt as useWagmiWaitForTransactionReceipt,
} from "wagmi";
import { activeBotChain } from "@/lib/botchain/chain";

/**
 * `useWriteContract` from wagmi, with every write pinned to the network THIS BUILD runs on.
 *
 * Without a `chainId`, wagmi sends the transaction on whatever network the wallet happens to be on.
 * BOT Chain has two networks (677 and 968) and a contract's address is the same text on both, so a
 * wallet left on the wrong one sends a real transaction to an address with no contract behind it:
 * it succeeds, does nothing, and costs gas. With the chain pinned, wagmi refuses before the wallet
 * even opens (ConnectorChainMismatchError) and `describeError` turns that into a sentence.
 *
 * Use this instead of importing `useWriteContract` from "wagmi" (scripts/check-ui-contract.py fails
 * a project that does).
 */
export function useWriteContract() {
  const w = useWagmiWriteContract();
  const { writeContract: rawWrite, writeContractAsync: rawWriteAsync } = w;
  const writeContract = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((vars: any, opts?: any) => rawWrite({ ...vars, chainId: activeBotChain.id }, opts)) as typeof rawWrite,
    [rawWrite],
  );
  const writeContractAsync = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((vars: any, opts?: any) => rawWriteAsync({ ...vars, chainId: activeBotChain.id }, opts)) as typeof rawWriteAsync,
    [rawWriteAsync],
  );
  return { ...w, writeContract, writeContractAsync };
}

/**
 * For projects that send with viem's `walletClient.writeContract(...)` instead of wagmi's hook: call this first.
 * It refuses, with the same error wagmi raises, when the wallet is not on the network this build runs on.
 */
export async function assertActiveChain(client: { getChainId: () => Promise<number> }) {
  const id = await client.getChainId();
  if (id !== activeBotChain.id) {
    const e = new Error(
      `The current chain of the wallet (id: ${id}) does not match the target chain for the transaction (id: ${activeBotChain.id}).`,
    );
    e.name = "ConnectorChainMismatchError";
    throw e;
  }
}

/** A transaction that was mined and reverted. Its receipt exists, so nothing throws unless we make it. */
export class TxRevertedError extends Error {
  constructor() {
    super("The transaction was mined but reverted, so nothing changed. Check the details and try again.");
    this.name = "TxRevertedError";
  }
}

/**
 * wagmi's `useWaitForTransactionReceipt` with one change: a REVERTED receipt is an error, not a success.
 *
 * The stock hook reports `isSuccess` for any mined transaction, including one that reverted, so a screen that waits
 * on `isSuccess` shows "done" for a transaction that did nothing (Hamper, 2026-10-30: a host funding their own list
 * saw a success message for a failed transaction). Import this instead of the one from "wagmi".
 */
// Cast to the stock hook's type so its generics (and `data.logs` etc.) are preserved.
export const useWaitForTransactionReceipt = ((
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: any,
) => {
  const r = useWagmiWaitForTransactionReceipt(parameters);
  const data = r.data as { status?: string } | undefined;
  if (data && data.status !== "success") {
    return { ...r, isSuccess: false, isError: true, status: "error", error: new TxRevertedError() };
  }
  return r;
}) as typeof useWagmiWaitForTransactionReceipt;

/** `publicClient.waitForTransactionReceipt`, but a reverted receipt throws TxRevertedError. */
export async function waitSuccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: { waitForTransactionReceipt: (a: { hash: `0x${string}` }) => Promise<any> },
  hash: `0x${string}`,
) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new TxRevertedError();
  return receipt;
}

/**
 * Send with viem's `walletClient.writeContract`, but first (1) refuse on the wrong network and (2) SIMULATE the call, so a
 * call that would revert fails here, with its decoded error name, before the wallet ever opens. Returns the hash.
 */
export async function checkedWrite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any,
): Promise<`0x${string}`> {
  await assertActiveChain(walletClient);
  await publicClient.simulateContract({ ...request, account: walletClient.account });
  return walletClient.writeContract(request);
}
