"""Deterministic severity assessment via the EigenCloud AI Gateway.

The gateway is OpenAI-compatible (`POST /v1/chat/completions`) but uses a
Bearer JWT issued by the TEE-attested KMS rather than a static API key. The
official client is TypeScript-only, so we spawn a small Node sidecar
(`agent/inference/index.mjs`) over stdin/stdout for each call.

Determinism: pass `seed=42` and `temperature=0.0` — the gateway guarantees
bit-identical output under the same GPU SKU. Anyone can replay the call to
re-verify the result.

Verifiability: the response body is captured in full so the verification
ceremony can recover any per-response signature the gateway returns. The byte
order of the signed message is governed by the EigenAI verify-signature spec
(see `docs/eigencloud-platform.md` §1).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List

from ..config import get_settings

SEVERITY_PROMPT = """You are a smart-contract security auditor producing CVSS 3.1 \
severity ratings for a verified exploit. Be conservative and deterministic.

Respond ONLY with a single JSON object, no prose, no markdown:
{{
  "cvss_score":        <float 0.0-10.0, 1 decimal>,
  "severity":          "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
  "attack_vector":     "NETWORK" | "ADJACENT" | "LOCAL" | "PHYSICAL",
  "funds_at_risk_wei": "<integer-as-string>",
  "reasoning":         "<<= 50 words"
}}

Rubric:
- CRITICAL (9.0-10.0): direct fund drain, privileged role takeover, unauthorized minting.
- HIGH (7.0-8.9): permanent freezing of funds, governance hijack with fund impact.
- MEDIUM (4.0-6.9): griefing with fund impact <5% of TVL, recoverable DoS.
- LOW (0.1-3.9): cosmetic, gas issues, recoverable misconfiguration.

EXPLOIT VERIFICATION OUTPUT:
{exploit_output}

TARGET CONTRACT (target_contract={target_contract}, chain_id={chain_id}):
{contract_source}

Funds-at-risk reported by the harness: {funds_wei} wei (~${funds_usd}).
"""

SIDECAR_PATH = Path(__file__).resolve().parents[2] / "inference" / "index.mjs"


@dataclass
class SeverityResult:
    cvss_score: float
    severity: str
    attack_vector: str
    funds_at_risk_wei: int
    reasoning: str

    eigenai_model: str
    eigenai_signature: str
    eigenai_chain_id: int
    request_messages: List[dict]
    response_messages: List[dict]
    raw_response_text: str
    response_body: dict


_JSON_RE = re.compile(r"\{[\s\S]*\}")


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    m = _JSON_RE.search(text)
    if not m:
        raise ValueError(f"No JSON object in gateway response: {text[:200]!r}")
    return json.loads(m.group(0))


async def _call_gateway(
    *, model: str, messages: List[dict], seed: int, max_tokens: int
) -> dict[str, Any]:
    """Spawn the inference sidecar and return its parsed JSON output."""
    if not SIDECAR_PATH.exists():
        raise RuntimeError(f"sidecar not found at {SIDECAR_PATH}")

    payload = json.dumps(
        {
            "model": model,
            "messages": messages,
            "seed": seed,
            "temperature": 0.0,
            "max_tokens": max_tokens,
        }
    ).encode("utf-8")

    proc = await asyncio.create_subprocess_exec(
        "node",
        str(SIDECAR_PATH),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ},
    )
    stdout_b, stderr_b = await proc.communicate(input=payload)
    stdout = stdout_b.decode("utf-8", errors="replace").strip()
    stderr = stderr_b.decode("utf-8", errors="replace").strip()

    if not stdout:
        raise RuntimeError(
            f"sidecar exited {proc.returncode} with no stdout. stderr={stderr[:500]!r}"
        )
    try:
        result = json.loads(stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"sidecar emitted non-JSON: {stdout[:500]!r} (stderr={stderr[:200]!r})"
        ) from e

    if not result.get("ok"):
        raise RuntimeError(f"gateway call failed: {result.get('error')}")
    return result


def _extract_signature(response_body: dict) -> tuple[str, int]:
    """Best-effort recovery of the EigenAI signature + chain_id from the gateway body.

    The exact field layout is governed by the verify-signature spec and may
    change. We try a few well-known shapes and fall back to empty strings.
    """
    sig = ""
    chain_id = 0

    # Top-level signature (older shape)
    if isinstance(response_body.get("signature"), str):
        sig = response_body["signature"]
    if isinstance(response_body.get("chain_id"), int):
        chain_id = response_body["chain_id"]
    elif isinstance(response_body.get("chainId"), int):
        chain_id = response_body["chainId"]

    # Whitepaper "receipt" shape
    receipt = response_body.get("receipt") or {}
    if not sig and isinstance(receipt.get("sig"), str):
        sig = receipt["sig"]
    if not chain_id:
        cid = receipt.get("chainid") or receipt.get("chain_id") or receipt.get("chainId")
        if isinstance(cid, int):
            chain_id = cid

    if sig and not sig.startswith("0x"):
        sig = "0x" + sig
    return sig, int(chain_id or 0)


def _stubbed_result(
    *, model: str, request_messages: List[dict], funds_at_risk_wei: int
) -> SeverityResult:
    """Local-dev fallback when no JWT is available for the AI Gateway.

    Returns a deterministic CRITICAL score so the rest of the demo flow
    (signing, deposit, report unlock) can run end-to-end without real inference.
    """
    canned = {
        "cvss_score": 9.1,
        "severity": "CRITICAL",
        "attack_vector": "NETWORK",
        "funds_at_risk_wei": str(funds_at_risk_wei or 10**18),
        "reasoning": "STUBBED — local dev without AI Gateway JWT.",
    }
    canned_text = json.dumps(canned)
    return SeverityResult(
        cvss_score=canned["cvss_score"],
        severity=canned["severity"],
        attack_vector=canned["attack_vector"],
        funds_at_risk_wei=int(canned["funds_at_risk_wei"]),
        reasoning=canned["reasoning"],
        eigenai_model=f"stub:{model}",
        eigenai_signature="",
        eigenai_chain_id=0,
        request_messages=request_messages,
        response_messages=[{"role": "assistant", "content": canned_text}],
        raw_response_text=canned_text,
        response_body={"stub": True},
    )


async def assess_severity(
    *,
    exploit_output: str,
    contract_source: str,
    target_contract: str,
    chain_id: int,
    funds_at_risk_wei: int,
    funds_at_risk_usd: float,
) -> SeverityResult:
    s = get_settings()

    user_msg = SEVERITY_PROMPT.format(
        exploit_output=exploit_output[:8000],
        contract_source=contract_source[:8000],
        target_contract=target_contract,
        chain_id=chain_id,
        funds_wei=funds_at_risk_wei,
        funds_usd=f"{funds_at_risk_usd:.2f}",
    )
    request_messages = [{"role": "user", "content": user_msg}]

    if s.EIGEN_STUB_SEVERITY:
        return _stubbed_result(
            model=s.EIGEN_MODEL,
            request_messages=request_messages,
            funds_at_risk_wei=funds_at_risk_wei,
        )

    result = await _call_gateway(
        model=s.EIGEN_MODEL,
        messages=request_messages,
        seed=s.EIGEN_SEED,
        max_tokens=600,
    )

    response_text = result.get("text", "") or ""
    response_body = result.get("response_body") or {}
    parsed = _extract_json(response_text)

    eai_sig, eai_chain_id = _extract_signature(response_body)

    response_messages = []
    for c in response_body.get("choices") or []:
        m = (c or {}).get("message") or {}
        content = m.get("content")
        if isinstance(content, list):
            content = "".join(p.get("text", "") for p in content if p.get("type") == "text")
        response_messages.append({"role": m.get("role") or "assistant", "content": content or ""})

    return SeverityResult(
        cvss_score=float(parsed.get("cvss_score", 0.0)),
        severity=str(parsed.get("severity", "LOW")).upper(),
        attack_vector=str(parsed.get("attack_vector", "NETWORK")).upper(),
        funds_at_risk_wei=int(parsed.get("funds_at_risk_wei", funds_at_risk_wei)),
        reasoning=str(parsed.get("reasoning", "")),
        eigenai_model=result.get("model") or s.EIGEN_MODEL,
        eigenai_signature=eai_sig,
        eigenai_chain_id=eai_chain_id or 1,
        request_messages=request_messages,
        response_messages=response_messages,
        raw_response_text=response_text,
        response_body=response_body,
    )


def build_eigenai_verification_message(
    request_messages: List[dict],
    response_messages: List[dict],
    model: str,
    chain_id: int,
) -> str:
    """Concatenation order required by the EigenAI verifier — no separators.

    NOTE: Confirm against the live verify-signature doc before demo. The exact
    byte order changed between the legacy direct-EigenAI path and the AI Gateway.
    Current best understanding: req || res || model || chain_id.
    """
    req = "".join(m.get("content", "") for m in request_messages)
    res = "".join(m.get("content", "") for m in response_messages)
    return f"{req}{res}{model}{chain_id}"
