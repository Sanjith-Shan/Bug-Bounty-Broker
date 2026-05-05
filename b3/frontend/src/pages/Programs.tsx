import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Program } from "../lib/api";

export default function Programs() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.programs().then(setPrograms).catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Active bounty programs</h2>
        <Link to="/submit" className="text-b3-mint hover:underline">Submit a PoC →</Link>
      </header>

      {error && <p className="text-b3-alarm">{error}</p>}
      {programs.length === 0 && !error && (
        <p className="text-b3-bone/60">No programs registered yet. Companies can POST /bounties to add one.</p>
      )}

      <div className="grid gap-4">
        {programs.map((p) => (
          <article key={p.id} className="tile flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">{p.name}</h3>
              <p className="text-b3-bone/60 text-sm">{p.company}</p>
              <p className="text-b3-bone/50 text-xs mt-1">
                <code>{p.target_contract}</code> · chain {p.chain_id}
              </p>
            </div>
            <div className="text-right">
              <ul className="text-xs space-y-0.5">
                {p.severity_tiers.map((t) => (
                  <li key={t.severity}>
                    <span className="text-b3-mint">{t.severity}</span>: ${" "}
                    {t.max_payout_usd.toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
