// Single source of truth for the API base URL. In dev, vite proxies /api → backend.
// In prod, set VITE_API_URL=https://b3.yourdomain.com (the EigenCompute domain).

const BASE = (import.meta.env.VITE_API_URL as string | undefined) || "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} — ${text}`);
  }
  return (await res.json()) as T;
}

export type Health = {
  status: string;
  agent_address: string;
  app_digest: string;
  supported_chains: number[];
  fee_bps: number;
  domain?: string | null;
};

export type SeverityTier = { severity: string; max_payout_usd: number };

export type Program = {
  id: string;
  name: string;
  company: string;
  target_contract: string;
  chain_id: number;
  severity_tiers: SeverityTier[];
  contact?: string | null;
  created_at: string;
};

export type AttestationData = {
  attestation_id: string;
  program_id: string;
  target_contract: string;
  chain_id: number;
  severity: string;
  // Numeric values are strings on the wire so canonical bytes match Python.
  cvss_score: string;
  funds_at_risk_usd: string;
  exploit_verified: boolean;
  verification_block: number;
  eigenai_model: string;
  app_digest: string;
  timestamp: string;
};

export type Attestation = {
  data: AttestationData;
  eigenai_signature: string;
  agent_signature: string;
};

export type VerifyResponse = {
  attestation: Attestation;
  canonical_message: string;
  expected_signer: string;
  eigenai_request_messages: string[];
  eigenai_response_messages: string[];
  eigenai_chain_id: number;
  instructions: string;
};

export type SubmitResponse = {
  attestation_id: string;
  severity: string;
  cvss_score: number;
  funds_at_risk_usd: number;
  bounty_amount_usd: number;
  agent_address: string;
  deposit_to: string;
  deposit_chain_id: number;
  instructions: string;
};

export const api = {
  health:        () => req<Health>("/health"),
  programs:      () => req<Program[]>("/bounties"),
  program:       (id: string) => req<Program>(`/bounties/${id}`),
  createProgram: (body: Omit<Program, "id" | "created_at">) =>
    req<Program>("/bounties", { method: "POST", body: JSON.stringify(body) }),
  submit:        (body: any) =>
    req<SubmitResponse>("/submit", { method: "POST", body: JSON.stringify(body) }),
  attestation:   (id: string) => req<Attestation>(`/attestations/${id}`),
  verifyData:    (id: string) => req<VerifyResponse>(`/verify/${id}`),
  confirmDeposit:(id: string) =>
    req<{ status: string; deposit_tx?: string; payout_tx?: string; payout_usd?: number; fee_usd?: number }>(
      `/deposit/${id}`, { method: "POST" }),
  report:        (id: string) =>
    req<{ attestation_id: string; poc_solidity: string; forge_output: string; funds_at_risk_usd: number; severity: string }>(
      `/report/${id}`),
};
