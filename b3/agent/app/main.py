from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import get_settings
from .models import HealthResponse
from .routes import attestations, bounties, payments, submissions
from .services import signer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("b3")

app = FastAPI(
    title="B³ — Bug Bounty Broker",
    description=(
        "Sovereign agent on EigenCompute that verifies smart-contract vulnerabilities "
        "without revealing them, scores severity deterministically with EigenAI, and "
        "gates report release on USDC deposit."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    db.init_db()
    s = get_settings()
    try:
        addr = signer.agent_address()
        log.info("Agent wallet address: %s", addr)
    except Exception as e:
        log.warning("MNEMONIC unavailable, signing disabled: %s", e)
    log.info("App digest: %s | supported chains: %s", s.APP_DIGEST_PUBLIC, s.supported_chains)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    s = get_settings()
    try:
        addr = signer.agent_address()
    except Exception:
        addr = s.AGENT_ADDRESS_PUBLIC or ""
    return HealthResponse(
        status="ok",
        agent_address=addr,
        app_digest=s.APP_DIGEST_PUBLIC,
        supported_chains=s.supported_chains,
        fee_bps=s.FEE_BPS_PUBLIC,
        domain=s.DOMAIN or None,
    )


app.include_router(bounties.router)
app.include_router(submissions.router)
app.include_router(attestations.router)
app.include_router(payments.router)
