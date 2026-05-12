import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  verifyAttestation,
  verifyDashboardUrl,
  type Step,
  type VerificationOutcome,
} from "../lib/verify";

/**
 * The Verification Ceremony.
 *
 * Three independent anchors are checked entirely in the browser:
 *   1. The TEE wallet signature over the canonical attestation JSON.
 *   2. The image-digest binding read from AppController on Sepolia.
 *   3. The EigenAI operator receipt (when the gateway publishes one).
 *
 * Nothing here trusts the B³ API — every claim is reproduced from the data.
 */
export default function VerifyPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const [id, setId] = useState<string>(routeId || "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);
  const [agentAddress, setAgentAddress] = useState<string>("");
  const [appDigest, setAppDigest] = useState<string>("");
  const [appId, setAppId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!id) return;
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const [v, h] = await Promise.all([api.verifyData(id), api.health()]);
      setAgentAddress(h.agent_address);
      setAppDigest(h.app_digest);
      setAppId(h.app_id || "");
      const result = await verifyAttestation(v, {
        agentAddress: h.agent_address,
        appDigest: h.app_digest,
        appId: h.app_id || null,
        appRegistryChainId: h.app_registry_chain_id || 11155111,
      });
      setOutcome(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const allHardChecksPass =
    outcome && outcome.steps.every((s) => s.state !== "fail");

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Verification ceremony</h2>
      <p className="text-b3-bone/70 max-w-2xl">
        Paste an attestation ID. The page recovers the signer entirely in your
        browser and cross-references the result against the EigenCloud
        AppController on-chain — no trust in the B³ API.
      </p>

      <div className="tile flex gap-3">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="attestation_id"
          className="flex-1 bg-b3-ink border border-b3-fog rounded p-2 font-mono text-sm"
        />
        <button
          onClick={run}
          disabled={!id || busy}
          className="px-6 py-2 rounded bg-b3-mint text-b3-ink font-bold disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Verify"}
        </button>
      </div>

      {error && <p className="text-b3-alarm">{error}</p>}

      {outcome && (
        <div className="space-y-4">
          <div
            className={`tile text-center py-10 ${
              allHardChecksPass ? "border-b3-mint" : "border-b3-alarm"
            }`}
          >
            <div
              className={`text-7xl mb-3 ${
                allHardChecksPass
                  ? "text-b3-mint glow-mint"
                  : "text-b3-alarm glow-alarm"
              }`}
            >
              {allHardChecksPass ? "✓" : "✗"}
            </div>
            <p className="text-xl">
              {allHardChecksPass ? "Verified" : "Verification failed"}
            </p>
            <p className="text-xs text-b3-bone/50 mt-2">
              Signer: <code>{outcome.agentRecoveredAddress}</code>
              <br />
              Expected: <code>{outcome.expectedSigner}</code>
            </p>
          </div>

          <ol className="tile space-y-2 text-sm">
            {outcome.steps.map((s, i) => (
              <StepRow key={i} step={s} />
            ))}
          </ol>

          {outcome.eigenaiSignaturePresent && (
            <details className="tile">
              <summary className="cursor-pointer text-sm">
                EigenAI replay material
              </summary>
              <pre className="mt-3 text-xs whitespace-pre-wrap break-all">
                {outcome.eigenaiMessage.slice(0, 2000)}
                {outcome.eigenaiMessage.length > 2000 && "…"}
              </pre>
              <p className="text-xs text-b3-bone/50 mt-2">
                Pass this string + the EigenAI signature to{" "}
                <code>ethers.verifyMessage</code>; the recovered address must
                match the EigenAI operator key in the KeyRegistrar contract at{" "}
                <code>{outcome.eigenaiKeyRegistrar}</code> on chain{" "}
                {outcome.eigenaiKeyRegistrarChainId}.
              </p>
            </details>
          )}

          <p className="text-xs text-b3-bone/40 leading-relaxed">
            App digest <code>{appDigest}</code> · agent{" "}
            <code>{agentAddress}</code>
            {appId && (
              <>
                {" "}· app id <code>{appId}</code> ·{" "}
                <a
                  href={verifyDashboardUrl(
                    appId as `0x${string}`,
                    outcome.eigenaiKeyRegistrarChainId,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="text-b3-mint underline"
                >
                  open in verify dashboard
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  const glyph =
    step.state === "pass"
      ? "✓"
      : step.state === "fail"
        ? "✗"
        : step.state === "pending"
          ? "…"
          : "◯";
  const color =
    step.state === "pass"
      ? "text-b3-mint"
      : step.state === "fail"
        ? "text-b3-alarm"
        : "text-b3-bone/60";
  return (
    <li className="flex items-start gap-3">
      <span className={color}>{glyph}</span>
      <div>
        <div>{step.label}</div>
        {step.detail && (
          <div className="text-xs text-b3-bone/50 mt-0.5">{step.detail}</div>
        )}
        {step.link && (
          <a
            href={step.link.href}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-b3-mint underline mt-0.5 inline-block"
          >
            {step.link.text}
          </a>
        )}
      </div>
    </li>
  );
}
