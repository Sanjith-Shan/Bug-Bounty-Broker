"""TEE-sealed wallet. The mnemonic is injected as `MNEMONIC` by EigenCompute and
exists only in encrypted enclave memory."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from eth_account import Account
from eth_account.messages import encode_defunct
from eth_account.signers.local import LocalAccount

from ..config import get_settings

# Required to use mnemonic-based key derivation in eth-account.
Account.enable_unaudited_hdwallet_features()


@lru_cache(maxsize=1)
def _account() -> LocalAccount:
    s = get_settings()
    if not s.MNEMONIC:
        raise RuntimeError("MNEMONIC is not set. Inside EigenCompute it is auto-injected.")
    return Account.from_mnemonic(s.MNEMONIC)


def agent_address() -> str:
    return _account().address


def canonical_json(data: dict[str, Any]) -> str:
    """Stable, byte-identical JSON. The frontend MUST use the same encoding."""
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def sign_attestation(data: dict[str, Any]) -> tuple[str, str]:
    """Returns (canonical_message, signature_hex_with_0x)."""
    msg = canonical_json(data)
    signed = _account().sign_message(encode_defunct(text=msg))
    sig = signed.signature.hex()
    return msg, sig if sig.startswith("0x") else "0x" + sig


def sign_message(text: str) -> str:
    signed = _account().sign_message(encode_defunct(text=text))
    sig = signed.signature.hex()
    return sig if sig.startswith("0x") else "0x" + sig
