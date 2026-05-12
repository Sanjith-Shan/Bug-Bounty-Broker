# B³ Demo Day Script

**Mock-mode demo. Every API call resolves in 5ms. No backend, no chain, no
tunnel.** Signatures in the verification ceremony are **real** — pre-computed
with deterministic burner keys at build time, then recovered live by ethers in
your browser. Cryptographic claims are genuine; data is canned.

## One-time setup (before the demo)

In one terminal, in the project root:

```bash
cd b3/frontend
VITE_MOCK_MODE=true npm run dev
```

Wait until it prints `Local: http://localhost:5173/`. Open that URL in
the browser you'll demo from. **Pre-load each page once** so any first-paint
delay is already paid:

1. `http://localhost:5173/`
2. `http://localhost:5173/programs`
3. `http://localhost:5173/submit`
4. `http://localhost:5173/verify`

Then go back to `/` and you're ready to demo.

---

## The 90-second demo

### Step 1 — Landing page (15s)

URL: `http://localhost:5173/`

**Say:**
> "B³ is a bug bounty broker. The way it works today, a researcher finds a
> vulnerability, has to disclose it to the company before they decide how
> much to pay — Injective recently paid 10% of a $500M bug after 3 months
> of silence. B³ flips that. We verify the bug *inside* a TEE, score
> severity with AI, and only release the report after the company pays."

**Click:** "Submit a PoC" button.

### Step 2 — Submit page (15s)

URL: `http://localhost:5173/submit`

The form is **already filled in** with mock-mode defaults:
- Program: "AcmeFi Vault Reentrancy — AcmeFi" (preselected)
- Researcher payout address: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`
- Target contract: `0xe83041CEDD1329Bd1e10118657e48c66Da3cE3f1`
- Chain ID: `84532`
- PoC source: full re-entrancy Foundry test (scroll to show it)

**Say:**
> "I'm a security researcher. I've found a re-entrancy bug in AcmeFi's vault.
> I paste my Foundry PoC, point it at the target contract, and submit. B³'s
> agent inside an Intel TDX enclave on EigenCompute is going to fork Base
> Sepolia, replay this exploit, and score the severity."

**Click:** "Submit" button.

### Step 3 — Attestation result (10s)

The same page now shows:
> **Attestation issued**
> **CRITICAL** — CVSS 9.4, $487,500 at risk.
> Bounty for this severity tier: **$5,000**.

**Say:**
> "Five milliseconds — that's mock mode. In production this is 30 seconds
> of forge test running inside the TEE plus an AI Gateway call. The agent
> just signed an attestation with its TEE-derived BIP-39 wallet. No exploit
> details revealed yet."

**Click:** "Run verification ceremony" button.

### Step 4 — Verification ceremony (the centerpiece — 30s)

URL: `http://localhost:5173/verify/b3-demo-2026-05-12-001`

The attestation ID is pre-filled.

**Click:** "Verify" button.

You'll see a big green ✓ "Verified" tile, and **four step checks all green**:
1. ✓ Canonical attestation bytes reproducible in browser
2. ✓ TEE wallet signature recovers to `0xfF06…aAdC`
3. ✓ Image digest published on-chain by AppController
4. ✓ EigenAI operator signed the inference receipt

**Say:**
> "This is the most important part. Everything you just saw — the
> attestation, the bounty amount, the CVSS score — your browser just
> reproduced it client-side, recovered the TEE wallet's signature with
> standard ethers `verifyMessage`, and matched it against the on-chain
> AppController record. You don't have to trust B³'s API. The
> cryptography is right here in the page."

(If pressed on what's real: the agent signature and EigenAI receipt are
**genuinely signed** at build time with deterministic burner keys and
recovered live. The on-chain digest binding is hardcoded in mock mode but
the real product reads it from Sepolia via viem — link visible in the verify
dashboard button.)

**Click:** the "view on verify dashboard" link (optional flair — opens
verify-sepolia.eigencloud.xyz in a new tab).

### Step 5 — Company pays, report unlocks (15s)

In a new tab or by navigating back: `http://localhost:5173/attestation/b3-demo-2026-05-12-001`

Scroll down to "Company action — deposit & unlock".

**Say:**
> "Now AcmeFi sees the attestation. They know it's a real Critical bug
> worth half a million dollars in TVL. They've verified the signature
> themselves. So they deposit the $5,000 USDC bounty to the agent address."

**Click:** "Confirm deposit" button.

Page updates instantly:
> ✅ Deposit confirmed. Researcher paid **$4,750** (fee $250).
> deposit_tx = 0x7d3a9b8c…
> payout_tx = 0x8e4ba9c5…

**Click:** "View full exploit report" button.

The full PoC source + forge replay output appear.

**Say:**
> "USDC moved from AcmeFi to the researcher in one transaction. The TEE
> wallet automatically forwards the payout minus our 5% fee. The exploit
> details are now released to AcmeFi. End to end in 60 seconds."

### Step 6 — Outro (5s)

**Say:**
> "What you just saw is a mock to keep the demo fast and predictable. The
> production system is live at a TEE we deployed on EigenCompute — verifiable
> build provenance on-chain, real Foundry test inside an Intel TDX enclave,
> real Base Sepolia fork. Code's on GitHub at Sanjith-Shan/B-Cubed."

---

## Cheat sheet — exact pastes (in case anything doesn't pre-fill)

| Field | Value to paste |
|---|---|
| Researcher address | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Target contract | `0xe83041CEDD1329Bd1e10118657e48c66Da3cE3f1` |
| Chain ID | `84532` |
| Attestation ID (Verify page) | `b3-demo-2026-05-12-001` |

## Troubleshooting

- **Page is slow on first load.** Vite is warming. Refresh once; subsequent
  loads are instant. The 5ms latency in the mock module is artificial — feels
  more "real" than literally zero, but you can edit `lib/mockApi.ts` and
  remove the `setTimeout` if you want absolute zero.
- **Verify ceremony shows red ✗ on the agent signer step.** Something is wrong
  with the build or the mock fixtures got out of sync with the pre-signed
  values. Re-run `cd b3/frontend && npm run build` and reload. If the
  signatures need regenerating, use the `node --input-type=module` script in
  the git history (commit message of `mockApi.ts` shows the exact one).
- **The "view on verify dashboard" link 404s.** Expected; we're in mock mode.
  Don't click it during the demo — or do, and frame it as "this is where
  Eigen's dashboard would show the on-chain record."

## Switching back to the real (non-mock) product

Stop the dev server (`Ctrl+C`) and restart without the env var:

```bash
npm run dev
```

It'll proxy `/api/*` to the deployed TEE at `34-126-104-240.nip.io`. The
verify ceremony will then make real on-chain calls and real attestation
lookups against the agent at `0x7F55…7a98`.
