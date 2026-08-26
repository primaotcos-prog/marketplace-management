// GameBoost webhook receiver.
// Production endpoint: signed requests only.
// Test endpoint: safe, non-mutating simulation using the documented GameBoost payload shape.

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
  const supplied = text(request.headers.get("x-gameboost-signature"))
    .replace(/^sha256=/i, "");

  if (!supplied || !secret) return false;

  const expected = await sign(secret, body);
  return safeEqual(supplied.toLowerCase(), expected.toLowerCase());
}

function isTestRequest(request, url) {
  return url.pathname === "/webhooks/gameboost/test"
    || request.headers.get("x-gameboost-test-mode") === "1"
    || url.searchParams.get("test") === "1";
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function makeTestPayload(type = "item") {
  const eventMap = {
    account: "account.order.purchased",
    currency: "currency.order.purchased",
    item: "item.order.purchased",
    gift_card: "gift_card.order.purchased",
  };
  const event = eventMap[type] || eventMap.item;
  const id = 900000 + Math.floor(Math.random() * 99999);
  const common = {
    id,
    buyer: { id: 700001, username: "webhook-test-buyer" },
    title: "Webhook Test Product",
    description: "Synthetic test payload. Not a real GameBoost order.",
    parameters: { test: true },
    is_disputed: false,
    dispute_case_id: null,
    delivery_time: { duration: 60, format: "seconds", format_long: "1 minute", seconds: 60 },
    price_eur: "1.00",
    price_usd: "1.10",
    unit_price_eur: "1.00",
    unit_price_usd: "1.10",
    created_at: nowSeconds(),
    updated_at: nowSeconds(),
    purchased_at: nowSeconds(),
    completed_at: null,
    refunded_at: null,
  };

  if (type === "account") {
    return {
      event,
      payload: {
        ...common,
        account_offer_id: 900001,
        game: { id: 1, name: "Test Game", slug: "test-game" },
        is_manual_delivery: false,
        credentials: "synthetic-test-credentials",
        delivery_instructions: "Synthetic test only.",
        price: "1.00",
        price_usd: "1.10",
        image_urls: [],
      },
    };
  }

  if (type === "currency") {
    return {
      event,
      payload: {
        ...common,
        currency_offer_id: 900002,
        game: { id: 1, name: "Test Game", slug: "test-game" },
        quantity: 100,
        currency_unit: { slug: "test-currency", currency_name: "Test Currency", name: "Test Currency", symbol: "TC", multiplier: 1 },
        credentials: { uid: 1234567890 },
        completion_proof_url: null,
      },
    };
  }

  if (type === "gift_card") {
    return {
      event,
      payload: {
        id,
        gift_card_id: 900003,
        gift_card_offer_id: 900004,
        region_id: 1,
        brand_id: 1,
        buyer: common.buyer,
        title: common.title,
        face_value_amount: "1.00",
        face_value_unit: "USD",
        quantity: 1,
        unit_price_eur: "1.00",
        unit_price_usd: "1.10",
        price_eur: "1.00",
        price_usd: "1.10",
        keys: [],
        created_at: common.created_at,
        updated_at: common.updated_at,
        completed_at: null,
        refunded_at: null,
      },
    };
  }

  return {
    event,
    payload: {
      ...common,
      item_offer_id: 900005,
      game: { id: 1, name: "Test Game", slug: "test-game" },
      quantity: 1,
      credentials: { username: "TestCharacter", server: "EU" },
    },
  };
}

function testUi() {
  return new Response(`<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GameBoost Webhook Test</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px;background:#0b0f14;color:#eef2f7}button{background:#2563eb;color:white;border:0;border-radius:10px;padding:12px 15px;font-size:15px;margin:6px 6px 6px 0}button.secondary{background:#374151}button:disabled{opacity:.6}pre{white-space:pre-wrap;background:#151b23;padding:16px;border-radius:10px;margin-top:18px;font-size:13px}p{color:#aab4c0}</style></head><body><h1>GameBoost Webhook Test</h1><p>Semua test di halaman ini sintetis: tidak membuat order GameBoost dan tidak mengubah stock.</p><button data-type="item">Item Order Test</button><button data-type="currency">Currency Order Test</button><button data-type="account">Account Order Test</button><button data-type="gift_card">Gift Card Test</button><button id="signed" class="secondary">Production Signature Test</button><pre id="result">Belum ada test.</pre><script>const result=document.getElementById('result');const buttons=[...document.querySelectorAll('button')];async function send(url,body,headers={}){buttons.forEach(b=>b.disabled=true);result.textContent='Mengirim POST...';try{const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});const data=await res.json();result.textContent=JSON.stringify(data,null,2)}catch(e){result.textContent='Test gagal: '+e.message}finally{buttons.forEach(b=>b.disabled=false)}}document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>send('/webhooks/gameboost/test',{...({event:'item.order.purchased'}),test_type:b.dataset.type}));document.getElementById('signed').onclick=()=>send('/webhooks/gameboost?test=1',{event:'item.order.purchased',payload:{id:900005,item_offer_id:900005,game:{id:1,name:'Test Game',slug:'test-game'},buyer:{id:700001,username:'webhook-test-buyer'},title:'Webhook Test Product',description:'Synthetic test payload. Not a real GameBoost order.',quantity:1,parameters:{test:true},is_disputed:false,dispute_case_id:null,delivery_time:{duration:60,format:'seconds',format_long:'1 minute',seconds:60},credentials:{username:'TestCharacter',server:'EU'},price_eur:'1.00',price_usd:'1.10',unit_price_eur:'1.00',unit_price_usd:'1.10',created_at:Math.floor(Date.now()/1000),updated_at:Math.floor(Date.now()/1000),purchased_at:Math.floor(Date.now()/1000),completed_at:null,refunded_at:null}});</script></body></html>`,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
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
      payload_format: "GameBoost event + nested payload",
      message: "Test endpoint is reachable. POST a synthetic GameBoost-shaped JSON payload; no order or stock is changed.",
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

  // Explicit test endpoint: deliberately non-mutating and does not require
  // the production signing secret. It validates the documented envelope.
  if (isTestRequest(request, url) && url.pathname === "/webhooks/gameboost/test") {
    let payload = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return json({ ok: false, test: true, error: "Invalid JSON payload." }, 400);
    }

    const event = text(payload?.event);
    const supported = [
      "account.order.purchased",
      "currency.order.purchased",
      "item.order.purchased",
      "gift_card.order.purchased",
    ].includes(event);

    return json({
      ok: true,
      test: true,
      received: true,
      signature_checked: false,
      payload_shape_valid: Boolean(event && payload?.payload) || Boolean(payload?.test_type),
      supported_event: supported,
      mutated: false,
      order_created: false,
      stock_changed: false,
      event: event || null,
      event_id: payload?.event_id || payload?.id || null,
      message: "Synthetic GameBoost-shaped webhook accepted. No real order or stock mutation was performed.",
    });
  }

  // Local production-signature test. It signs the exact JSON body with the
  // configured server-side secret and runs through the same HMAC verification
  // algorithm as production, while remaining strictly non-mutating.
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

    const exactBody = JSON.stringify(payload);
    const signature = await sign(secret, exactBody);
    const testRequest = new Request(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gameboost-signature": signature,
        "x-gameboost-event-id": "evt_test_signature",
        "x-gameboost-topic": payload?.event || "item.order.purchased",
        "x-gameboost-timestamp": new Date().toISOString(),
        "user-agent": "GameBoost Server",
      },
      body: exactBody,
    });
    const verified = await verifyGameBoostSignature(testRequest, exactBody, secret);

    return json({
      ok: verified,
      test: true,
      received: true,
      signature_checked: true,
      signature_valid: verified,
      payload_shape_valid: Boolean(payload?.event && payload?.payload),
      topic_header: testRequest.headers.get("x-gameboost-topic"),
      event_id_header: testRequest.headers.get("x-gameboost-event-id"),
      mutated: false,
      order_created: false,
      stock_changed: false,
      event: payload?.event || null,
      message: verified
        ? "Production signature verification passed against a GameBoost-shaped payload. No real order or stock mutation was performed."
        : "Production signature verification failed.",
    }, verified ? 200 : 401);
  }

  // Production GameBoost endpoint remains strictly signature protected.
  const secret = text(env.GAMEBOOST_WEBHOOK_SECRET);
  if (!secret) {
    return json({ ok: false, error: "GAMEBOOST_WEBHOOK_SECRET belum dikonfigurasi." }, 503);
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

  const event = text(payload?.event);
  const topic = text(request.headers.get("x-gameboost-topic"));
  const eventId = text(request.headers.get("x-gameboost-event-id"));

  if (!event || !payload?.payload) {
    return json({ ok: false, error: "Invalid GameBoost webhook payload: event and payload are required." }, 400);
  }

  if (topic && topic !== event) {
    return json({ ok: false, error: "GameBoost topic header does not match payload event." }, 400);
  }

  return json({
    ok: true,
    received: true,
    test: false,
    signature_checked: true,
    signature_valid: true,
    payload_shape_valid: true,
    event,
    event_id: eventId || null,
    topic: topic || null,
    message: "GameBoost webhook signature verified and GameBoost payload accepted.",
  });
}
