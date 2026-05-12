# Slack message to post in `#ext-private-preview`

Copy-paste-able. Two distinct bugs — one for each environment.

---

Hi! Posting two related bugs we hit on EigenCompute + EigenAI today. Both blocking AI Gateway use for our preview project. Wallet `0x41a0d3f57FC0658E5250Ad5638908EA0914263F9`, project: bug-bounty broker for the May 12 Demo Day.

**Bug 1 — sepolia (prod) AI Gateway rejects KMS-issued JWTs**

App `0x7F55207baD0c224D92524BFCD2552c5893Dd7a98` deployed via verifiable build (commit `ff10b84f`, image digest `sha256:7f678127518ca8eac261acf9435c10123fe9e10d2db2404632a12bc1748f8ea0`, registry `docker.io/eigenlayer/eigencloud-containers`). Using `@layr-labs/ai-gateway-provider@1.0.1` with the auto-injected `KMS_SERVER_URL` and `KMS_PUBLIC_KEY`. Live attestation flow runs cleanly — `/v1/bound_evidence called` shows in logs, KMS returns a JWT, our SDK verifies the KMS response signature successfully.

When the provider POSTs the JWT to `https://ai-gateway.eigencloud.xyz/v1/chat/completions` (or `ai-gateway-dev.eigencloud.xyz`), both gateways return:

```
401: invalid token: token signature is invalid: crypto/rsa: verification error
```

Same error from both gateway hostnames. Reads like a keypair mismatch between the sepolia-prod KMS (signing the JWT) and what either gateway has loaded for RSA verification. Verified with `DEBUG=true` mode that the provider is calling the right URL with the right Authorization header.

**Bug 2 — sepolia-dev userapi /builds endpoint fails to parse our subscription**

Installed the dev-tagged CLI (`@layr-labs/ecloud-cli@dev`, `1.0.0-devep1`). `ecloud billing status --environment sepolia-dev` shows the subscription as `✓ Active`. But any deploy to sepolia-dev hits:

```
Error: BuildAPI request failed: 500
https://userapi-compute-sepolia-dev.eigencloud.xyz/builds
{"error":"Failed to verify subscription: Failed to parse subscription response:
error decoding response body: missing field `cancelAtPeriodEnd` at line 1
column 188: missing field `cancelAtPeriodEnd` at line 1 column 188"}
```

Looks like the dev userapi's Stripe-response struct is out of sync with whatever the billing service is returning now — a JSON field rename or removal. Affects both `--verifiable --repo --commit` (calls `/builds`) and `--verifiable --image-ref <existing-image>` (calls `/builds/verify/:digest`, returns `404 Build not found` because builds are env-scoped).

**Asks**

For (1), is there a way to get a `KMS_AUTH_JWT` issued by hand for sepolia-prod that we can use as an env-var override? Or is there a fix coming for the gateway-side key?

For (2), fixing the parser in the dev userapi would unblock anyone migrating to sepolia-dev.

Happy to share full app logs, the provider's verbose debug output, or repro steps. Workaround for now: we're running with a stubbed CVSS score for the demo and disclosing this honestly in the UI.

Thanks 🙏
