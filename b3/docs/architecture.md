# B³ Architecture

## One-line summary

A FastAPI agent inside an Intel TDX TEE forks the target chain, replays a researcher's
encrypted PoC against it, scores severity with EigenAI (deterministic), signs the result
with the TEE-sealed BIP-39 wallet, and gates the full report on a USDC deposit.

## Component map

```
┌────────────────── EigenCompute TEE (Intel TDX, GCP Confidential Space) ──────────────────┐
│                                                                                          │
│   Caddy :443 ──► Uvicorn :3000 ──► FastAPI                                                │
│                                       │                                                   │
│   ┌───────────────────────────────────┴──────────────────────────────────────────┐       │
│   │ routes/                          services/                                   │       │
│   │   bounties.py     ──────────►    exploit_verifier.py  (forge test --fork-url)│       │
│   │   submissions.py  ──────────►    severity_assessor.py ──► inference sidecar │       │
│   │                                    (@layr-labs/ai-gateway-provider, JWT auto)│       │
│   │   attestations.py ──────────►    signer.py            (eth_account, BIP-39)  │       │
│   │   payments.py     ──────────►    escrow.py            (web3 USDC poll)       │       │
│   │                                  crypto.py            (PoC encryption)       │       │
│   │                                  db.py                (SQLite, encrypted)    │       │
│   └──────────────────────────────────────────────────────────────────────────────┘       │
│                                                                                          │
│   .env (sealed by KMS)                                                                   │
│     ├── EIGEN_GATEWAY_URL / EIGEN_MODEL / EIGEN_SEED                                     │
│     ├── KMS_SERVER_URL + KMS_PUBLIC_KEY  ◄── auto-injected, attests for JWT              │
│     ├── MNEMONIC                  ◄── injected by EigenCompute, BIP-39, deterministic    │
│     ├── AGENT_ADDRESS_PUBLIC      ◄── visible to clients                                 │
│     ├── APP_ID_PUBLIC             ◄── anchor for on-chain digest lookup                  │
│     ├── APP_DIGEST_PUBLIC                                                                │
│     └── SUPPORTED_CHAINS_PUBLIC                                                          │
│                                                                                          │
└──────────────────────────┬──────────────────────────────────────────┬─────────────────────┘
                           │                                          │
                           ▼                                          ▼
              ┌──────────────────────────┐              ┌──────────────────────────┐
              │ EigenAI AI Gateway       │              │ Base Sepolia + Mainnets  │
              │ /v1/chat/completions     │              │   - fork target via RPC  │
              │ claude-sonnet-4.6 /      │              │   - USDC transfer events │
              │   gpt-oss-120b-f16       │              │   - on-chain app registry│
              │ Bearer JWT, seed=42      │              │   (AppController →       │
              │ receipt + signature      │              │    Release.digest)       │
              └──────────────────────────┘              └──────────────────────────┘
                           ▲                                          ▲
                           │                                          │
                           │            ┌──────────────────┐          │
                           └────────────│ React Frontend   │──────────┘
                                        │ verifyMessage()  │
                                        │ ethers + wagmi   │
                                        └──────────────────┘
```

## End-to-end sequence

```
researcher                  B³ agent (TEE)              company             chain
    │                             │                         │                  │
    │── POST /submit ────────────►│                         │                  │
    │   {target, chain_id,        │                         │                  │
    │    poc.t.sol (encrypted)}   │                         │                  │
    │                             │── decrypt PoC ──┐       │                  │
    │                             │                 ▼       │                  │
    │                             │── forge test --fork-url ──────────────────►│
    │                             │   capture: pass/fail, gas, balance deltas  │
    │                             │◄── trace + funds-at-risk ──────────────────│
    │                             │                                            │
    │                             │── EigenAI(prompt=traces, seed=42) ────►EigenAI
    │                             │◄── { cvss, severity, signature } ──────EigenAI
    │                             │                                            │
    │                             │── sign(attestation_data, MNEMONIC) ──┐    │
    │                             │                                       ▼    │
    │                             │   store(attestation_id, encrypted PoC, sigs)
    │◄── 200 { attestation_id,    │                                            │
    │     severity, cvss,         │                                            │
    │     funds_at_risk } ────────│                                            │
    │                             │                                            │
    │                             │── GET /attestations/{id} ◄── company  ─────│
    │                             │── public proof (no exploit) ───────────────►
    │                             │                                            │
    │                             │── POST /deposit/{id} ◄─── x402 / direct ───│
    │                             │   verify USDC tx on-chain                  │
    │                             │── transfer USDC(researcher, amount-fee) ──►chain
    │◄── webhook / poll ──────────│                                            │
    │                             │── GET /report/{id} (gated) ────────────────│
    │                             │── full PoC + traces ──────────────────────►company
```

## Attestation schema

```json
{
  "attestation_id": "uuid-v4",
  "data": {
    "target_contract": "0x...",
    "chain_id": 1,
    "severity": "CRITICAL",
    "cvss_score": 9.1,
    "funds_at_risk_usd": 500000,
    "exploit_verified": true,
    "verification_block": 19283847,
    "eigenai_model": "qwen3-32b-128k-bf16",
    "app_digest": "sha256:abc...",
    "timestamp": "2026-05-05T12:00:00Z"
  },
  "eigenai_signature": "0x<130 hex>",
  "agent_signature":   "0x<130 hex>"
}
```

`agent_signature = personal_sign(canonical_json(data), bip39(MNEMONIC))`. Canonical JSON is
`json.dumps(data, sort_keys=True, separators=(',', ':'))` so the bytes are reproducible.

The frontend recovers the signer with `ethers.verifyMessage(canonical, agent_signature)`
and checks it against `AGENT_ADDRESS_PUBLIC` (also published in the on-chain app registry,
keyed by `app_digest`).

## Verification ceremony

```
click "Verify"
    │
    ├── 1. fetch /attestations/{id}                  → JSON above
    ├── 2. canonical = JSON.stringify(data, sort)
    ├── 3. signer = ethers.verifyMessage(canonical, agent_signature)
    ├── 4. expected = await fetch('/health').then(_ => _.agent_address)
    ├── 5. registryAddr = await registry.appOf(app_digest)
    ├── 6. assert signer == expected == registryAddr
    └── 7. (optional) re-issue same EigenAI prompt → match cvss/severity bit-for-bit
                                                                            ✅ green
```

## What lives where

| Concern                | Location                                       |
| ---------------------- | ---------------------------------------------- |
| Encrypted PoC at rest  | SQLite blob inside TEE, key derived from MNEMONIC |
| Public attestations    | SQLite + future EigenDA write (append-only)    |
| Bounty programs        | SQLite                                         |
| Wallet                 | `MNEMONIC` env, never written to disk          |
| TLS certs              | Caddy data dir inside TEE (auto-provisioned)   |
| App ↔ address registry | On-chain (EigenCompute publishes digest → addr)|

## Security posture

- **Encrypted in transit:** TLS terminates inside the TEE.
- **Encrypted at rest:** AES-XTS-128 on TEE memory; SQLite blobs further wrapped.
- **PoC isolation:** `forge test` runs in a subprocess with `--fork-url` only — no network
  egress beyond the read-only fork RPC, no writes to the live chain.
- **Determinism:** EigenAI seeded; canonical JSON; same image digest → same wallet.
- **Honest framing:** "minimized, verifiable trust" — Intel TDX + GCP host + Eigen Labs
  KMS + developer key. Slashing-backed restaking is roadmap.

## Out of scope (v1)

- Non-EVM chains.
- On-chain escrow contract (a USDC transfer to the agent wallet is sufficient).
- Real-user authentication (the agent processes submissions permissionlessly).
- Multi-chain attestation registry (single contract on Base Sepolia is enough for demo).
- ZK proofs for replayability (re-running the same EigenAI prompt is the verification path).
