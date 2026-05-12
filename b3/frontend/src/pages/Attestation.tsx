import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Attestation } from "../lib/api";

type DepositResult = {
  status: string;
  deposit_tx?: string;
  payout_tx?: string;
  payout_usd?: number;
  fee_usd?: number;
};

type Report = {
  attestation_id: string;
  poc_solidity: string;
  forge_output: string;
  funds_at_risk_usd: number;
  severity: string;
};

export default function AttestationView() {
  const { id = "" } = useParams<{ id: string }>();
  const [att, setAtt] = useState<Attestation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [depositBusy, setDepositBusy] = useState(false);
  const [deposit, setDeposit] = useState<DepositResult | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    api.attestation(id).then(setAtt).catch((e) => setError(String(e)));
  }, [id]);

  async function onDeposit() {
    setDepositBusy(true);
    try {
      const r = await api.confirmDeposit(id);
      setDeposit(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setDepositBusy(false);
    }
  }

  async function onFetchReport() {
    setReportBusy(true);
    try {
      const r = await api.report(id);
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setReportBusy(false);
    }
  }

  if (error) return <p className="text-b3-alarm">{error}</p>;
  if (!att) return <p className="text-b3-bone/60">Loading…</p>;

  const { data } = att;
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h2 className="text-3xl font-bold">Attestation</h2>
        <Link to={`/verify/${id}`} className="text-b3-mint hover:underline">
          Run verification ceremony →
        </Link>
      </header>

      <article className="tile grid grid-cols-2 gap-4 text-sm">
        <Stat
          label="Severity"
          value={<strong className="text-b3-mint glow-mint">{data.severity}</strong>}
        />
        <Stat label="CVSS" value={data.cvss_score} />
        <Stat
          label="Funds at risk"
          value={`$${Number(data.funds_at_risk_usd).toLocaleString()}`}
        />
        <Stat label="Verified at block" value={data.verification_block} />
        <Stat label="Target" value={<code>{data.target_contract}</code>} />
        <Stat label="Chain" value={data.chain_id} />
        <Stat label="EigenAI model" value={data.eigenai_model} />
        <Stat label="App digest" value={<code>{data.app_digest}</code>} />
        <Stat label="Issued" value={data.timestamp} />
        <Stat label="Attestation ID" value={<code>{data.attestation_id}</code>} />
      </article>

      <details className="tile">
        <summary className="cursor-pointer font-bold">Signatures</summary>
        <pre className="mt-3 text-xs overflow-x-auto">
          agent_signature   = {att.agent_signature}{"\n"}
          eigenai_signature = {att.eigenai_signature || "(none)"}
        </pre>
      </details>

      {/* Company side: deposit USDC → report unlocks → researcher gets paid */}
      <div className="tile space-y-3">
        <h3 className="font-bold">Company action — deposit & unlock</h3>
        {!deposit ? (
          <>
            <p className="text-sm text-b3-bone/70">
              The exploit details are sealed inside the TEE. Deposit USDC covering the{" "}
              <strong>{data.severity}</strong> bounty to unlock the full report. The
              researcher is paid automatically, minus the platform fee.
            </p>
            <button
              onClick={onDeposit}
              disabled={depositBusy}
              className="px-5 py-2 rounded bg-b3-mint text-b3-ink font-bold disabled:opacity-50"
            >
              {depositBusy ? "Confirming…" : "Confirm deposit"}
            </button>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              ✅ <strong className="text-b3-mint">Deposit confirmed.</strong> Researcher
              paid <strong>${deposit.payout_usd?.toLocaleString()}</strong> (fee $
              {deposit.fee_usd}).
            </p>
            <pre className="text-xs text-b3-bone/60 overflow-x-auto">
              deposit_tx = {deposit.deposit_tx}{"\n"}
              payout_tx  = {deposit.payout_tx}
            </pre>
            {!report ? (
              <button
                onClick={onFetchReport}
                disabled={reportBusy}
                className="px-5 py-2 rounded border border-b3-mint text-b3-mint font-bold disabled:opacity-50"
              >
                {reportBusy ? "Unsealing…" : "View full exploit report"}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {report && (
        <div className="tile space-y-3">
          <h3 className="font-bold text-b3-mint glow-mint">Report unsealed</h3>
          <p className="text-xs text-b3-bone/60">
            PoC source and the exact forge replay output that the TEE captured.
          </p>
          <details className="tile" open>
            <summary className="cursor-pointer text-sm">Foundry PoC source</summary>
            <pre className="mt-3 text-xs overflow-x-auto max-h-96">
              {report.poc_solidity}
            </pre>
          </details>
          <details className="tile">
            <summary className="cursor-pointer text-sm">Forge replay output</summary>
            <pre className="mt-3 text-xs overflow-x-auto max-h-64">
              {report.forge_output}
            </pre>
          </details>
        </div>
      )}
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
