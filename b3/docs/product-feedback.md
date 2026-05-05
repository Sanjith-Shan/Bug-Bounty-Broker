# Eigen Labs Product Feedback — from building B³

> Filled in iteratively while building B³ (Bug Bounty Broker) on EigenCompute + EigenAI
> for the Private Preview Demo Day on **May 12, 2026**.

## What worked extremely well

- **Determinism story is genuinely compelling.** EigenAI's bit-exact reproducibility
  unlocks an attestation that anyone can re-derive without running the TEE. That's the
  single feature that makes B³'s "minimized trust" claim defensible.
- **`process.env.MNEMONIC` is the right primitive.** A deterministic, image-digest-bound
  wallet means our agent's identity *is* its image — exactly what a verification ceremony
  needs. We didn't have to build a separate key-management layer.
- **OpenAI-compatible API** dropped EigenAI in with one base-URL change. Five-minute
  integration. Don't break this.
- **Reference repo `compute-escrow-privy` was structurally helpful** — frontend / onchain
  / src / Caddyfile / Dockerfile mirrors translated cleanly to a Python backend.

## Friction we hit

1. **Cross-language canonicalization is a footgun.** Python's `json.dumps(0.0)` produces
   `"0.0"` while JavaScript's `JSON.stringify(0.0)` produces `"0"`. Our first integration
   pass had a signature mismatch because of one trailing zero on `funds_at_risk_usd`. We
   fixed it by quoting all numerics in the signed payload, but the EigenCloud docs should
   call this out for any team building cross-stack verification flows. A "canonical
   message" helper or RFC-8785 (JCS) reference implementation in the SDK would prevent
   this.
2. **EigenAI signature concatenation rules need a Python reference.** The docs describe
   `concat(req.messages[].content) + concat(resp.choices[].message.content) + model + chainID`,
   but a 5-line Python snippet that produces the exact bytes would save every team an
   afternoon. We wrote one in `agent/app/services/severity_assessor.py::build_eigenai_verification_message`
   — happy to upstream.
3. **`ecloud compute app deploy` interactive prompts are great for first-run, awkward for
   CI.** A documented `--yes`/non-interactive flag set with examples for GitHub Actions
   would help.
4. **Foundry inside the Docker image is heavy.** Pre-baking a `layr-labs/foundry-tee`
   base image with `forge` already installed would shave ~2–3 minutes off cold deploys.
5. **Trust-model phrasing.** The docs alternate between "trustless" and "minimized trust";
   we lean on the latter because TDX, GCP, and the dev key are all transitive trust
   anchors. A canonical paragraph teams can copy into their own docs would help everyone
   stay honest.

## Things we want next

- **A signature-verification endpoint built into EigenAI.** Sending `(request, response,
  model, chainID, signature)` and getting back a recovered address (with KeyRegistrar
  matching) would be a great DX win. Right now every team writes their own.
- **`ecloud compute app digest <name>`** — return the current image digest as a one-liner
  so frontends can pin the on-chain registry lookup without parsing `app info`.
- **EigenDA write helpers in the SDK.** Storing append-only attestations there is the
  obvious next step for B³, but the current path has a few too many moving pieces for an
  MVP.
- **A `--profile demo` flag** for `ecloud compute app deploy` that skips billing checks
  and provisions a short-lived TLS cert pointing at a developer-test domain. The first
  hour of getting end-to-end TLS working was the longest hour.
- **Slashing-backed restaking timeline.** "Roadmap" is the right answer today, but a
  rough quarter would help us scope the v2 demo.

## What we would build with more time

- An on-chain escrow contract per program so deposits become atomic with report release
  (current B³ uses direct USDC transfers and a deposit poll).
- A "challenge" path: anyone can re-issue the EigenAI prompt and submit a dispute if the
  re-derived score disagrees, anchored to EigenDA.
- A non-EVM verifier (Solana / Move) using the same TEE + attestation pattern.

## One sentence

EigenCompute + EigenAI shipped exactly what the pitch promised — deterministic,
attested, OpenAI-compatible. The only painful surprises were at integration boundaries
where two languages' encoders disagree on numeric formatting; documenting a canonical
message format would erase 80% of that friction.
