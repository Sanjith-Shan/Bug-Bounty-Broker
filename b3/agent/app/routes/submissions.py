from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException

from .. import db
from ..config import get_settings
from ..models import Severity, SubmissionIn
from ..services import crypto, signer
from ..services.exploit_verifier import verify_exploit
from ..services.severity_assessor import assess_severity

router = APIRouter(tags=["submissions"])


def _bounty_amount_for_severity(program: dict[str, Any], severity: Severity) -> float:
    for tier in program["severity_tiers"]:
        if tier["severity"] == severity:
            return float(tier["max_payout_usd"])
    return 0.0


@router.post("/submit")
async def submit(body: SubmissionIn):
    s = get_settings()
    program = db.get_program(body.program_id)
    if not program:
        raise HTTPException(status_code=404, detail="program not found")

    if body.chain_id not in s.supported_chains:
        raise HTTPException(status_code=400, detail=f"chain_id {body.chain_id} not supported")

    if body.target_contract.lower() != program["target_contract"].lower():
        raise HTTPException(status_code=400, detail="target_contract mismatch with program")

    # 1. Run the exploit inside the TEE (forge test --fork-url).
    try:
        verification = await verify_exploit(
            poc_solidity=body.poc_solidity,
            chain_id=body.chain_id,
            fork_block=body.fork_block,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"exploit verification failed: {e}") from e

    if not verification.exploit_verified:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "exploit did not verify",
                "forge_stdout_tail": verification.forge_stdout[-2000:],
                "forge_stderr_tail": verification.forge_stderr[-2000:],
            },
        )

    # 2. Score severity via EigenAI (deterministic).
    sev = await assess_severity(
        exploit_output=verification.forge_stdout[-4000:],
        contract_source=body.notes or "",  # v1: researcher can supply contract source in notes
        target_contract=body.target_contract,
        chain_id=body.chain_id,
        funds_at_risk_wei=verification.funds_at_risk_wei,
        funds_at_risk_usd=verification.funds_at_risk_usd,
    )

    # 3. Build canonical attestation data and sign with the TEE wallet.
    attestation_id = uuid.uuid4().hex
    timestamp = datetime.now(timezone.utc).isoformat()
    data = {
        "attestation_id":    attestation_id,
        "program_id":        body.program_id,
        "target_contract":   body.target_contract,
        "chain_id":          body.chain_id,
        "severity":          sev.severity,
        # Numeric values quoted as strings for stable cross-language canonicalization.
        "cvss_score":        f"{sev.cvss_score:.1f}",
        "funds_at_risk_usd": f"{verification.funds_at_risk_usd:.2f}",
        "exploit_verified":  True,
        "verification_block": verification.verification_block,
        "eigenai_model":     sev.eigenai_model,
        "app_digest":        s.APP_DIGEST_PUBLIC,
        "timestamp":         timestamp,
    }
    canonical, agent_sig = signer.sign_attestation(data)

    # 4. Persist (PoC sealed at rest).
    bounty_amount = _bounty_amount_for_severity(program, sev.severity)  # type: ignore[arg-type]
    db.insert_attestation({
        **{k: v for k, v in data.items()},
        "id":                 attestation_id,
        "eigenai_signature":  sev.eigenai_signature,
        "agent_signature":    agent_sig,
        "canonical_message":  canonical,
        "eigenai_request":    sev.request_messages,
        "eigenai_response":   sev.response_messages,
        "eigenai_chain_id":   sev.eigenai_chain_id,
        "created_at":         timestamp,
        "poc_blob":           crypto.seal(body.poc_solidity.encode("utf-8")),
        "forge_output":       verification.forge_stdout,
        "researcher_address": body.researcher_address,
        "bounty_amount_usd":  bounty_amount,
    })

    # 5. Public response: severity & funds-at-risk only (NO exploit details).
    return {
        "attestation_id":   attestation_id,
        "severity":         sev.severity,
        "cvss_score":       round(sev.cvss_score, 1),
        "funds_at_risk_usd": verification.funds_at_risk_usd,
        "bounty_amount_usd": bounty_amount,
        "agent_address":    signer.agent_address(),
        "deposit_to":       signer.agent_address(),
        "deposit_chain_id": body.chain_id,
        "instructions":     "Verify the attestation publicly, then deposit USDC to the agent address to unlock the report.",
    }
