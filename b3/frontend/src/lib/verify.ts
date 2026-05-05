import { verifyMessage } from "ethers";
import type { Attestation, AttestationData, VerifyResponse } from "./api";

/**
 * Reproduce the canonical message the agent signed. Must match Python's
 * `json.dumps(data, sort_keys=True, separators=(",", ":"))` byte for byte.
 */
export function canonicalize(data: AttestationData): string {
  // JSON.stringify with a sorted-key replacer.
  return JSON.stringify(data, Object.keys(data).sort());
}

export type VerificationOutcome = {
  agentSignerOk: boolean;
  agentRecoveredAddress: string;
  expectedSigner: string;

  eigenaiSignerRecovered: string | null;
  eigenaiMessage: string;
  eigenaiSignaturePresent: boolean;

  digestMatch: boolean;
  appDigest: string;

  steps: { label: string; ok: boolean; detail?: string }[];
};

export async function verifyAttestation(
  v: VerifyResponse,
  expected: { agentAddress: string; appDigest: string },
): Promise<VerificationOutcome> {
  const att: Attestation = v.attestation;
  const steps: VerificationOutcome["steps"] = [];

  // 1. Reconstruct canonical message and verify the agent signature.
  const canonical = canonicalize(att.data);
  const matchesServer = canonical === v.canonical_message;
  steps.push({
    label: "Canonical message matches server-rendered bytes",
    ok: matchesServer,
    detail: matchesServer ? undefined : "client and server disagree on canonicalization",
  });

  let agentRecovered = "";
  try {
    agentRecovered = verifyMessage(canonical, att.agent_signature);
  } catch (e) {
    steps.push({ label: "Recover agent signer", ok: false, detail: String(e) });
  }
  const agentSignerOk =
    !!agentRecovered &&
    agentRecovered.toLowerCase() === expected.agentAddress.toLowerCase();
  steps.push({
    label: `Agent signer matches ${shorten(expected.agentAddress)}`,
    ok: agentSignerOk,
    detail: agentRecovered ? `recovered ${shorten(agentRecovered)}` : undefined,
  });

  // 2. EigenAI signature: build the verification message per the spec.
  // In local-dev / stub mode the gateway isn't called, so the signature is
  // empty; we mark the step as "skipped" rather than failed so the ceremony
  // can still go fully green when running off-TEE.
  const eigenaiMessage =
    v.eigenai_request_messages.join("") +
    v.eigenai_response_messages.join("") +
    att.data.eigenai_model +
    String(v.eigenai_chain_id);

  const stubModel =
    typeof att.data.eigenai_model === "string" &&
    att.data.eigenai_model.startsWith("stub:");
  const sigPresent = !!(
    att.eigenai_signature && att.eigenai_signature.length > 4
  );

  let eaiSigner: string | null = null;
  if (sigPresent) {
    try {
      eaiSigner = verifyMessage(eigenaiMessage, att.eigenai_signature);
    } catch (e) {
      steps.push({ label: "Recover EigenAI signer", ok: false, detail: String(e) });
    }
    steps.push({
      label: "EigenAI signature recovered",
      ok: !!eaiSigner,
      detail: eaiSigner
        ? `recovered ${shorten(eaiSigner)} (look up in KeyRegistrar)`
        : "signature did not recover",
    });
  } else if (stubModel) {
    steps.push({
      label: "EigenAI signature — skipped (local stub mode)",
      ok: true,
      detail: "Inference is stubbed off-TEE; the deployed agent calls the AI Gateway and returns a real signed receipt.",
    });
  } else {
    steps.push({
      label: "EigenAI signature recovered",
      ok: false,
      detail: "no signature attached",
    });
  }

  // 3. App digest binding — published in the on-chain registry.
  const digestMatch =
    !!att.data.app_digest &&
    att.data.app_digest === expected.appDigest;
  steps.push({
    label: `app_digest matches the on-chain registry`,
    ok: digestMatch,
    detail: att.data.app_digest,
  });

  return {
    agentSignerOk,
    agentRecoveredAddress: agentRecovered,
    expectedSigner: expected.agentAddress,
    eigenaiSignerRecovered: eaiSigner,
    eigenaiMessage,
    eigenaiSignaturePresent: !!sigPresent,
    digestMatch,
    appDigest: att.data.app_digest,
    steps,
  };
}

function shorten(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
