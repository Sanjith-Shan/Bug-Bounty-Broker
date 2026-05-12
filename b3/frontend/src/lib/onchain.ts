// On-chain anchors for the verification ceremony.
//
// Reads the EigenLayer / EigenCloud core contracts to confirm that the
// signing key + image digest the agent claims really are the ones registered
// on-chain for this app. Everything here runs in the browser against a
// public RPC — no trust in the B³ API.

import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  decodeEventLog,
  hexToBytes,
} from "viem";
import { mainnet, sepolia } from "viem/chains";

// Addresses from b3/docs/eigencloud-platform.md §4 — keep these in sync.
export const APP_CONTROLLER: Record<number, Address> = {
  1: "0xc38d35Fc995e75342A21CBd6D770305b142Fbe67",
  11155111: "0x0dd810a6ffba6a9820a10d97b659f07d8d23d4E2",
};

export const KEY_REGISTRAR: Record<number, Address> = {
  1: "0x54f4bC6bDEbe479173a2bbDc31dD7178408A57A4",
  11155111: "0xA4dB30D08d8bbcA00D40600bee9F029984dB162a",
};

// Verifiability dashboard the EigenCloud team runs. Sepolia has its own subdomain.
export function verifyDashboardUrl(appAddress: Address, chainId = 11155111): string {
  const host = chainId === 1 ? "verify.eigencloud.xyz" : "verify-sepolia.eigencloud.xyz";
  return `https://${host}/app/${appAddress}`;
}

// Default RPC endpoints. Override with VITE_SEPOLIA_RPC_URL etc. at build time.
const RPC: Record<number, string> = {
  1: import.meta.env.VITE_MAINNET_RPC_URL || "https://ethereum.publicnode.com",
  11155111:
    import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
};

function client(chainId: number) {
  const url = RPC[chainId];
  if (!url) throw new Error(`no public RPC configured for chain ${chainId}`);
  return createPublicClient({
    chain: chainId === 1 ? mainnet : sepolia,
    transport: http(url),
  });
}

// Minimal slice of the AppController ABI — just the AppUpgraded event so we
// can scan logs and decode the most recent release's digest + public env.
const APP_CONTROLLER_ABI = [
  {
    type: "event",
    name: "AppUpgraded",
    inputs: [
      { name: "app", type: "address", indexed: true },
      { name: "rmsReleaseId", type: "uint256", indexed: false },
      {
        name: "release",
        type: "tuple",
        indexed: false,
        components: [
          {
            name: "rmsRelease",
            type: "tuple",
            components: [
              {
                name: "artifacts",
                type: "tuple[]",
                components: [
                  { name: "digest", type: "bytes32" },
                  { name: "registry", type: "string" },
                ],
              },
              { name: "upgradeByTime", type: "uint32" },
            ],
          },
          { name: "publicEnv", type: "bytes" },
          { name: "encryptedEnv", type: "bytes" },
          {
            name: "containerPolicy",
            type: "tuple",
            components: [
              { name: "args", type: "string[]" },
              { name: "cmdOverride", type: "string[]" },
              {
                name: "env",
                type: "tuple[]",
                components: [
                  { name: "name", type: "string" },
                  { name: "value", type: "string" },
                ],
              },
              {
                name: "envOverride",
                type: "tuple[]",
                components: [
                  { name: "name", type: "string" },
                  { name: "value", type: "string" },
                ],
              },
              { name: "restartPolicy", type: "string" },
            ],
          },
        ],
      },
    ],
  },
] as const;

// `AppUpgraded(IApp indexed app, uint256 rmsReleaseId, Release release)`
const APP_UPGRADED_TOPIC =
  "0x" as Hex; // computed lazily below
function appUpgradedTopic(): Hex {
  // keccak256("AppUpgraded(address,uint256,((( (bytes32,string)[],uint32),bytes,bytes,(string[],string[],(string,string)[],(string,string)[],string))))")
  // We don't precompute — let viem do it via getLogs(event:…) signature.
  // Returning empty here is fine because getLogs uses the event ABI, not the topic.
  return APP_UPGRADED_TOPIC;
}

export type OnchainAppState = {
  ok: true;
  chainId: number;
  appAddress: Address;
  appController: Address;
  latestDigest: string; // sha256:<hex>
  latestBlock: bigint;
  registryURL: string;
  publicEnvCleartext: string; // utf-8 decoded
  verifyDashboardURL: string;
};

export type OnchainAppError = {
  ok: false;
  reason: string;
  appAddress?: Address;
  chainId: number;
  verifyDashboardURL?: string;
};

export async function readLatestAppRelease(
  appAddress: Address,
  chainId: number,
): Promise<OnchainAppState | OnchainAppError> {
  const ac = APP_CONTROLLER[chainId];
  if (!ac) {
    return { ok: false, reason: `AppController not deployed on chain ${chainId}`, chainId };
  }
  // void unused topic constant — viem uses the event ABI directly
  void appUpgradedTopic();
  const c = client(chainId);
  try {
    // Free Sepolia RPCs cap eth_getLogs at 50k blocks (~7 days at 12s/block).
    // We scan in 50k-block windows backwards from head until we find the
    // most recent AppUpgraded event for this app, or run out of recent
    // history. Mainnet RPCs usually allow larger windows; we use 2M there.
    const WINDOW = chainId === 1 ? 2_000_000n : 49_000n;
    const MAX_WINDOWS = chainId === 1 ? 1 : 20; // ~14 days on sepolia
    const latest = await c.getBlockNumber();
    let logs: Awaited<ReturnType<typeof c.getLogs>> = [];
    for (let i = 0; i < MAX_WINDOWS; i++) {
      const toBlock = latest - BigInt(i) * WINDOW;
      const fromBlock = toBlock > WINDOW ? toBlock - WINDOW : 0n;
      const found = await c.getLogs({
        address: ac,
        event: APP_CONTROLLER_ABI[0],
        args: { app: appAddress },
        fromBlock,
        toBlock,
      });
      if (found.length > 0) {
        logs = found;
        break;
      }
      if (fromBlock === 0n) break;
    }
    if (logs.length === 0) {
      return {
        ok: false,
        reason: "No AppUpgraded events for this app — has it been deployed yet?",
        appAddress,
        chainId,
        verifyDashboardURL: verifyDashboardUrl(appAddress, chainId),
      };
    }
    const last = logs[logs.length - 1];
    const decoded = decodeEventLog({
      abi: APP_CONTROLLER_ABI,
      data: last.data,
      topics: last.topics,
    });
    const release = (decoded.args as { release: unknown }).release as {
      rmsRelease: { artifacts: { digest: Hex; registry: string }[] };
      publicEnv: Hex;
    };
    const artifact = release.rmsRelease.artifacts[0];
    if (!artifact) {
      return {
        ok: false,
        reason: "Release has no artifacts",
        appAddress,
        chainId,
        verifyDashboardURL: verifyDashboardUrl(appAddress, chainId),
      };
    }
    const digestHex = artifact.digest.slice(2);
    const publicEnv = new TextDecoder().decode(hexToBytes(release.publicEnv));
    return {
      ok: true,
      chainId,
      appAddress,
      appController: ac,
      latestDigest: `sha256:${digestHex}`,
      latestBlock: last.blockNumber ?? 0n,
      registryURL: artifact.registry,
      publicEnvCleartext: publicEnv,
      verifyDashboardURL: verifyDashboardUrl(appAddress, chainId),
    };
  } catch (e) {
    return {
      ok: false,
      reason: `RPC error: ${e instanceof Error ? e.message : String(e)}`,
      appAddress,
      chainId,
      verifyDashboardURL: verifyDashboardUrl(appAddress, chainId),
    };
  }
}
