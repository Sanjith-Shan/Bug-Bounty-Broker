from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import db
from ..config import get_settings
from ..models import ReportResponse
from ..services import crypto
from ..services.escrow import check_deposit, transfer_usdc

router = APIRouter(tags=["payments"])


@router.post("/deposit/{attestation_id}")
async def confirm_deposit(attestation_id: str):
    r = db.get_attestation(attestation_id)
    if not r:
        raise HTTPException(status_code=404, detail="attestation not found")
    if r["deposit_status"] == "paid":
        return {"status": "paid", "deposit_tx": r["deposit_tx"], "payout_tx": r["payout_tx"]}

    chain_id = r["chain_id"]
    expected = float(r["bounty_amount_usd"])
    if expected <= 0:
        raise HTTPException(status_code=400, detail="bounty amount is zero for this severity tier")

    check = await check_deposit(chain_id, expected)
    if not check.found:
        raise HTTPException(
            status_code=402,  # Payment Required — deliberate; the x402 layer will mirror this.
            detail={
                "error": "no matching deposit found yet",
                "expected_amount_usd": expected,
                "deposit_to":          r.get("deposit_to") or _agent_address_safe(),
                "chain_id":            chain_id,
            },
        )

    # Mark deposit confirmed + release report (caller will GET /report next).
    db.update_deposit_status(attestation_id, "confirmed", deposit_tx=check.tx_hash)

    # Pay the researcher (bounty amount minus fee).
    s = get_settings()
    fee_bps = s.FEE_BPS_PUBLIC
    payout = expected * (10_000 - fee_bps) / 10_000
    try:
        payout_tx = await transfer_usdc(chain_id, r["researcher_address"], payout)
        db.update_deposit_status(attestation_id, "paid", deposit_tx=check.tx_hash, payout_tx=payout_tx)
    except Exception as e:
        # Keep status=confirmed so a retry can succeed. Surface the error.
        raise HTTPException(status_code=500, detail=f"payout failed: {e}") from e

    return {
        "status": "paid",
        "deposit_tx":  check.tx_hash,
        "payout_tx":   payout_tx,
        "payout_usd":  round(payout, 2),
        "fee_usd":     round(expected - payout, 2),
    }


@router.get("/report/{attestation_id}", response_model=ReportResponse)
def get_report(attestation_id: str) -> ReportResponse:
    r = db.get_attestation(attestation_id)
    if not r:
        raise HTTPException(status_code=404, detail="attestation not found")
    if r["deposit_status"] == "pending":
        raise HTTPException(
            status_code=402,
            detail="deposit not confirmed — call POST /deposit/{id} after sending USDC.",
        )
    poc = crypto.unseal(r["poc_blob"]).decode("utf-8")
    return ReportResponse(
        attestation_id=attestation_id,
        poc_solidity=poc,
        forge_output=r["forge_output"],
        funds_at_risk_usd=r["funds_at_risk_usd"],
        severity=r["severity"],
    )


def _agent_address_safe() -> str:
    try:
        from ..services import signer
        return signer.agent_address()
    except Exception:
        return ""
