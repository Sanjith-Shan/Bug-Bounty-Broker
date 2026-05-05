from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- sealed (TEE-only) ---
    # AI Gateway — see docs/eigencloud-platform.md §2 for full details.
    EIGEN_GATEWAY_URL: str = "https://ai-gateway-dev.eigencloud.xyz"
    EIGEN_MODEL: str = "anthropic/claude-sonnet-4.6"
    EIGEN_SEED: int = 42
    # Local-dev JWT (Bearer auth). Inside EigenCompute, the inference sidecar
    # falls back to /run/container_launcher/attestation_verifier_claims_token.
    KMS_AUTH_JWT: str = Field(default="")
    # Local-dev only: skip the AI Gateway call and return a hard-coded severity.
    # Inside EigenCompute we leave this unset so real inference runs.
    EIGEN_STUB_SEVERITY: bool = False

    MNEMONIC: str = Field(default="")

    MAINNET_RPC_URL: str = ""
    BASE_RPC_URL: str = ""
    BASE_SEPOLIA_RPC_URL: str = ""
    POLYGON_RPC_URL: str = ""

    DB_PATH: str = "/app/data/b3.db"
    WORK_DIR: str = "/app/work"

    # --- public (visible to clients via /health, /verify) ---
    AGENT_ADDRESS_PUBLIC: str = ""
    APP_DIGEST_PUBLIC: str = "sha256:local-dev"
    SUPPORTED_CHAINS_PUBLIC: str = "1,8453,84532,137"
    FEE_BPS_PUBLIC: int = 500  # 5%

    DOMAIN: str = ""
    APP_PORT: int = 3000

    # Local-dev only: override the USDC contract address used for a given chain.
    # When empty, the canonical address from escrow.USDC_BY_CHAIN is used.
    MOCK_USDC_ADDRESS: str = ""
    MOCK_USDC_CHAIN_ID: int = 84532

    @property
    def supported_chains(self) -> List[int]:
        return [int(c.strip()) for c in self.SUPPORTED_CHAINS_PUBLIC.split(",") if c.strip()]

    def rpc_for_chain(self, chain_id: int) -> str:
        return {
            1: self.MAINNET_RPC_URL,
            8453: self.BASE_RPC_URL,
            84532: self.BASE_SEPOLIA_RPC_URL,
            137: self.POLYGON_RPC_URL,
        }.get(chain_id, "")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    s = Settings()
    os.makedirs(os.path.dirname(s.DB_PATH), exist_ok=True)
    os.makedirs(s.WORK_DIR, exist_ok=True)
    return s
