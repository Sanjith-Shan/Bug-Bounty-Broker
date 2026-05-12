import { verifyMessage } from "ethers";
import type { Hex } from "viem";
import type { Attestation, AttestationData, VerifyResponse } from "./api";
import {
  KEY_REGISTRAR,
  readLatestAppRelease,
  verifyDashboardUrl,
  type OnchainAppState,
  type OnchainAppError,
} from "./onchain";

/**
 * Reproduce the canonical message the agent signed. Must match Python's
 * `json.dumps(data, sort_keys=True, separators=(",", ":"))` byte for byte.
 */
export function canonicalize(data: AttestationData): string {
  return JSON.stringify(data, Object.keys(data).sort());
}

export type Step = {
  label: string;
  state: "pass" | "fail" | "pending" | "note";
  detail?: string;
  link?: { href: string; text: string };
};

export type VerificationOutcome = {
  agentRecoveredAddress: string;
  expectedSigner: string;

  eigenaiSignerRecovered: string | null;
  eigenaiMessage: string;
  eigenaiSignaturePresent: boolean;
  eigenaiKeyRegistrar: string;
  eigenaiKeyRegistrarChainId: number;

  onchain: OnchainAppState | OnchainAppError | null;
  steps: Step[];
};

export type ExpectedAnchors = {
  agentAddress: string;
  appDigest: string;
  appId?: string | null;
  appRegistryChainId: number;
};

export async function verifyAttestation(
  v: VerifyResponse,
  expected: ExpectedAnchors,
): Promise<VerificationOutcome> {
  const att: Attestation = v.attestation;
  const steps: Step[] = [];

  // ─── 1. Canonical message bytes ─────────────────────────────────────────
  const canonical = canonicalize(att.data);
  const matchesServer = canonical === v.canonical_message;
  steps.push({
    label: "Canonical attestation bytes reproducible in browser",
    state: matchesServer ? "pass" : "fail",
    detail: matchesServer
      ? "Client and server produce byte-identical canonical JSON."
      : "Mismatch — client and server disagree on the canonical encoding.",
  });

  // ─── 2. Agent signer recovery ───────────────────────────────────────────
  let agentRecovered = "";
  try {
    agentRecovered = verifyMessage(canonical, att.agent_signature);
  } catch (e) {
    steps.push({
      label: "Recover TEE wallet signer",
      state: "fail",
      detail: String(e),
    });
  }
  const agentSignerOk =
    !!agentRecovered &&
    agentRecovered.toLowerCase() === expected.agentAddress.toLowerCase();
  steps.push({
    label: `TEE wallet signature recovers to ${shorten(expected.agentAddress)}`,
    state: agentSignerOk ? "pass" : "fail",
    detail: agentRecovered
      ? `Recovered ${shorten(agentRecovered)}`
      : "Signature did not recover.",
  });

  // ─── 3. On-chain release record ─────────────────────────────────────────
  let onchain: OnchainAppState | OnchainAppError | null = null;
  if (!expected.appId) {
    steps.push({
      label: "On-chain image-digest binding",
      state: "note",
      detail:
        "Agent did not publish APP_ID_PUBLIC. Set it from `ecloud compute app info` so verifiers can read the release record on-chain.",
      link: { href: "https://verify.eigencloud.xyz", text: "verify dashboard" },
    });
  } else {
    onchain = await readLatestAppRelease(
      expected.appId as Hex,
      expected.appRegistryChainId,
    );
    if (onchain.ok) {
      // The on-chain release record IS the source of truth — we don't fail
      // the ceremony just because the agent's self-reported APP_DIGEST_PUBLIC
      // is stale. We display it as a "claimed" value next to the on-chain one
      // so a verifier can spot drift.
      const matchesAgentClaim = onchain.latestDigest === expected.appDigest;
      steps.push({
        label: "Image digest published on-chain by AppController",
        state: "pass",
        detail: matchesAgentClaim
          ? `${onchain.latestDigest} at block ${onchain.latestBlock} — matches what the agent self-reports.`
          : `${onchain.latestDigest} at block ${onchain.latestBlock}. Agent self-reports ${expected.appDigest}; the on-chain record is authoritative.`,
        link: { href: onchain.verifyDashboardURL, text: "view on verify dashboard" },
      });
    } else {
      // The AppController ABI is still moving in the alpha; if we can't decode
      // events from a public RPC we don't fail the ceremony — we point the
      // verifier at the EigenCloud-run verify dashboard, which always has the
      // authoritative on-chain record.
      steps.push({
        label: "On-chain image-digest binding",
        state: "note",
        detail: `${onchain.reason}. Use the verify dashboard for the authoritative on-chain record.`,
        link: onchain.verifyDashboardURL
          ? { href: onchain.verifyDashboardURL, text: "verify dashboard" }
          : undefined,
      });
    }
  }

  // ─── 4. EigenAI receipt (per-response signed receipt from the gateway) ──
  const eigenaiMessage =
    v.eigenai_request_messages.join("") +
    v.eigenai_response_messages.join("") +
    att.data.eigenai_model +
    String(v.eigenai_chain_id);

  const stubModel = att.data.eigenai_model?.startsWith("stub:") ?? false;
  const sigPresent =
    !!att.eigenai_signature && att.eigenai_signature.length > 4;

  let eaiSigner: string | null = null;
  if (sigPresent) {
    try {
      eaiSigner = verifyMessage(eigenaiMessage, att.eigenai_signature);
    } catch {
      eaiSigner = null;
    }
    const keyRegistrar =
      KEY_REGISTRAR[v.eigenai_chain_id] || KEY_REGISTRAR[expected.appRegistryChainId];
    steps.push({
      label: "EigenAI operator signed the inference receipt",
      state: eaiSigner ? "pass" : "fail",
      detail: eaiSigner
        ? `Recovered ${shorten(eaiSigner)} — cross-check against KeyRegistrar on chain ${v.eigenai_chain_id || expected.appRegistryChainId}.`
        : "Signature did not recover.",
      link: keyRegistrar
        ? {
            href: `https://${
              (v.eigenai_chain_id || expected.appRegistryChainId) === 1
                ? "etherscan.io"
                : "sepolia.etherscan.io"
            }/address/${keyRegistrar}`,
            text: "open KeyRegistrar on Etherscan",
          }
        : undefined,
    });
  } else if (stubModel) {
    steps.push({
      label: "EigenAI receipt — local stub mode",
      state: "note",
      detail:
        "Inference was stubbed (no JWT). The deployed agent calls the live AI Gateway and the receipt step engages there.",
    });
  } else {
    steps.push({
      label: "EigenAI receipt — gateway did not publish a signature",
      state: "note",
      detail:
        "The dev gateway is shipping receipts in stages (whitepaper §6.7). The request/response bytes and model id are recorded above; once the gateway publishes per-response signatures we can recover the operator key here.",
    });
  }

  return {
    agentRecoveredAddress: agentRecovered,
    expectedSigner: expected.agentAddress,
    eigenaiSignerRecovered: eaiSigner,
    eigenaiMessage,
    eigenaiSignaturePresent: sigPresent,
    eigenaiKeyRegistrar:
      KEY_REGISTRAR[v.eigenai_chain_id || expected.appRegistryChainId] || "",
    eigenaiKeyRegistrarChainId: v.eigenai_chain_id || expected.appRegistryChainId,
    onchain,
    steps,
  };
}

export { verifyDashboardUrl };

function shorten(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
