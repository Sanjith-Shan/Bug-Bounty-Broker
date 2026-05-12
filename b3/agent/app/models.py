from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]


# ---------- Bounty programs ----------


class SeverityTier(BaseModel):
    severity: Severity
    max_payout_usd: float


class BountyProgramIn(BaseModel):
    name: str
    company: str
    target_contract: str
    chain_id: int
    severity_tiers: List[SeverityTier]
    contact: Optional[str] = None


class BountyProgram(BountyProgramIn):
    id: str
    created_at: datetime


# ---------- Submissions ----------


class SubmissionIn(BaseModel):
    program_id: str
    target_contract: str
    chain_id: int
    fork_block: Optional[int] = None
    researcher_address: str = Field(..., description="EVM address to receive bounty payout")
    # Researcher submits a Foundry test file as a string (encrypted to agent's pubkey in v1.1)
    poc_solidity: str = Field(..., description="Foundry test source for the PoC")
    notes: Optional[str] = None


# ---------- Attestation core ----------


class AttestationData(BaseModel):
    """The canonical, signed payload. JSON.dumps(sort_keys=True, separators) is the message.

    All numeric fields are encoded as strings so the byte-level canonical encoding is
    identical between Python's json.dumps and JavaScript's JSON.stringify (which would
    otherwise drop trailing zeros, e.g. 9.0 → 9, 500000.0 → 500000).
    """

    attestation_id: str
    program_id: str
    target_contract: str
    chain_id: int
    severity: Severity
    cvss_score: str               # e.g. "9.1"
    funds_at_risk_usd: str        # e.g. "500000.00"
    exploit_verified: bool
    verification_block: int
    eigenai_model: str
    app_digest: str
    timestamp: str  # ISO-8601 UTC


class Attestation(BaseModel):
    data: AttestationData
    eigenai_signature: str  # 0x + hex
    agent_signature: str    # 0x + hex


# ---------- Public response shapes ----------


class HealthResponse(BaseModel):
    status: str
    agent_address: str
    app_digest: str
    app_id: Optional[str] = None
    app_registry_chain_id: int = 11155111
    supported_chains: List[int]
    fee_bps: int
    domain: Optional[str] = None


class VerifyResponse(BaseModel):
    attestation: Attestation
    canonical_message: str
    expected_signer: str
    eigenai_request_messages: List[str]
    eigenai_response_messages: List[str]
    eigenai_chain_id: int
    instructions: str


class ReportResponse(BaseModel):
    attestation_id: str
    poc_solidity: str
    forge_output: str
    funds_at_risk_usd: float
    severity: Severity
