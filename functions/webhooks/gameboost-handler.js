// GameBoost webhook receiver.
// Production: HMAC-SHA256 verification against the raw request body.
// Test: synthetic GameBoost-shaped payloads only; never mutates orders or stock.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const text = (v) => v == null ? "" : String(v).trim();
const safeEqual = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
const toHex = (bytes) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");

async function sign(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

async function verifySignature(request, rawBody, secret) {
  const supplied = text(request.headers.get("x-gameboost-signature")).replace(/^sha256=/i, "");
  return supplied && secret ? safeEqual(supplied.toLowerCase(), (await sign(secret, rawBody)).toLowerCase()) : false;
}

const supportedEvents = {
  account: "account.order.purchased",
  currency: "currency.order.purchased",
  item: "item.order.purchased",
  gift_card: "gift_card.order.purchased",
};

function makeTestPayload(type = "item") {
  const event = supportedEvents[type] || supportedEvents.item;
  const id = 900000 + Math.floor(Math.random() * 99999);
  const now = Math.floor(Date.now() / 1000);
  const buyer = { id: 700001, username: "webhook-test-buyer" };
  const common = {
    id,
    buyer,
    title: "Webhook Test Product",
    description: "Synthetic test payload. Not a real GameBoost order.",
    parameters: { test: true },
    is_disputed: false,
    dispute_case_id: null,
    delivery_time: { duration: 60, format: "seconds", format_long: "1 minute", seconds: 60 },
    created_at: now,
    updated_at: now,
    purchased_at: now,
    completed_at: null,
    refunded_at: null,
  };

  if (type === "account") return { event, payload: {
    ...common, account_offer_id: 900001,
    game: { id: 1, name: "Test Game", slug: "test-game" },
    is_manual_delivery: false, credentials: "synthetic-test-credentials",
    delivery_instructions: "Synthetic test only.", price: "1.00", price_usd: "1.10", image_urls: [],
  }};

  if (type === "currency") return { event, payload: {
    ...common, currency_offer_id: 900002,
    game: { id: 1, name: "Test Game", slug: "test-game" }, quantity: 100,
    currency_unit: { slug: "test-currency", currency_name: "Test Currency", name: "Test Currency", symbol: "TC", multiplier: 1 },
    credentials: { uid: 1234567890 }, completion_proof_url: null,
    price_eur: "1.00", price_usd: "1.10", unit_price_eur: "1.00", unit_price_usd: "1.10",
  }};

  if (type === "gift_card") return { event, payload: {
    id, gift_card_id: 900003, gift_card_offer_id: 900004, region_id: 1, brand_id: 1, buyer,
    title: common.title, face_value_amount: "1.00", face_value_unit: "USD", quantity: 1,
    unit_price_eur: "1.00", unit_price_usd: "1.10", price_eur: "1.00", price_usd: "1.10",
    keys: [], created_at: now, updated_at: now, completed_at: null, refunded_at: null,
  }};

  return { event, payload: {
    ...common, item_offer_id: 900005,
    game: { id: 1, name: "Test Game", slug: "test-game" }, quantity: 1,
    credentials: { username: "TestCharacter", server: "EU" },
    price_eur: "1.00", price_usd: "1.10", unit_price_eur: "1.00", unit_price_usd: "1.10",
  }};
}

function testUi() {
  return new Response(`<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GameBoost Webhook Test</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:auto;padding:24px;background:#0b0f14;color:#eef2f7}button{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px 15px;font-size:15px;margin:6px 6px 6px 0}.secondary{background:#374151}button:disabled{opacity:.6}pre{white-space:pre-wrap;background:#151b23;padding:16px;border-radius:10px;margin-top:18px;font-size:13px}p{color:#aab4c0}</style></head><body><h1>GameBoost Webhook Test</h1><p>Semua test sintetis. Tidak membuat order GameBoost dan tidak mengubah stock.</p><button data-type="item">Item Order Test</button><button data-type="currency">Currency Order Test</button><button data-type="account">Account Order Test</button><button data-type="gift_card">Gift Card Test</button><button id="signed" class="secondary">Production Signature Test</button><pre id="result">Belum ada test.</pre><script>const out=document.getElementById('result'),bs=[...document.querySelectorAll('button')];async function post(url,body){bs.forEach(b=>b.disabled=true);out.textContent='Mengirim POST...';try{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});out.textContent=JSON.stringify(await r.json(),null,2)}catch(e){out.textContent='Test gagal: '+e.message}finally{bs.forEach(b=>b.disabled=false)}}document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>post('/webhooks/gameboost/test?type='+encodeURIComponent(b.dataset.type),{}));document.getElementById('signed').onclick=()=>post('/webhooks/gameboost?test=1',${JSON.stringify(makeTestPayload("item"))});</script></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.pathname === "/webhooks/gameboost/test") {
    if (url.searchParams.get("ui") === "1") return testUi();
    return json({ ok: true, test_endpoint: true, method: "POST", production_endpoint: "/webhooks/gameboost", test_ui: "/webhooks/gameboost/test?ui=1", payload_format: "GameBoost event + nested payload", message: "Synthetic test endpoint. No order or stock is changed." });
  }
  return json({ ok: true, service: "gameboost-webhook", configured: Boolean(text(env.GAMEBOOST_WEBHOOK_SECRET)), endpoint: "/webhooks/gameboost", test_endpoint: "/webhooks/gameboost/test" });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const rawBody = await request.text();

  if (url.pathname === "/webhooks/gameboost/test") {
    let supplied;
    try { supplied = rawBody ? JSON.parse(rawBody) : {}; } catch { return json({ ok: false, test: true, error: "Invalid JSON payload." }, 400); }
    const type = url.searchParams.get("type") || supplied.test_type || "item";
    const simulated = makeTestPayload(type);
    return json({
      ok: true, test: true, received: true, signature_checked: false,
      payload_shape_valid: Boolean(simulated.event && simulated.payload),
      supported_event: true, mutated: false, order_created: false, stock_changed: false,
      event: simulated.event, event_id: `evt_test_${simulated.payload.id}`,
      payload: simulated.payload,
      message: "Synthetic GameBoost-shaped webhook accepted. No real order or stock mutation was performed.",
    });
  }

  // Safe local test: signs the exact submitted JSON body with the configured
  // production secret and runs the same HMAC algorithm as production. Still non-mutating.
  if (url.pathname === "/webhooks/gameboost" && url.searchParams.get("test") === "1") {
    const secret = text(env.GAMEBOOST_WEBHOOK_SECRET);
    if (!secret) return json({ ok: false, test: true, error: "GAMEBOOST_WEBHOOK_SECRET belum dikonfigurasi." }, 503);
    let payload;
    try { payload = rawBody ? JSON.parse(rawBody) : null; } catch { return json({ ok: false, test: true, error: "Invalid JSON payload." }, 400); }
    const exactBody = JSON.stringify(payload);
    const signature = await sign(secret, exactBody);
    const testRequest = new Request(request.url, { method: "POST", headers: {
      "content-type": "application/json", "x-gameboost-signature": signature,
      "x-gameboost-event-id": "evt_test_signature", "x-gameboost-topic": payload?.event || "item.order.purchased",
      "x-gameboost-timestamp": new Date().toISOString(), "user-agent": "GameBoost Server",
    }, body: exactBody });
    const verified = await verifySignature(testRequest, exactBody, secret);
    return json({ ok: verified, test: true, received: true, signature_checked: true, signature_valid: verified,
      payload_shape_valid: Boolean(payload?.event && payload?.payload), topic_header: testRequest.headers.get("x-gameboost-topic"),
      event_id_header: testRequest.headers.get("x-gameboost-event-id"), mutated: false, order_created: false, stock_changed: false,
      event: payload?.event || null, message: verified ? "Production signature verification passed against a GameBoost-shaped payload. No real order or stock mutation was performed." : "Production signature verification failed." }, verified ? 200 : 401);
  }

  const secret = text(env.GAMEBOOST_WEBHOOK_SECRET);
  if (!secret) return json({ ok: false, error: "GAMEBOOST_WEBHOOK_SECRET belum dikonfigurasi." }, 503);
  if (!(await verifySignature(request, rawBody, secret))) return json({ ok: false, error: "Invalid webhook signature." }, 401);

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return json({ ok: false, error: "Invalid JSON payload." }, 400); }

  const event = text(payload?.event);
  const topic = text(request.headers.get("x-gameboost-topic"));
  const eventId = text(request.headers.get("x-gameboost-event-id"));
  const userAgent = text(request.headers.get("user-agent"));
  if (!event || !payload?.payload) return json({ ok: false, error: "Invalid GameBoost webhook payload: event and payload are required." }, 400);
  if (topic && topic !== event) return json({ ok: false, error: "GameBoost topic header does not match payload event." }, 400);

  return json({ ok: true, received: true, test: false, signature_checked: true, signature_valid: true, payload_shape_valid: true,
    event, event_id: eventId || null, topic: topic || null, gameboost_user_agent: userAgent || null,
    message: "GameBoost webhook signature verified and GameBoost payload accepted." });
}
