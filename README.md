# B³ — Bug Bounty Broker

> A neutral, TEE-sealed agent that verifies smart-contract vulnerabilities
> **without revealing them first**, produces a deterministic CVSS attestation,
> and only releases the exploit details after the bounty is paid.

Built for the [Eigen Labs Private Preview](https://blog.eigencloud.xyz/eigencloud-brings-verifiable-ai-to-mass-market-with-eigenai-and-eigencompute-launches/).
Live at **<https://b3-frontend-tawny.vercel.app/>**.
On-chain app id: [`0x7F55207baD0c224D92524BFCD2552c5893Dd7a98`](https://verify-sepolia.eigencloud.xyz/app/0x7F55207baD0c224D92524BFCD2552c5893Dd7a98)
on Sepolia.

---

## The trust gap

Today's bug-bounty flow has total information asymmetry: the researcher must
disclose the full exploit before the company decides whether (and how much)
to pay. Documented failures:

- **Injective, March 2026** — $500M vulnerability, offered 10% of advertised
  max after three months of silence.
- **HackerOne ghosting, January 2026** — veteran researcher, 20+ prior
  disclosures, ignored for months.
- **HackerOne IBB paused, April 2026** — the Internet Bug Bounty program was
  suspended because AI tooling finds bugs faster than maintainers can fix
  them.

The market is $1.5B today and projected to reach $5.7B by 2033. Web3 lost
$3.1B in H1 2025 alone. Nothing on the market verifies a vulnerability
*without* showing it to the paying party first.

## How B³ flips it

```
researcher                B³ agent (in TEE)              company
    │                            │                          │
    ├── encrypted PoC ─────────►│                          │
    │                            ├── fork chain & replay    │
    │                            ├── EigenAI CVSS scoring   │
    │                            ├── sign attestation       │
    │                            ├── "Critical, CVSS 9.1,   │
    │                            │    $500K at risk" ──────►│
    │                            │◄────── deposit USDC ─────│
    │◄── payout (minus fee) ─────┤                          │
    │                            ├──── full report ────────►│
```

Every attestation is signed by a BIP-39 wallet derived inside the enclave
from the EigenCompute app id — only the attested TEE can produce signatures
the on-chain `AppController` record will validate. Anyone can re-derive the
expected signer, run `ethers.verifyMessage` in their browser, and compare
against the on-chain registry without trusting B³'s API.

## Architecture

```
┌────────────────── EigenCompute TEE (Intel TDX, GCP Confidential Space) ──────────────┐
│                                                                                      │
│  Caddy :443 ──► Uvicorn :3000 ──► FastAPI                                            │
│                                       │                                              │
│  ┌────────────────────────────────────┴─────────────────────────────────────────┐   │
│  │ routes/                          services/                                   │   │
│  │   bounties.py     ──────────►    exploit_verifier.py  (forge test --fork-url)│   │
│  │   submissions.py  ──────────►    severity_assessor.py ──► Node sidecar       │   │
│  │                                    (@layr-labs/ai-gateway-provider, JWT auto)│   │
│  │   attestations.py ──────────►    signer.py            (eth_account, BIP-39)  │   │
│  │   payments.py     ──────────►    escrow.py            (web3 USDC poll/send)  │   │
│  │                                  crypto.py            (PoC encryption)       │   │
│  │                                  db.py                (SQLite, sealed blobs) │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  Sealed env (KMS-encrypted, never leaves enclave)                                    │
│    ├── MNEMONIC                  ◄── auto-injected, BIP-39, deterministic from appId │
│    ├── KMS_SERVER_URL + KMS_PUBLIC_KEY ◄── auto-injected, used for JWT attestation   │
│    ├── BASE_SEPOLIA_RPC_URL / other RPCs                                             │
│    └── OPENAI_API_KEY            ◄── only if running the OpenAI fallback path        │
│                                                                                      │
│  Public env (recorded on-chain in AppUpgraded events on AppController)               │
│    ├── AGENT_ADDRESS_PUBLIC                                                          │
│    ├── APP_ID_PUBLIC                                                                 │
│    ├── APP_DIGEST_PUBLIC                                                             │
│    └── SUPPORTED_CHAINS_PUBLIC                                                       │
└──────────────────────────┬─────────────────────────────────┬─────────────────────────┘
                           │                                 │
                           ▼                                 ▼
        ┌──────────────────────────────┐    ┌──────────────────────────────┐
        │ EigenAI AI Gateway           │    │ Base Sepolia + Mainnets      │
        │ /v1/chat/completions         │    │  - fork target via RPC       │
        │ claude-sonnet-4.6 /          │    │  - USDC transfer events      │
        │   gpt-oss-120b-f16           │    │  - on-chain app registry     │
        │ Bearer JWT (attested),       │    │   (AppController →           │
        │ deterministic seed=42        │    │    Release.digest)           │
        └──────────────────────────────┘    └──────────────────────────────┘
                           ▲                                 ▲
                           │     ┌──────────────────┐        │
                           └─────│ React Frontend   │────────┘
                                 │ ethers + viem    │
                                 │ verifyMessage()  │
                                 └──────────────────┘
```

## End-to-end sequence

```
researcher                  B³ agent (TEE)              company             chain
    │                             │                         │                 │
    ├── POST /submit ────────────►│                         │                 │
    │  { target, chain_id,        ├── decrypt PoC ──┐       │                 │
    │    poc.t.sol }              │                 ▼       │                 │
    │                             ├── forge test --fork-url ───────────────► │
    │                             │  capture: pass/fail, gas, balance deltas │
    │                             │◄── trace + funds-at-risk ─────────────── │
    │                             │                                          │
    │                             ├── EigenAI(prompt=traces, seed=42) ───►EigenAI
    │                             │◄── { cvss, severity, signed receipt }EigenAI
    │                             │                                          │
    │                             ├── sign(canonical_attestation, MNEMONIC)  │
    │                             ├── store sealed PoC + signatures          │
    │◄── 200 { attestation_id,    │                                          │
    │     severity, cvss,         │                                          │
    │     funds_at_risk } ────────│                                          │
    │                             │                                          │
    │                             ├── GET /attestations/{id} ◄── company  ── │
    │                             ├── public proof (no exploit) ────────────►│
    │                             │                                          │
    │                             │◄── POST /deposit/{id} ── (USDC sent) ─── │
    │                             ├── verify USDC tx on-chain                │
    │                             ├── transfer (amount - fee) ──► researcher │
    │                             ├── unseal report ────────────► company    │
```

## Repository layout

```
b3/
├── agent/                      # backend, runs inside an EigenCompute TEE
│   ├── Dockerfile              # linux/amd64, USER root, Caddy + Foundry + Node
│   ├── Caddyfile               # auto-TLS via Let's Encrypt inside enclave
│   ├── entrypoint.sh           # starts uvicorn + caddy
│   ├── requirements.txt        # FastAPI, web3, eth-account, cryptography
│   ├── foundry.toml            # forge config for in-TEE exploit replay
│   ├── .env.example            # documented env vars
│   ├── app/
│   │   ├── main.py             # FastAPI entrypoint + /health
│   │   ├── config.py           # pydantic-settings
│   │   ├── models.py           # pydantic schemas
│   │   ├── db.py               # SQLite + sealed-blob storage
│   │   ├── routes/
│   │   │   ├── bounties.py     # create/list/get bounty programs
│   │   │   ├── submissions.py  # POST /submit — forge replay + AI scoring
│   │   │   ├── attestations.py # signed attestation lookup + verify payload
│   │   │   └── payments.py     # USDC deposit confirmation + payout + report unseal
│   │   └── services/
│   │       ├── exploit_verifier.py  # `forge test --fork-url <chain>` runner
│   │       ├── severity_assessor.py # spawns inference sidecar, parses CVSS JSON
│   │       ├── signer.py            # eth-account BIP-39 wallet (uses MNEMONIC)
│   │       ├── escrow.py            # web3.py USDC log polling + transfer signing
│   │       └── crypto.py            # AES-GCM at-rest sealing of PoC blobs
│   ├── inference/              # Node sidecar for the AI Gateway call
│   │   ├── index.mjs           # spawned per /submit, posts to gateway via @layr-labs/ai-gateway-provider
│   │   └── package.json        # pins ai@^6 + @layr-labs/ai-gateway-provider@^1
│   ├── contracts/              # vulnerable demo contracts (VulnerableVault, etc.)
│   └── exploits/               # canonical Foundry PoCs used in the example flow
├── frontend/                   # React verification dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Landing.tsx     # marketing + value prop
│   │   │   ├── Programs.tsx    # list of registered bounty programs
│   │   │   ├── Submit.tsx      # paste a Foundry PoC, submit
│   │   │   ├── Attestation.tsx # view attestation, deposit, unseal report
│   │   │   └── Verify.tsx      # the verification ceremony
│   │   └── lib/
│   │       ├── api.ts          # typed fetch client
│   │       ├── onchain.ts      # viem reader for AppController records
│   │       └── verify.ts       # ethers.verifyMessage cryptography
│   ├── vite.config.ts
│   └── vercel.json             # production rewrites (Vercel proxy → TEE backend)
├── docs/
│   ├── architecture.md         # detailed component + sequence diagrams
│   ├── deploy.md               # step-by-step EigenCompute deploy
│   ├── eigencloud-platform.md  # authoritative platform reference
│   └── product-feedback.md     # feedback for Eigen Labs
└── scripts/
    ├── local-chain.sh          # boots Anvil + deploys VulnerableVault + funds wallets
    ├── tunnel.sh               # exposes local Anvil to the deployed TEE
    └── demo.sh                 # end-to-end curl walkthrough against any agent URL
```

## Trust model

What you transitively trust when you use B³:

- **Intel TDX silicon** for hardware-encrypted memory inside the enclave.
- **Google Confidential Space** for attesting the enclave on boot.
- **Eigen Labs KMS** (single-operator in alpha; threshold KMS is roadmap) for
  issuing JWTs that authorize calls to the EigenAI gateway.
- **Lambda, Inc.** for hosting the underlying EigenAI inference.
- **The developer key** — anyone with the deploy private key for the
  `AppController` entry can ship a v2 image that inherits the same TEE
  wallet. Mitigated by pinning verifiable build digests and having verifiers
  monitor `AppUpgraded` events.

Restaking-backed slashing (the `EigenVerify` AVS in the EigenAI whitepaper)
is roadmap, not live in alpha. We do **not** claim "trustless." Closed-weight
models like Claude get a signed receipt but **not** the deterministic
re-execution guarantee that open-weight models (e.g. `gpt-oss-120b-f16`)
provide — disclosed in the verification UI.

## Verification ceremony

Every claim B³ makes can be independently reproduced in the browser:

1. **Canonical attestation bytes** — the frontend re-serializes the
   attestation data with the same sort-keys/separators rule as the backend
   and compares byte-for-byte.
2. **TEE wallet signature** — `ethers.verifyMessage(canonical_message,
   agent_signature)` recovers an EVM address. We compare it to the address
   advertised in `/health` and (independently) to the wallet recorded by
   `AppController` for this app id.
3. **On-chain image-digest binding** — the frontend reads the latest
   `AppUpgraded` event on Sepolia via viem and shows the registered image
   digest + the `verify-sepolia.eigencloud.xyz` link for an independent
   cross-check.
4. **EigenAI receipt** — when the gateway returns a per-response signature,
   the frontend recovers the operator key and verifies it against the
   `KeyRegistrar` contract address for the relevant chain.

## Local development

### Backend

```bash
cd b3/agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in EIGEN_GATEWAY_URL, KMS_AUTH_JWT, MNEMONIC, BASE_SEPOLIA_RPC_URL
curl https://foundry.paradigm.xyz | bash && foundryup
uvicorn app.main:app --reload --port 3000
```

The inference sidecar lives at `agent/inference/`. It supports two paths,
selected by env var:

- **EigenAI Gateway** (default) — calls
  `https://ai-gateway-dev.eigencloud.xyz/v1/chat/completions` through the
  official `@layr-labs/ai-gateway-provider`. Inside an EigenCompute TEE the
  attestation flow auto-acquires a JWT via `KMS_SERVER_URL` +
  `KMS_PUBLIC_KEY`. For local development, set `KMS_AUTH_JWT=<jwt>` after
  requesting one from Eigen Labs' `#ext-private-preview`.
- **OpenAI direct** — set `USE_OPENAI_FALLBACK=true` and `OPENAI_API_KEY`
  to bypass the EigenAI path entirely. The attestation envelope (TEE wallet
  signature, canonical bytes, on-chain digest binding) is unchanged; only
  the per-response operator signature claim doesn't apply.

### Frontend

```bash
cd b3/frontend
npm install
npm run dev
# open http://localhost:5173
```

Set `VITE_API_URL` to point the frontend at a specific backend (defaults to
the same-origin `/api` proxy when deployed via Vercel).

### Local chain for end-to-end testing

```bash
cd b3
./scripts/local-chain.sh       # boots Anvil on :8545, deploys vault + USDC, funds wallets
./scripts/tunnel.sh             # exposes Anvil to the deployed TEE via localtunnel
./scripts/demo.sh               # walks through the full curl flow against a chosen API URL
```

## Deploying to EigenCompute

```bash
npm install -g @layr-labs/ecloud-cli
ecloud auth generate --store
ecloud billing subscribe

cd b3/agent
ecloud compute app create --name b3-agent --language python
ecloud compute app deploy \
  --verifiable \
  --repo https://github.com/<you>/b-cubed \
  --commit $(git rev-parse HEAD) \
  --build-context b3/agent \
  --build-dockerfile Dockerfile \
  --env-file .env.production \
  --instance-type g1-standard-4t \
  --log-visibility public \
  --resource-usage-monitoring enable \
  --force

ecloud compute app configure tls  # provisions Let's Encrypt cert inside the enclave
ecloud compute app info           # public IP, agent address, image digest
```

See [`b3/docs/deploy.md`](./b3/docs/deploy.md) for the full guide including
container constraints (`linux/amd64`, `USER root`, `EXPOSE 3000`,
`0.0.0.0`-bind), and the verifiable-build provenance flow.

## Deploying the frontend

The frontend is a standard Vite SPA. The included `vercel.json` configures:

- `npm run build` → `dist/`
- SPA fallback so deep links work
- A `/api/*` rewrite that proxies same-origin requests to the deployed TEE,
  letting Vercel terminate TLS while the backend serves HTTP on port 3000

```bash
cd b3/frontend
npx vercel --prod
```

Or any static host that supports SPA fallbacks (Netlify, Cloudflare Pages,
GitHub Pages, etc.).

## API reference

All endpoints accept and return JSON.

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET`  | `/health` | — | agent address, app id + registry chain, supported chains, fee bps |
| `POST` | `/bounties` | `BountyProgramIn` | created `BountyProgram` |
| `GET`  | `/bounties` | — | list of `BountyProgram` |
| `GET`  | `/bounties/{id}` | — | one `BountyProgram` |
| `POST` | `/submit` | `SubmissionIn` (program_id, target, chain_id, poc_solidity, researcher_address) | `SubmitResponse` with `attestation_id`, severity, CVSS, bounty amount, deposit address |
| `GET`  | `/attestations/{id}` | — | public `Attestation` (no exploit details) |
| `GET`  | `/verify/{id}` | — | full `VerifyResponse` with canonical message, expected signer, EigenAI request/response bytes |
| `POST` | `/deposit/{id}` | — | confirms USDC deposit on-chain, transfers payout, returns tx hashes |
| `GET`  | `/report/{id}` | — | unsealed `Report` with the full PoC source and forge replay output (requires `deposit_status != pending`) |

Schemas live in `b3/agent/app/models.py`.

## Tech stack

- **Backend** — Python 3.11, FastAPI, web3.py, eth-account, Foundry, SQLite,
  Caddy, Node 20 (inference sidecar).
- **Frontend** — React 18, TypeScript, Vite, Tailwind, ethers v6, viem,
  wagmi.
- **Infrastructure** — EigenCompute (Intel TDX TEE on GCP Confidential
  Space), EigenAI (AI Gateway, Bearer-JWT attested), Vercel (frontend +
  reverse proxy).
- **Chains** — Base Sepolia for the demo flow, with config for Ethereum
  Mainnet, Base, and Polygon.

## What's intentionally out of scope (v1)

- Non-EVM chains.
- User auth — anyone can post a bounty program or a PoC; the TEE wallet is
  the only privileged actor.
- An on-chain escrow contract — v1 uses direct USDC transfers to/from the
  TEE wallet. A future v2 could move to a Safe-style escrow with timed
  release.
- ZK circuits — not needed; TEE attestation is the trust anchor.
- Multi-program payouts — one attestation, one bounty, one payout.

## Status

Built for the Eigen Labs Private Preview Demo Day on **May 12, 2026**.
Active development; expect rough edges. Issues and PRs welcome.

## License

MIT.
