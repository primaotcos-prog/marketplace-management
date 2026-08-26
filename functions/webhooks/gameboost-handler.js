// GameBoost webhook receiver.
// Production endpoint: signed requests only.
// Test endpoint: safe, non-mutating smoke test without a real purchase.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const text = (value) => value == null ? "" : String(value).trim();
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

const safeEqual = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const toHex = (bytes) => [...new Uint8Array(bytes)]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

async function sign(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );

  return toHex(digest);
}

async function verifyGameBoostSignature(request, body, secret) {
  const supplied = text(first(
    request.headers.get("x-gameboost-signature"),
    request.headers.get("signature"),
    request.headers.get("x-webhook-signature"),
  )).replace(/^sha256=/i, "");

  if (!supplied || !secret) return false;

  const expected = await sign(secret, body);
  return safeEqual(supplied.toLowerCase(), expected.toLowerCase());
}

function isTestRequest(request, url) {
  return url.pathname === "/webhooks/gameboost/test"
    || request.headers.get("x-gameboost-test-mode") === "1"
    || url.searchParams.get("test") === "1";
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  if (url.pathname === "/webhooks/gameboost/test") {
    return json({
      ok: true,
      test_endpoint: true,
      method: "POST",
      production_endpoint: "/webhooks/gameboost",
      message: "Test endpoint is reachable. POST a JSON payload to run a safe smoke test. No order or stock is changed.",
    });
  }

  return json({
    ok: true,
    service: "gameboost-webhook",
    configured: Boolean(text(env.GAMEBOOST_WEBHOOK_SECRET)),
    endpoint: "/webhooks/gameboost",
    test_endpoint: "/webhooks/gameboost/test",
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const rawBody = await request.text();

  // Explicit test endpoint is deliberately non-mutating and does not require
  // the production GameBoost signing secret. This is only a transport/smoke test.
  if (isTestRequest(request, url)) {
    let payload = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return json({ ok: false, test: true, error: "Invalid JSON payload." }, 400);
    }

    return json({
      ok: true,
      test: true,
      received: true,
      signature_checked: false,
      mutated: false,
      order_created: false,
      stock_changed: false,
      event: payload?.event || payload?.type || null,
      event_id: payload?.event_id || payload?.id || null,
      message: "Webhook smoke test accepted. No real order or stock mutation was performed.",
    });
  }

  // Production GameBoost endpoint remains strictly signature protected.
  const secret = text(env.GAMEBOOST_WEBHOOK_SECRET);
  if (!secret) {
    return json({
      ok: false,
      error: "GAMEBOOST_WEBHOOK_SECRET belum dikonfigurasi.",
    }, 503);
  }

  if (!(await verifyGameBoostSignature(request, rawBody, secret))) {
    return json({ ok: false, error: "Invalid webhook signature." }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "Invalid JSON payload." }, 400);
  }

  return json({
    ok: true,
    received: true,
    test: false,
    signature_checked: true,
    event: payload?.event || payload?.type || null,
    event_id: payload?.event_id || payload?.id || null,
    message: "GameBoost webhook signature verified and payload accepted.",
  });
}
