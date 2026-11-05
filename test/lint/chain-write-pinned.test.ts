import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every transaction must be pinned to the network this build runs on.
 *
 * Without a chainId, wagmi sends on whatever network the wallet is on. BOT Chain has two networks and a
 * contract address is the same text on both, so a wallet left on the other one sends a real, gas-costing
 * transaction to an empty address (this happened on the Vouch testnet build, 2026-10-28). lib/useChainWrite.ts
 * wraps wagmi's useWriteContract so every write carries chainId; nothing may import the raw hook.
 */
const ROOTS = ["app", "components", "lib"];
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "node_modules" || n === "__tests__" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

describe("writes are pinned to this build's chain", () => {
  it("no file imports useWriteContract or useSendTransaction from wagmi", () => {
    const bad: string[] = [];
    for (const root of ROOTS)
      for (const f of walk(root)) {
        if (f.endsWith("useChainWrite.ts")) continue;
        const src = readFileSync(f, "utf8");
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']wagmi["']/g))
          if (/\b(useWriteContract|useSendTransaction)\b/.test(m[1])) bad.push(relative(".", f));
      }
    expect(bad).toEqual([]);
  });

  it("useChainWrite passes the active chain id on both write functions", () => {
    const src = readFileSync("lib/useChainWrite.ts", "utf8");
    expect(src.match(/chainId: activeBotChain\.id/g)?.length).toBe(2);
  });
});
