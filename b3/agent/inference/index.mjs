#!/usr/bin/env node
// B3 inference sidecar.
//
// Reads one JSON request from stdin, posts to the EigenCloud AI Gateway,
// writes one JSON result to stdout, exits.
//
// Stdin shape:
//   {
//     "model":       "anthropic/claude-sonnet-4.6" | "gpt-oss-120b-f16" | ...
//     "messages":    [{ "role": "user" | "system" | "assistant", "content": "..." }, ...],
//     "seed":        42,
//     "temperature": 0.0,
//     "max_tokens":  600
//   }
//
// Stdout shape (success):
//   {
//     "ok":            true,
//     "text":          "<assistant text>",
//     "model":         "<actual model id used>",
//     "usage":         { ... },
//     "request_body":  { ...exact body we POSTed... },
//     "response_body": { ...full gateway JSON... }   // contains receipt / signature if present
//   }
//
// Stdout shape (failure):
//   { "ok": false, "error": "<message>" }
//
// Env:
//   EIGEN_GATEWAY_URL   default https://ai-gateway-dev.eigencloud.xyz
//   KMS_AUTH_JWT        bearer JWT (local dev). In TEE, will fall back to
//                       /run/container_launcher/attestation_verifier_claims_token if unset.

import { readFileSync } from "node:fs";

const GATEWAY_URL =
  process.env.EIGEN_GATEWAY_URL || "https://ai-gateway-dev.eigencloud.xyz";

const TEE_JWT_PATH = "/run/container_launcher/attestation_verifier_claims_token";

function readJwt() {
  if (process.env.KMS_AUTH_JWT) return process.env.KMS_AUTH_JWT;
  try {
    const t = readFileSync(TEE_JWT_PATH, "utf8").trim();
    if (t) return t;
  } catch {
    // not in TEE — fall through
  }
  return null;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

async function main() {
  let req;
  try {
    req = JSON.parse(await readStdin());
  } catch (e) {
    emit({ ok: false, error: `bad stdin json: ${e.message}` });
    process.exit(2);
  }

  const jwt = readJwt();
  if (!jwt) {
    emit({
      ok: false,
      error:
        "no JWT — set KMS_AUTH_JWT for local dev, or run inside an EigenCompute TEE",
    });
    process.exit(3);
  }

  const requestBody = {
    model: req.model,
    messages: req.messages,
    ...(req.seed != null ? { seed: req.seed } : {}),
    ...(req.temperature != null ? { temperature: req.temperature } : {}),
    ...(req.max_tokens != null ? { max_tokens: req.max_tokens } : {}),
  };

  const url = `${GATEWAY_URL.replace(/\/+$/, "")}/v1/chat/completions`;
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (e) {
    emit({ ok: false, error: `network error: ${e.message}` });
    process.exit(4);
  }

  const raw = await resp.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    emit({
      ok: false,
      error: `gateway returned non-JSON (${resp.status}): ${raw.slice(0, 500)}`,
    });
    process.exit(5);
  }

  if (!resp.ok) {
    emit({
      ok: false,
      error: `gateway error ${resp.status}: ${
        body?.error?.message || body?.message || raw.slice(0, 500)
      }`,
    });
    process.exit(6);
  }

  const choice = body?.choices?.[0];
  const text =
    typeof choice?.message?.content === "string"
      ? choice.message.content
      : Array.isArray(choice?.message?.content)
      ? choice.message.content
          .filter((p) => p?.type === "text")
          .map((p) => p.text)
          .join("")
      : "";

  emit({
    ok: true,
    text,
    model: body.model || req.model,
    usage: body.usage || null,
    request_body: requestBody,
    response_body: body,
  });
}

main().catch((e) => {
  emit({ ok: false, error: `unhandled: ${e?.stack || e?.message || String(e)}` });
  process.exit(1);
});
