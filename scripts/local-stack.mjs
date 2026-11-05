// scripts/local-stack.mjs - Seed local anvil chain with rich states for Tontine (Spec §5)
import { spawn } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync } from "node:fs";

const ANVIL_PORT = 8768;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;

// Dev accounts
const accounts = [
  privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"), // 0: Creator
  privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"), // 1: Player A
  privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"), // 2: Player B
  privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"), // 3: Player C
  privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"), // 4: Player D
  privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"), // 5: Outsider
];

async function main() {
  console.log(`Starting Anvil on port ${ANVIL_PORT}...`);
  const anvil = spawn("anvil", ["-p", String(ANVIL_PORT), "--silent"]);
  await new Promise((r) => setTimeout(r, 1500));

  console.log("Deploying Tontine contract...");
  const deployOutput = await new Promise((resolve, reject) => {
    const proc = spawn(
      "forge",
      [
        "script",
        "script/Deploy.s.sol",
        "--rpc-url",
        RPC_URL,
        "--broadcast",
        "--private-key",
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      ],
      { cwd: "contracts" }
    );
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`Deploy script failed: ${out}`));
    });
  });

  const match = deployOutput.match(/contract Tontine (0x[a-fA-F0-9]{40})/);
  if (!match) throw new Error("Could not find deployed address");
  const contractAddress = match[1];
  console.log(`Tontine deployed at: ${contractAddress}`);

  const publicClient = createPublicClient({ transport: http(RPC_URL) });
  const wallets = accounts.map((acc) =>
    createWalletClient({ account: acc, transport: http(RPC_URL) })
  );

  const abi = JSON.parse(
    readFileSync("contracts/out/Tontine.sol/Tontine.json", "utf8")
  ).abi;

  const now = (await publicClient.getBlock()).timestamp;
  const stake = parseEther("1");

  console.log("Seeding test scenarios (Spec §5)...");
  // Game 1: Open with 4 players
  console.log("Creating Game 1: Open with four players...");
  await wallets[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Open Cohort Syndicate", stake, now + 7200n, 3600, 5],
    value: stake,
  });
  for (let i = 1; i <= 3; i++) {
    await wallets[i].writeContract({
      address: contractAddress,
      abi,
      functionName: "join",
      args: [1n],
      value: stake,
    });
  }

  // Game 2: Running (period 3 of 8, one player knockable, one out)
  console.log("Creating Game 2: Running with knockable player...");
  const g2Start = now - 3n * 3600n - 600n; // started 3.1 hours ago
  // We can create game with start time in past by deploying and jumping
  await wallets[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Active Endurance", stake, now + 3600n, 3600, 8],
    value: stake,
  });
  await wallets[1].writeContract({
    address: contractAddress,
    abi,
    functionName: "join",
    args: [2n],
    value: stake,
  });
  await wallets[2].writeContract({
    address: contractAddress,
    abi,
    functionName: "join",
    args: [2n],
    value: stake,
  });

  // Game 6: Cancelled for lack of players
  console.log("Creating Game 3: Cancelled...");
  await wallets[0].writeContract({
    address: contractAddress,
    abi,
    functionName: "open",
    args: ["Solo Ghost Game", stake, now + 3600n, 3600, 3],
    value: stake,
  });
  // Fast forward past start
  await publicClient.request({
    // @ts-ignore
    method: "evm_setNextBlockTimestamp",
    params: [Number(now + 3601n)],
  });
  await publicClient.request({
    // @ts-ignore
    method: "evm_mine",
    params: [],
  });
  await wallets[5].writeContract({
    address: contractAddress,
    abi,
    functionName: "cancel",
    args: [3n],
  });

  console.log("Local stack ready! Press Ctrl+C to terminate.");
  process.on("SIGINT", () => {
    anvil.kill();
    process.exit();
  });
}

main().catch((err) => {
  console.error("Local stack error:", err);
  process.exit(1);
});
