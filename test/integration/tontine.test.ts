import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TONTINE_ABI } from "../../lib/botchain/abi";

const ANVIL_PORT = 8668;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;

const localChain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
});

const deployerAccount = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const playerAAccount = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const playerBAccount = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

describe("Tontine integration tests against local Anvil", () => {
  let anvilProcess: ChildProcess;
  let contractAddress: `0x${string}`;

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC_URL),
  });

  const deployerWallet = createWalletClient({
    account: deployerAccount,
    chain: localChain,
    transport: http(RPC_URL),
  });

  const playerAWallet = createWalletClient({
    account: playerAAccount,
    chain: localChain,
    transport: http(RPC_URL),
  });

  const playerBWallet = createWalletClient({
    account: playerBAccount,
    chain: localChain,
    transport: http(RPC_URL),
  });

  beforeAll(async () => {
    anvilProcess = spawn("anvil", ["-p", String(ANVIL_PORT), "--silent"]);
    // Give Anvil time to boot
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Deploy contract using forge script
    const deployOutput = await new Promise<string>((resolve, reject) => {
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
    if (!match) {
      throw new Error(`Failed to find deployed Tontine address in output:\n${deployOutput}`);
    }
    contractAddress = match[1] as `0x${string}`;
  }, 30000);

  afterAll(() => {
    if (anvilProcess) {
      anvilProcess.kill();
    }
  });

  it("handles the complete lifecycle: open -> join -> checkIn -> knockOut -> finish -> withdraw", async () => {
    const stake = parseEther("1");
    const periodSecs = 3600; // 1 hr
    const periods = 3;

    // Get current anvil time
    const block = await publicClient.getBlock();
    const startsAt = block.timestamp + 3700n; // > 1 hour lead

    // 1. Creator opens game
    const openHash = await deployerWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "open",
      args: ["Integration Tontine", stake, startsAt, periodSecs, periods],
      value: stake,
    });
    await publicClient.waitForTransactionReceipt({ hash: openHash });

    // 2. Player A and Player B join
    const joinAHash = await playerAWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "join",
      args: [1n],
      value: stake,
    });
    await publicClient.waitForTransactionReceipt({ hash: joinAHash });

    const joinBHash = await playerBWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "join",
      args: [1n],
      value: stake,
    });
    await publicClient.waitForTransactionReceipt({ hash: joinBHash });

    const gData = await publicClient.readContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "gameOf",
      args: [1n],
    });
    expect(gData.players).toBe(3);
    expect(gData.alive).toBe(3);

    // 3. Fast-forward to start of period 0 (warp to startsAt + 10)
    await (publicClient as any).request({
      method: "evm_setNextBlockTimestamp",
      params: [Number(startsAt + 10n)],
    });
    await (publicClient as any).request({
      method: "evm_mine",
      params: [],
    });

    // Deployer and Player A check in for period 0. Player B misses!
    const cDeployerP0 = await deployerWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "checkIn",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: cDeployerP0 });

    const cPlayerAP0 = await playerAWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "checkIn",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: cPlayerAP0 });

    // 4. Fast-forward to period 1 (period 0 has ended)
    await (publicClient as any).request({
      method: "evm_setNextBlockTimestamp",
      params: [Number(startsAt + 3600n + 10n)],
    });
    await (publicClient as any).request({
      method: "evm_mine",
      params: [],
    });

    // Player B is knockable because they missed period 0
    const bKnockable = await publicClient.readContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "knockable",
      args: [1n, playerBAccount.address],
    });
    expect(bKnockable).toBe(true);

    // Deployer knocks out Player B
    const knockHash = await deployerWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "knockOut",
      args: [1n, playerBAccount.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: knockHash });

    const gAfterKnock = await publicClient.readContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "gameOf",
      args: [1n],
    });
    expect(gAfterKnock.alive).toBe(2);

    // Deployer and Player A check in for period 1
    const cDeployerP1 = await deployerWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "checkIn",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: cDeployerP1 });

    const cPlayerAP1 = await playerAWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "checkIn",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: cPlayerAP1 });

    // 5. Fast-forward to period 2
    await (publicClient as any).request({
      method: "evm_setNextBlockTimestamp",
      params: [Number(startsAt + 2n * 3600n + 10n)],
    });
    await (publicClient as any).request({
      method: "evm_mine",
      params: [],
    });

    // Deployer and Player A check in for period 2
    const cDeployerP2 = await deployerWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "checkIn",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: cDeployerP2 });

    const cPlayerAP2 = await playerAWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "checkIn",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: cPlayerAP2 });

    // 6. Fast-forward past game end (endsAt = startsAt + 3 * 3600)
    await (publicClient as any).request({
      method: "evm_setNextBlockTimestamp",
      params: [Number(startsAt + 3n * 3600n + 20n)],
    });
    await (publicClient as any).request({
      method: "evm_mine",
      params: [],
    });

    // 7. Finish game
    const finishHash = await deployerWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "finish",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash: finishHash });

    // Pot is 3 ether. Survivors are Deployer and Player A (1.5 ether each)
    const pendDeployer = await publicClient.readContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "pending",
      args: [deployerAccount.address],
    });
    const pendA = await publicClient.readContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "pending",
      args: [playerAAccount.address],
    });
    const pendB = await publicClient.readContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "pending",
      args: [playerBAccount.address],
    });

    expect(formatEther(pendDeployer)).toBe("1.5");
    expect(formatEther(pendA)).toBe("1.5");
    expect(formatEther(pendB)).toBe("0");

    // 8. Deployer withdraws funds
    const wHash = await deployerWallet.writeContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "withdraw",
      args: [],
    });
    const wReceipt = await publicClient.waitForTransactionReceipt({ hash: wHash });
    expect(wReceipt.status).toBe("success");

    const pendAfter = await publicClient.readContract({
      address: contractAddress,
      abi: TONTINE_ABI,
      functionName: "pending",
      args: [deployerAccount.address],
    });
    expect(pendAfter).toBe(0n);
  }, 45000);
});
