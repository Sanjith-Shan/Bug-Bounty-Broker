from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from .. import db
from ..config import get_settings
from ..models import Attestation, AttestationData, VerifyResponse
from ..services import signer
from ..services.severity_assessor import build_eigenai_verification_message

router = APIRouter(tags=["attestations"])


def _row_to_attestation(r: dict) -> Attestation:
    data = AttestationData(
        attestation_id=r["id"],
        program_id=r["program_id"],
        target_contract=r["target_contract"],
        chain_id=r["chain_id"],
        severity=r["severity"],
        cvss_score=f"{r['cvss_score']:.1f}",
        funds_at_risk_usd=f"{r['funds_at_risk_usd']:.2f}",
        exploit_verified=bool(r["exploit_verified"]),
        verification_block=r["verification_block"],
        eigenai_model=r["eigenai_model"],
        app_digest=r["app_digest"],
        timestamp=r["created_at"],
    )
    return Attestation(
        data=data,
        eigenai_signature=r["eigenai_signature"],
        agent_signature=r["agent_signature"],
    )


@router.get("/attestations/{attestation_id}", response_model=Attestation)
def get_attestation(attestation_id: str) -> Attestation:
    r = db.get_attestation(attestation_id)
    if not r:
        raise HTTPException(status_code=404, detail="attestation not found")
    return _row_to_attestation(r)


@router.get("/verify/{attestation_id}", response_model=VerifyResponse)
def verify_attestation(attestation_id: str) -> VerifyResponse:
    r = db.get_attestation(attestation_id)
    if not r:
        raise HTTPException(status_code=404, detail="attestation not found")

    att = _row_to_attestation(r)
    req_messages = json.loads(r["eigenai_request"])
    res_messages = json.loads(r["eigenai_response"])
    eai_msg = build_eigenai_verification_message(
        req_messages, res_messages, r["eigenai_model"], r["eigenai_chain_id"],
    )

    s = get_settings()
    return VerifyResponse(
        attestation=att,
        canonical_message=r["canonical_message"],
        expected_signer=signer.agent_address(),
        eigenai_request_messages=[m.get("content", "") for m in req_messages],
        eigenai_response_messages=[m.get("content", "") for m in res_messages],
        eigenai_chain_id=r["eigenai_chain_id"],
        instructions=(
            "Recover the agent signer with `ethers.verifyMessage(canonical_message, agent_signature)` "
            "and confirm it equals expected_signer (also published in the EigenCompute on-chain "
            "registry under app_digest=" + s.APP_DIGEST_PUBLIC + "). Verify the EigenAI signature "
            "by recovering the signer of "
            "concat(eigenai_request_messages) + concat(eigenai_response_messages) + eigenai_model "
            "+ eigenai_chain_id, then matching it to the EigenAI Operator key in the KeyRegistrar contract."
        ),
    )
