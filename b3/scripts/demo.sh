#!/usr/bin/env bash
# B³ end-to-end demo against a locally running agent.
#
# Prereqs:
#   - uvicorn running on :3000 (cd b3/agent && uvicorn app.main:app --reload --port 3000)
#   - Foundry installed (forge --version)
#   - jq installed (brew install jq)

set -euo pipefail

API="${API:-http://localhost:3000}"
POC_FILE="${POC_FILE:-$(dirname "$0")/../agent/exploits/ExploitVault.t.sol}"
TARGET="${TARGET:-0x000000000000000000000000000000000000C0FE}"
CHAIN_ID="${CHAIN_ID:-84532}"
RESEARCHER="${RESEARCHER:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"

echo "==> 1. Health check"
curl -s "$API/health" | jq

echo
echo "==> 2. Create bounty program"
PROGRAM_ID=$(curl -s -X POST "$API/bounties" \
  -H "content-type: application/json" \
  -d "$(cat <<JSON
{
  "name": "Vault Reentrancy Demo",
  "company": "AcmeFi",
  "target_contract": "$TARGET",
  "chain_id": $CHAIN_ID,
  "severity_tiers": [
    {"severity": "CRITICAL", "max_payout_usd": 500000},
    {"severity": "HIGH",     "max_payout_usd": 100000},
    {"severity": "MEDIUM",   "max_payout_usd":  20000},
    {"severity": "LOW",      "max_payout_usd":   1000},
    {"severity": "INFO",     "max_payout_usd":      0}
  ],
  "contact": "security@acmefi.example"
}
JSON
)" | jq -r .id)
echo "program_id=$PROGRAM_ID"

echo
echo "==> 3. Submit PoC ($POC_FILE)"
POC_JSON=$(jq -Rs . < "$POC_FILE")
RESPONSE=$(curl -s -X POST "$API/submit" \
  -H "content-type: application/json" \
  -d "$(cat <<JSON
{
  "program_id":         "$PROGRAM_ID",
  "target_contract":    "$TARGET",
  "chain_id":           $CHAIN_ID,
  "researcher_address": "$RESEARCHER",
  "poc_solidity":       $POC_JSON,
  "notes":              "Reentrancy in VulnerableVault.withdraw — CEI violated."
}
JSON
)")
echo "$RESPONSE" | jq

ATTESTATION_ID=$(echo "$RESPONSE" | jq -r .attestation_id)

echo
echo "==> 4. Public attestation (no exploit details)"
curl -s "$API/attestations/$ATTESTATION_ID" | jq

echo
echo "==> 5. Verify payload (use this in the frontend or with ethers)"
curl -s "$API/attestations/$ATTESTATION_ID/verify" | jq '.attestation.agent_signature, .expected_signer'
