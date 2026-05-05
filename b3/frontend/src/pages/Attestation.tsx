import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Attestation } from "../lib/api";

export default function AttestationView() {
  const { id = "" } = useParams<{ id: string }>();
  const [att, setAtt] = useState<Attestation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.attestation(id).then(setAtt).catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p className="text-b3-alarm">{error}</p>;
  if (!att) return <p className="text-b3-bone/60">Loading…</p>;

  const { data } = att;
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-3xl font-bold">Attestation</h2>
        <Link to={`/verify/${id}`} className="text-b3-mint hover:underline">Run verification ceremony →</Link>
      </header>

      <article className="tile grid grid-cols-2 gap-4 text-sm">
        <Stat label="Severity"      value={<strong className="text-b3-mint glow-mint">{data.severity}</strong>} />
        <Stat label="CVSS"          value={data.cvss_score} />
        <Stat label="Funds at risk" value={`$${Number(data.funds_at_risk_usd).toLocaleString()}`} />
        <Stat label="Verified at block" value={data.verification_block} />
        <Stat label="Target"        value={<code>{data.target_contract}</code>} />
        <Stat label="Chain"         value={data.chain_id} />
        <Stat label="EigenAI model" value={data.eigenai_model} />
        <Stat label="App digest"    value={<code>{data.app_digest}</code>} />
        <Stat label="Issued"        value={data.timestamp} />
        <Stat label="Attestation ID" value={<code>{data.attestation_id}</code>} />
      </article>

      <details className="tile">
        <summary className="cursor-pointer font-bold">Signatures</summary>
        <pre className="mt-3 text-xs overflow-x-auto">
          agent_signature   = {att.agent_signature}{"\n"}
          eigenai_signature = {att.eigenai_signature || "(none)"}
        </pre>
      </details>

      <p className="text-xs text-b3-bone/40">
        The exploit details are sealed inside the TEE and only released after a USDC
        deposit covering the bounty for severity <strong>{data.severity}</strong>.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-b3-bone/50 text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
