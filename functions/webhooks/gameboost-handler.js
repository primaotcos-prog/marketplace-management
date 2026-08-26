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

function testUi() {
  return new Response(`<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GameBoost Webhook Test</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;background:#0b0f14;color:#eef2f7}button{background:#2563eb;color:white;border:0;border-radius:10px;padding:12px 18px;font-size:16px;margin:6px 6px 6px 0}button.secondary{background:#374151}button:disabled{opacity:.6}pre{white-space:pre-wrap;background:#151b23;padding:16px;border-radius:10px;margin-top:18px}p{color:#aab4c0}</style></head><body><h1>GameBoost Webhook Test</h1><p>Safe tests. Tidak membuat order GameBoost dan tidak mengubah stock.</p><button id="run">1. Smoke Test</button><button id="signed" class="secondary">2. Test Production Signature</button><pre id="result">Belum ada test.</pre><script>const result=document.getElementById('result');const buttons=[document.getElementById('run'),document.getElementById('signed')];async function send(url,headers={}){buttons.forEach(b=>b.disabled=true);result.textContent='Mengirim POST...';try{const payload={event:'order.purchased',event_id:'signature-test-'+Date.now(),order_id:'TEST-ORDER-001',test:true};const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(payload)});const data=await res.json();result.textContent=JSON.stringify(data,null,2)}catch(e){result.textContent='Test gagal: '+e.message}finally{buttons.forEach(b=>b.disabled=false)}}document.getElementById('run').onclick=()=>send('/webhooks/gameboost/test',{'x-gameboost-test-mode':'1'});document.getElementById('signed').onclick=()=>send('/webhooks/gameboost?test=1');</script></body></html>`,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  if (url.pathname === "/webhooks/gameboost/test") {
    if (url.searchParams.get("ui") === "1") return testUi();
    return json({
      ok: true,
      test_endpoint: true,
      method: "POST",
      production_endpoint: "/webhooks/gameboost",
      test_ui: "/webhooks/gameboost/test?ui=1",
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
  if (isTestRequest(request, url) && url.pathname === "/webhooks/gameboost/test") {
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

  // A local production-signature test is allowed only with ?test=1. It signs
  // the exact JSON body with the configured server-side secret and then runs
  // through the same production verification path. It is still non-mutating.
  const localSignatureTest = url.pathname === "/webhooks/gameboost" && url.searchParams.get("test") === "1";
  if (localSignatureTest) {
    const secret = text(env.GAMEBOOST_WEBHOOK_SECRET);
    if (!secret) return json({ ok: false, test: true, error: "GAMEBOOST_WEBHOOK_SECRET belum dikonfigurasi." }, 503);

    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return json({ ok: false, test: true, error: "Invalid JSON payload." }, 400);
    }

    // Re-serialize exactly as the body that will be verified.
    const exactBody = JSON.stringify(payload);
    const signature = await sign(secret, exactBody);
    const testRequest = new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-gameboost-signature": signature },
      body: exactBody,
    });
    const verified = await verifyGameBoostSignature(testRequest, exactBody, secret);

    return json({
      ok: verified,
      test: true,
      received: true,
      signature_checked: true,
      signature_valid: verified,
      mutated: false,
      order_created: false,
      stock_changed: false,
      event: payload?.event || payload?.type || null,
      event_id: payload?.event_id || payload?.id || null,
      message: verified
        ? "Production signature verification passed. No real order or stock mutation was performed."
        : "Production signature verification failed.",
    }, verified ? 200 : 401);
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
