#!/usr/bin/env bash
# Bring up the local Anvil chain that the deployed TEE forks via tunnel.sh.
#
# What this does, in order:
#   1. Starts `anvil` on :8545 with chain id 84532 (Base Sepolia), so the
#      deployed agent's `forge test --fork-url <tunnel>` sees a chain that
#      claims to be Base Sepolia.
#   2. Deploys VulnerableVault from default Anvil account #0 (nonce 0)
#      → ends up at 0x5FbDB2315678afecb367f032d93F642f64180aa3, which is
#      what the bounty program created on the deployed agent points at.
#   3. Deploys MockUSDC from the same account (nonce 1)
#      → ends up at 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512, matching
#      MOCK_USDC_ADDRESS in agent/.env.production.
#   4. Funds the agent wallet (TEE-derived) with 10 ETH so it can pay gas
#      when it sends researcher payouts.
#   5. Mints 1,000,000 MockUSDC to the "company" wallet so it can deposit.
#   6. Mints 50 MockUSDC to the agent so the payout transfer itself works
#      end-to-end immediately.
#
# Usage:
#   ./scripts/local-chain.sh                 # starts anvil + deploys + funds
#   ANVIL_PORT=8546 ./scripts/local-chain.sh # custom port
#
# Stop: Ctrl+C (anvil terminates; state is in-memory, no cleanup needed).

set -euo pipefail

ANVIL_PORT="${ANVIL_PORT:-8545}"
CHAIN_ID="${CHAIN_ID:-84532}"

# These match agent/.env.production. Changing the deploy order or accounts
# changes the deterministic addresses, so don't reorder steps below.
EXPECTED_VAULT=0x5FbDB2315678afecb367f032d93F642f64180aa3
EXPECTED_USDC=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

# Anvil default account #0 (used for all deploys + minting):
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Default Anvil accounts we use as roles in the demo flow:
COMPANY=0x70997970C51812dc3A010C7d01b50e0d17dc79C8       # account #1
RESEARCHER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC    # account #2

# The TEE agent wallet, derived from EigenCompute-injected MNEMONIC. Hard-coded
# here because it's stable across image upgrades and we can't read it locally.
AGENT_WALLET=0xdEAC29fA10B319C5002274450cdC09aD23A3bd7d

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)/agent"

trap 'echo; echo "[local-chain] shutting down"; jobs -p | xargs -r kill 2>/dev/null; exit 0' INT TERM

echo "==> Starting anvil on :${ANVIL_PORT} (chain id ${CHAIN_ID})…"
anvil --port "${ANVIL_PORT}" --chain-id "${CHAIN_ID}" --silent &
ANVIL_PID=$!

# Wait until anvil is RPC-responsive.
for _ in $(seq 1 30); do
  if curl -s -o /dev/null -X POST "http://127.0.0.1:${ANVIL_PORT}" \
       -H 'content-type: application/json' \
       -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'; then
    break
  fi
  sleep 0.2
done
echo "    anvil pid=${ANVIL_PID}"

cd "${AGENT_DIR}"

echo "==> Deploying VulnerableVault (nonce 0)…"
forge create --rpc-url "http://127.0.0.1:${ANVIL_PORT}" \
    --private-key "${DEPLOYER_PK}" \
    --broadcast \
    contracts/VulnerableVault.sol:VulnerableVault \
    | tee /tmp/b3-deploy-vault.log
grep -i "Deployed to" /tmp/b3-deploy-vault.log

echo "==> Deploying MockUSDC (nonce 1)…"
forge create --rpc-url "http://127.0.0.1:${ANVIL_PORT}" \
    --private-key "${DEPLOYER_PK}" \
    --broadcast \
    contracts/MockUSDC.sol:MockUSDC \
    | tee /tmp/b3-deploy-usdc.log
grep -i "Deployed to" /tmp/b3-deploy-usdc.log

echo "==> Funding TEE agent wallet ${AGENT_WALLET} with 10 ETH for gas…"
cast send --rpc-url "http://127.0.0.1:${ANVIL_PORT}" \
    --private-key "${DEPLOYER_PK}" \
    --value 10ether \
    "${AGENT_WALLET}" \
    > /dev/null

echo "==> Minting 1,000,000 MockUSDC to company ${COMPANY}…"
cast send --rpc-url "http://127.0.0.1:${ANVIL_PORT}" \
    --private-key "${DEPLOYER_PK}" \
    "${EXPECTED_USDC}" \
    "mint(address,uint256)" "${COMPANY}" "1000000000000" \
    > /dev/null

echo "==> Minting 50 MockUSDC to agent ${AGENT_WALLET} (seeds payout liquidity)…"
cast send --rpc-url "http://127.0.0.1:${ANVIL_PORT}" \
    --private-key "${DEPLOYER_PK}" \
    "${EXPECTED_USDC}" \
    "mint(address,uint256)" "${AGENT_WALLET}" "50000000" \
    > /dev/null

echo
echo "==> Ready."
echo "    Vault:       ${EXPECTED_VAULT}"
echo "    USDC:        ${EXPECTED_USDC}"
echo "    Company:     ${COMPANY}  (1,000,000 USDC)"
echo "    Researcher:  ${RESEARCHER}"
echo "    Agent:       ${AGENT_WALLET}  (10 ETH, 50 USDC)"
echo
echo "Next: in another terminal, run ./scripts/tunnel.sh to expose this chain"
echo "to the deployed TEE. Then submit a PoC at http://localhost:5173 (frontend)"
echo "or via scripts/demo.sh."

wait "${ANVIL_PID}"
