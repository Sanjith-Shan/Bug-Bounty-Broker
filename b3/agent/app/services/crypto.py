"""Encryption helpers for storing the PoC at rest inside the TEE.

The TEE memory is already encrypted (AES-XTS-128 by Intel TDX), but we add a
second layer derived from the MNEMONIC so the SQLite blob is unintelligible
without the wallet — useful if a host operator obtains a memory snapshot.
"""

from __future__ import annotations

import os
from functools import lru_cache
from hashlib import sha256

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..config import get_settings

NONCE_LEN = 12


@lru_cache(maxsize=1)
def _key() -> bytes:
    s = get_settings()
    if not s.MNEMONIC:
        raise RuntimeError("MNEMONIC required for at-rest encryption")
    # Domain-separated derivation; not the wallet key itself.
    return sha256(b"B3_BLOB_ENC_v1\x00" + s.MNEMONIC.encode("utf-8")).digest()


def seal(plaintext: bytes) -> bytes:
    aes = AESGCM(_key())
    nonce = os.urandom(NONCE_LEN)
    ct = aes.encrypt(nonce, plaintext, associated_data=b"b3-poc")
    return nonce + ct


def unseal(blob: bytes) -> bytes:
    aes = AESGCM(_key())
    nonce, ct = blob[:NONCE_LEN], blob[NONCE_LEN:]
    return aes.decrypt(nonce, ct, associated_data=b"b3-poc")
