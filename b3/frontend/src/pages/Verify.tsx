import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { verifyAttestation, type VerificationOutcome } from "../lib/verify";

/**
 * The Verification Ceremony — the demo's most important page.
 *
 * 1. Fetches /verify/{id} from the agent.
 * 2. Reproduces the canonical message in the browser.
 * 3. Recovers the signer with ethers.verifyMessage.
 * 4. Compares against /health (and the on-chain app registry value).
 * 5. Recovers the EigenAI signer the same way.
 *
 * Everything happens client-side — the user is verifying, not trusting our API.
 */

export default function VerifyPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const [id, setId] = useState<string>(routeId || "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);
  const [agentAddress, setAgentAddress] = useState<string>("");
  const [appDigest, setAppDigest] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!id) return;
    setBusy(true); setError(null); setOutcome(null);
    try {
      const [v, h] = await Promise.all([api.verifyData(id), api.health()]);
      setAgentAddress(h.agent_address);
      setAppDigest(h.app_digest);
      const result = await verifyAttestation(v, {
        agentAddress: h.agent_address,
        appDigest: h.app_digest,
      });
      setOutcome(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const allGreen = outcome && outcome.steps.every((s) => s.ok);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Verification ceremony</h2>
      <p className="text-b3-bone/70 max-w-2xl">
        Paste an attestation ID. The page recovers the signer entirely in your browser
        and compares against the on-chain app registry — you don't have to trust B³'s API.
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
              allGreen ? "border-b3-mint" : "border-b3-alarm"
            }`}
          >
            <div className={`text-7xl mb-3 ${allGreen ? "text-b3-mint glow-mint" : "text-b3-alarm glow-alarm"}`}>
              {allGreen ? "✓" : "✗"}
            </div>
            <p className="text-xl">
              {allGreen ? "Verified" : "Verification failed"}
            </p>
            <p className="text-xs text-b3-bone/50 mt-2">
              Signer: <code>{outcome.agentRecoveredAddress}</code>
              <br />
              Expected: <code>{outcome.expectedSigner}</code>
            </p>
          </div>

          <ol className="tile space-y-2 text-sm">
            {outcome.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={s.ok ? "text-b3-mint" : "text-b3-alarm"}>{s.ok ? "✓" : "✗"}</span>
                <div>
                  <div>{s.label}</div>
                  {s.detail && <div className="text-xs text-b3-bone/50 mt-0.5">{s.detail}</div>}
                </div>
              </li>
            ))}
          </ol>

          <details className="tile">
            <summary className="cursor-pointer text-sm">EigenAI replay material</summary>
            <pre className="mt-3 text-xs whitespace-pre-wrap break-all">
              {outcome.eigenaiMessage.slice(0, 2000)}
              {outcome.eigenaiMessage.length > 2000 && "…"}
            </pre>
            <p className="text-xs text-b3-bone/50 mt-2">
              Pass this string + the EigenAI signature to <code>ethers.verifyMessage</code>;
              the recovered address must match the EigenAI Operator key in the KeyRegistrar
              contract on chain {/* eslint-disable-next-line */}
              {/* keyregistrar chain id varies — refer to docs */}.
            </p>
          </details>

          <p className="text-xs text-b3-bone/40">
            App digest <code>{appDigest}</code> · agent <code>{agentAddress}</code>
          </p>
        </div>
      )}
    </div>
  );
}
