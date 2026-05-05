from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from .config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS bounty_programs (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    company         TEXT NOT NULL,
    target_contract TEXT NOT NULL,
    chain_id        INTEGER NOT NULL,
    severity_tiers  TEXT NOT NULL,        -- JSON
    contact         TEXT,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attestations (
    id                  TEXT PRIMARY KEY,
    program_id          TEXT NOT NULL,
    target_contract     TEXT NOT NULL,
    chain_id            INTEGER NOT NULL,
    severity            TEXT NOT NULL,
    cvss_score          REAL NOT NULL,
    funds_at_risk_usd   REAL NOT NULL,
    exploit_verified    INTEGER NOT NULL,
    verification_block  INTEGER NOT NULL,
    eigenai_model       TEXT NOT NULL,
    eigenai_signature   TEXT NOT NULL,
    agent_signature     TEXT NOT NULL,
    canonical_message   TEXT NOT NULL,
    eigenai_request     TEXT NOT NULL,    -- JSON: messages array
    eigenai_response    TEXT NOT NULL,    -- JSON: choices array
    eigenai_chain_id    INTEGER NOT NULL,
    app_digest          TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    -- Sealed payload, only released after deposit
    poc_blob            BLOB NOT NULL,
    forge_output        TEXT NOT NULL,
    researcher_address  TEXT NOT NULL,
    bounty_amount_usd   REAL NOT NULL,
    deposit_status      TEXT NOT NULL DEFAULT 'pending',  -- pending|confirmed|paid
    deposit_tx          TEXT,
    payout_tx           TEXT
);

CREATE INDEX IF NOT EXISTS idx_attestations_program ON attestations(program_id);
CREATE INDEX IF NOT EXISTS idx_attestations_status  ON attestations(deposit_status);
"""


@contextmanager
def conn() -> Iterator[sqlite3.Connection]:
    s = get_settings()
    c = sqlite3.connect(s.DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db() -> None:
    with conn() as c:
        c.executescript(SCHEMA)


def insert_program(row: dict[str, Any]) -> None:
    with conn() as c:
        c.execute(
            """INSERT INTO bounty_programs
                (id, name, company, target_contract, chain_id, severity_tiers, contact, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                row["id"], row["name"], row["company"], row["target_contract"],
                row["chain_id"], json.dumps(row["severity_tiers"]), row.get("contact"),
                row["created_at"],
            ),
        )


def list_programs() -> list[dict[str, Any]]:
    with conn() as c:
        rows = c.execute("SELECT * FROM bounty_programs ORDER BY created_at DESC").fetchall()
    return [_row_to_program(r) for r in rows]


def get_program(program_id: str) -> Optional[dict[str, Any]]:
    with conn() as c:
        r = c.execute("SELECT * FROM bounty_programs WHERE id = ?", (program_id,)).fetchone()
    return _row_to_program(r) if r else None


def _row_to_program(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"], "name": r["name"], "company": r["company"],
        "target_contract": r["target_contract"], "chain_id": r["chain_id"],
        "severity_tiers": json.loads(r["severity_tiers"]),
        "contact": r["contact"], "created_at": r["created_at"],
    }


def insert_attestation(row: dict[str, Any]) -> None:
    with conn() as c:
        c.execute(
            """INSERT INTO attestations
                (id, program_id, target_contract, chain_id, severity, cvss_score,
                 funds_at_risk_usd, exploit_verified, verification_block,
                 eigenai_model, eigenai_signature, agent_signature, canonical_message,
                 eigenai_request, eigenai_response, eigenai_chain_id, app_digest, created_at,
                 poc_blob, forge_output, researcher_address, bounty_amount_usd)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                row["id"], row["program_id"], row["target_contract"], row["chain_id"],
                row["severity"], row["cvss_score"], row["funds_at_risk_usd"],
                int(row["exploit_verified"]), row["verification_block"],
                row["eigenai_model"], row["eigenai_signature"], row["agent_signature"],
                row["canonical_message"], json.dumps(row["eigenai_request"]),
                json.dumps(row["eigenai_response"]), row["eigenai_chain_id"],
                row["app_digest"], row["created_at"],
                row["poc_blob"], row["forge_output"],
                row["researcher_address"], row["bounty_amount_usd"],
            ),
        )


def get_attestation(attestation_id: str) -> Optional[dict[str, Any]]:
    with conn() as c:
        r = c.execute("SELECT * FROM attestations WHERE id = ?", (attestation_id,)).fetchone()
    return dict(r) if r else None


def update_deposit_status(
    attestation_id: str, status: str,
    deposit_tx: Optional[str] = None, payout_tx: Optional[str] = None,
) -> None:
    with conn() as c:
        c.execute(
            """UPDATE attestations
               SET deposit_status = ?,
                   deposit_tx = COALESCE(?, deposit_tx),
                   payout_tx  = COALESCE(?, payout_tx)
               WHERE id = ?""",
            (status, deposit_tx, payout_tx, attestation_id),
        )
