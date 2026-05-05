# B³ — Bug Bounty Broker

A sovereign agent on EigenCloud that lets security researchers prove a smart-contract
vulnerability exists and get paid without revealing it first. Runs as an EigenCompute app
inside an Intel TDX TEE. Target: Eigen Labs Private Preview Demo Day, **May 12, 2026**.

The full product spec lives in `../B3_CLAUDE_CODE_CONTEXT.md.pdf` (and rendered text at
`../B3_CONTEXT.txt`). This file is the fast-reference for development.

## Tech stack

- **Backend** (`agent/`): Python 3.11, FastAPI, web3.py, eth-account, openai, Foundry (forge), SQLite, Caddy.
- **Frontend** (`frontend/`): React + TypeScript + Vite + Tailwind + ethers.js + wagmi/viem.
- **Demo contracts** (`agent/contracts/`, `agent/exploits/`): Solidity / Foundry tests.

## EigenCloud constants

> **Always cross-check against `docs/eigencloud-platform.md` before assuming.** That file is the
> authoritative reference; this section is a quick-glance summary that was wrong before and may rot again.

- AI Gateway base URL: `https://ai-gateway-dev.eigencloud.xyz` — endpoint is `/v1/chat/completions`, OpenAI-compatible.
- Auth: `Authorization: Bearer <JWT>`. JWT issued by KMS after TEE attestation. **No static API key.**
  - Inside TEE: TS SDK `@layr-labs/ecloud-sdk/attest` handles automatically, or read pre-deposited token at `/run/container_launcher/attestation_verifier_claims_token`.
  - Local dev: set `KMS_AUTH_JWT=<jwt>` (request from `#ext-private-preview`).
- Models: `gpt-oss-120b-f16` (open-weight, fully verifiable), `anthropic/claude-sonnet-4.6` (closed-weight, signed receipt only). No `qwen3-*`.
- Determinism: pass `seed=42`; bit-identical output guaranteed under same GPU SKU. Cross-architecture not guaranteed.
- Per-response signature: receipt = `H(req) || H(out) || model_id || chainid` (byte order to be confirmed against live verify-signature doc before demo). Recover with `ethers.verifyMessage`, cross-check against `KeyRegistrar` (Sepolia `0xA4dB30D08d8bbcA00D40600bee9F029984dB162a`, Mainnet `0x54f4bC6bDEbe479173a2bbDc31dD7178408A57A4`).
- TEE wallet: `process.env.MNEMONIC` — BIP-39, deterministic from app ID, **stable across image upgrades** (image-upgrade-takes-wallet is a known threat; pin verifiable build digests).
- Public env vars: any key ending `_PUBLIC` is recorded **on-chain** in `AppUpgraded` events on `AppController` (Sepolia `0x0dd810a6ffba6a9820a10d97b659f07d8d23d4E2`, Mainnet `0xc38d35Fc995e75342A21CBd6D770305b142Fbe67`); everything else is KMS-sealed.

## Deploy commands (EigenCompute)

```bash
npm install -g @layr-labs/ecloud-cli       # v0.5.0+
ecloud auth generate --store
ecloud billing subscribe
ecloud compute app create --name b3-agent --language typescript
ecloud compute app deploy                  # builds Docker image, encrypts .env, deploys
ecloud compute app configure tls           # Caddy + Let's Encrypt inside TEE
ecloud compute app info                    # public IP, address, digest
ecloud compute app logs --watch
ecloud compute app upgrade b3-agent        # redeploy
```

## Container constraints (non-negotiable)

- `FROM --platform=linux/amd64 ...`
- `USER root`
- `EXPOSE 3000` and bind to `0.0.0.0` (not `127.0.0.1`)
- TLS terminates inside the TEE — Caddy reverse-proxies to `localhost:3000`.

## Trust model — say it honestly

"Minimized, verifiable, on-chain-anchored trust." We transitively trust:
- Intel TDX silicon
- Google Cloud + Confidential Space attestation service
- Eigen Labs KMS (single-operator in alpha; threshold KMS is roadmap)
- Lambda, Inc. (hosts EigenAI inference per legal terms)
- The developer key (anyone with the deploy private key can ship a v2 image inheriting the wallet)

Restaking-backed slashing (`EigenVerify` AVS in the EigenAI whitepaper) is roadmap, not live.
Do **not** claim "trustless". Closed-weight models like Claude get a signed receipt but
**not** the deterministic re-execution guarantee that open-weight models do — disclose this.

## Project structure

```
b3/
├── CLAUDE.md                # this file
├── README.md                # public overview
├── docs/
│   ├── architecture.md      # diagram + design notes (deliverable)
│   └── product-feedback.md  # Eigen Labs feedback (deliverable)
├── agent/                   # backend, runs in EigenCompute
│   ├── Dockerfile
│   ├── Caddyfile
│   ├── requirements.txt
│   ├── foundry.toml
│   ├── .env.example
│   ├── app/
│   │   ├── main.py          # FastAPI entrypoint
│   │   ├── config.py
│   │   ├── models.py        # Pydantic schemas
│   │   ├── db.py            # SQLite
│   │   ├── routes/
│   │   │   ├── bounties.py
│   │   │   ├── submissions.py
│   │   │   ├── attestations.py
│   │   │   └── payments.py
│   │   └── services/
│   │       ├── exploit_verifier.py   # forge test --fork-url
│   │       ├── severity_assessor.py  # EigenAI CVSS
│   │       ├── signer.py             # TEE wallet signing
│   │       ├── escrow.py             # USDC monitor + payouts
│   │       └── crypto.py             # PoC encryption helpers
│   ├── contracts/           # vulnerable demo contracts
│   └── exploits/            # PoC Foundry tests
└── frontend/                # React verification dashboard
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── App.tsx
        ├── pages/
        ├── components/
        └── lib/verify.ts    # ethers.verifyMessage logic
```

## What NOT to build (per spec)

- Generic "personal agent" pitch — Eigen Labs explicitly said these are not useful.
- A full prediction market / oracle — this is a bug bounty broker.
- Smart-contract escrow — direct USDC transfers to/from the TEE wallet are sufficient for v1.
- Non-EVM chains, user auth, ZK circuits — out of scope.
