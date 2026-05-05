from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from .. import db
from ..models import BountyProgram, BountyProgramIn

router = APIRouter(prefix="/bounties", tags=["bounties"])


@router.post("", response_model=BountyProgram)
def create_program(body: BountyProgramIn) -> BountyProgram:
    program_id = uuid.uuid4().hex
    created_at = datetime.now(timezone.utc).isoformat()
    row = {
        "id": program_id,
        **body.model_dump(),
        "severity_tiers": [t.model_dump() for t in body.severity_tiers],
        "created_at": created_at,
    }
    db.insert_program(row)
    return BountyProgram(id=program_id, created_at=datetime.fromisoformat(created_at), **body.model_dump())


@router.get("", response_model=list[BountyProgram])
def list_programs() -> list[BountyProgram]:
    return [
        BountyProgram(
            id=r["id"], name=r["name"], company=r["company"],
            target_contract=r["target_contract"], chain_id=r["chain_id"],
            severity_tiers=r["severity_tiers"], contact=r["contact"],
            created_at=datetime.fromisoformat(r["created_at"]),
        )
        for r in db.list_programs()
    ]


@router.get("/{program_id}", response_model=BountyProgram)
def get_program(program_id: str) -> BountyProgram:
    r = db.get_program(program_id)
    if not r:
        raise HTTPException(status_code=404, detail="program not found")
    return BountyProgram(
        id=r["id"], name=r["name"], company=r["company"],
        target_contract=r["target_contract"], chain_id=r["chain_id"],
        severity_tiers=r["severity_tiers"], contact=r["contact"],
        created_at=datetime.fromisoformat(r["created_at"]),
    )
