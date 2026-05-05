# B³ — Bug Bounty Broker

> A neutral, TEE-sealed agent that verifies smart-contract vulnerabilities **without
> revealing them first**, produces a deterministic CVSS attestation, and only releases the
> exploit details after the bounty is paid.

Built for **Eigen Labs Private Preview Demo Day — May 12, 2026.**

## The problem

Today's bug-bounty flow has total information asymmetry: the researcher must reveal the
full exploit before the company decides whether (and how much) to pay. Documented failures:

- **Injective (Mar 2026):** $500M vuln, offered 10% of advertised max after 3 months silence.
- **HackerOne ghosting (Jan 2026):** veteran researcher, 20+ disclosures, ignored for months.
- **HackerOne IBB paused (Apr 2026):** Internet Bug Bounty suspended; AI finds bugs faster
  than maintainers can fix them.

The market is $1.5B today, $5.7B by 2033. Web3 lost $3.1B in H1 2025. Nothing on the market
verifies a bug exists *without* showing it to the paying party.

## How B³ works

```
researcher                B³ agent (in TEE)              company
    │                            │                          │
    ├── encrypted PoC ─────────►│                          │
    │                            ├── fork chain & replay    │
    │                            ├── EigenAI CVSS scoring   │
    │                            ├── sign attestation       │
    │                            ├──"Critical, CVSS 9.1,    │
    │                            │   $500K at risk" ───────►│
    │                            │◄────── deposit USDC ─────│
    │◄── payout (minus fee) ─────┤                          │
    │                            ├──── full report ────────►│
```

Every attestation is signed by the TEE wallet (BIP-39 derived from the app ID, decryptable
only inside the attested enclave) **and** carries an EigenAI signature for the severity
scoring. Anyone can re-derive the agent's public key from the on-chain app registry, replay
the EigenAI call deterministically, and verify both signatures with one click.

## Verification ceremony (the demo moment)

1. Show a vulnerable contract on Base Sepolia.
2. Submit a Foundry-format PoC to B³.
3. B³ replays it on a forked chain inside the TEE → produces signed attestation.
4. Click **Verify** → frontend recovers signer via `ethers.verifyMessage` → matches
   on-chain registry → green checkmark.
5. Deposit test USDC → report unlocks → researcher gets paid. End-to-end < 60 seconds.

## Repo layout

- `agent/` — FastAPI backend that runs inside EigenCompute (Python + Foundry + SQLite).
- `frontend/` — React + Vite verification dashboard.
- `agent/contracts/`, `agent/exploits/` — vulnerable demo contracts and PoCs.
- `docs/architecture.md` — system design.
- `docs/product-feedback.md` — feedback for Eigen Labs.

## Quick start

```bash
# Backend (local dev)
cd agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in EIGENAI_API_KEY, set MNEMONIC for local dev
curl https://foundry.paradigm.xyz | bash && foundryup
uvicorn app.main:app --reload --port 3000

# Frontend
cd frontend
npm install
npm run dev

# Deploy to EigenCompute
cd agent
ecloud compute app create --name b3-agent --language typescript
ecloud compute app deploy
ecloud compute app configure tls
```

## Status

Built in 11 days for Demo Day. v1 scope: Ethereum / Base / Polygon EVM forks only,
direct USDC transfers (no on-chain escrow contract), one-shot Foundry-test PoC format.

## License

MIT
