# Deploying B³ to EigenCompute

## 0. Prereqs

- Docker (running locally for image build).
- `npm install -g @layr-labs/ecloud-cli@latest` (≥ v0.5.0 as of Apr 23 2026).
- An EigenAI API key (`eai_...`) and at least one funded chain RPC (Base Sepolia is the
  demo target; Alchemy / Infura / public RPC all work).
- A custom domain you can point at the deployed TEE for TLS.

## 1. One-time auth + billing

```bash
ecloud auth generate --store              # stores key in OS keyring
ecloud auth whoami
ecloud billing subscribe                  # uses Demo Day credit ($500 → $1500)
```

## 2. Create the app shell

```bash
cd b3/agent
ecloud compute app create --name b3-agent --language typescript
# (the --language flag only seeds a template; the actual code is the existing FastAPI app)
```

## 3. Configure `.env`

Copy `.env.example` to `.env` and fill in:

- `EIGENAI_API_KEY` — sealed, never leaves the enclave.
- `BASE_SEPOLIA_RPC_URL` and any other RPCs B³ should support.
- `AGENT_ADDRESS_PUBLIC` — set after first deploy from `ecloud compute app info`.
- `APP_DIGEST_PUBLIC` — set after first deploy (the digest is what the on-chain registry
  binds to the wallet).

`MNEMONIC` is auto-injected by EigenCompute — do NOT set it in production.

## 4. Build + deploy

```bash
ecloud compute app deploy
ecloud compute app info        # note the public IP and agent address
ecloud compute app logs --watch
```

`ecloud compute app deploy` builds the Docker image, encrypts the `.env` with the Eigen
KMS, uploads, and starts the TEE.

## 5. Hook up TLS

```bash
ecloud compute app configure tls
# you'll be prompted for your domain; create the DNS A record it tells you to.
```

The Caddyfile inside the container will provision a Let's Encrypt cert on first hit. Once
it's live, `https://<your-domain>/health` should return:

```json
{
  "status": "ok",
  "agent_address": "0x...",
  "app_digest": "sha256:...",
  "supported_chains": [1, 8453, 84532, 137],
  "fee_bps": 500,
  "domain": "<your-domain>"
}
```

## 6. Update `_PUBLIC` envs

After the first deploy, fill in `AGENT_ADDRESS_PUBLIC` and `APP_DIGEST_PUBLIC` in `.env`,
then:

```bash
ecloud compute app upgrade b3-agent
```

## 7. Frontend

The frontend is a static Vite build and can be hosted anywhere. For Demo Day we host it
behind the same TEE domain by uploading `frontend/dist/` to EigenCompute as a second app
or by serving it from the FastAPI backend with `StaticFiles`.

```bash
cd b3/frontend
VITE_API_URL=https://<your-domain> npm run build
# serve dist/ from the FastAPI app or from any static host.
```

## 8. Demo-day checklist

- [ ] At least one bounty program registered (POST `/bounties`).
- [ ] `VulnerableVault` deployed to Base Sepolia, address noted.
- [ ] Pre-built PoC test (`exploits/ExploitVault.t.sol`) ready to paste into the Submit form.
- [ ] A Base Sepolia wallet funded with ~$200 test USDC for the deposit demo.
- [ ] `/verify/<id>` page tested in the browser with a real attestation — signer recovered,
      digest matches, all checks green.
- [ ] Backup video recording of the full flow (in case live RPCs flake during the pitch).
