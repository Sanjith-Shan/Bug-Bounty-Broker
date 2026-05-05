import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="space-y-16">
      <section className="text-center space-y-6 py-12">
        <h1 className="text-6xl font-bold tracking-tight">
          <span className="text-b3-mint glow-mint">Prove</span> the bug.
          <br />
          <span className="text-b3-bone/80">Get paid first.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-b3-bone/70 text-lg">
          B³ is a TEE-sealed agent on EigenCloud that verifies your smart-contract
          exploit on a forked chain, scores severity deterministically with EigenAI,
          and only releases the report to the company <em>after</em> they pay.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Link
            to="/submit"
            className="px-6 py-3 rounded-md bg-b3-mint text-b3-ink font-bold hover:opacity-90"
          >
            Submit a PoC
          </Link>
          <Link
            to="/verify"
            className="px-6 py-3 rounded-md border border-b3-bone/30 hover:bg-b3-fog"
          >
            Verify an attestation
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Tile title="The trust gap">
          Today, the researcher has to reveal the bug before the company decides if it's
          real. Injective offered 10% of the advertised max after 3 months of silence.
          HackerOne's IBB program was paused in April 2026. The asymmetry is the product.
        </Tile>
        <Tile title="The TEE flip">
          B³ runs inside Intel TDX on Google Cloud Confidential Space. The PoC is
          encrypted in transit, decrypted only inside the attested enclave, replayed on
          a forked chain, and never leaks until the bounty is paid.
        </Tile>
        <Tile title="Deterministic severity">
          EigenAI rates CVSS 3.1 with a fixed seed and signs the inference. Anyone can
          replay the same call, recover the same score, and verify the EigenAI Operator
          key against the on-chain KeyRegistrar.
        </Tile>
      </section>

      <section className="tile">
        <h2 className="text-2xl font-bold mb-4">The 60-second verification ceremony</h2>
        <ol className="list-decimal list-inside space-y-2 text-b3-bone/80">
          <li>Submit a Foundry PoC against a target contract.</li>
          <li>B³ replays the exploit on a forked chain inside the TEE.</li>
          <li>EigenAI scores severity. Result is signed by the TEE wallet.</li>
          <li>
            Click <span className="text-b3-mint">Verify</span> → the dashboard recovers the
            signer with <code className="bg-b3-ink/50 px-1">ethers.verifyMessage</code> and
            matches it against the on-chain app registry.
          </li>
          <li>Company deposits USDC → report unlocks → researcher gets paid (minus 5% fee).</li>
        </ol>
      </section>
    </div>
  );
}

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tile">
      <h3 className="text-b3-mint glow-mint font-bold mb-2">{title}</h3>
      <p className="text-sm text-b3-bone/70 leading-relaxed">{children}</p>
    </div>
  );
}
