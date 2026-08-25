const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const text = (v) => v === undefined || v === null ? "" : String(v).trim();
const first = (...v) => v.find((x) => x !== undefined && x !== null && x !== "");
const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[^0-9,.-]/g, "");
  if (!s) return null;
  const c = s.lastIndexOf(","), d = s.lastIndexOf(".");
  const n = Number(c !== -1 && d !== -1 ? (c > d ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")) : c !== -1 ? s.replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};
const qty = (v) => Math.max(1, Math.trunc(num(v) ?? 1));
const escPath = (v) => encodeURIComponent(String(v));
const isoDate = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" || /^\d+$/.test(String(v))) {
    const n = Number(v);
    const ms = n < 100000000000 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function signature(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

async function verifySignature(request, rawBody, secret) {
  const supplied = text(first(
    request.headers.get("x-gameboost-signature"),
    request.headers.get("X-GameBoost-Signature"),
    request.headers.get("Signature"),
    request.headers.get("x-webhook-signature"),
  )).replace(/^sha256=/i, "");
  if (!supplied) return false;
  const expected = await signature(secret, rawBody);
  return safeEqual(supplied.toLowerCase(), expected.toLowerCase());
}

async function supabaseRequest(env, path, init = {}) {
  const url = text(env.SUPABASE_URL).replace(/\/$/, "");
  const key = text(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new Error("SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  let data = null;
  try { data = body ? JSON.parse(body) : null; } catch { data = { raw: body }; }
  if (!response.ok) throw new Error(data?.message || data?.hint || data?.details || `Supabase HTTP ${response.status}`);
  return data;
}

function normalizeEvent(request, envelope) {
  const eventType = text(first(
    request.headers.get("x-gameboost-topic"),
    request.headers.get("X-GameBoost-Topic"),
    envelope?.event,
    envelope?.event_type,
    envelope?.type,
    "unknown",
  ));
  const data = envelope?.payload && typeof envelope.payload === "object" ? envelope.payload : envelope?.data && typeof envelope.data === "object" ? envelope.data : envelope;
  const order = data?.order && typeof data.order === "object" ? data.order : data;
  return {
    eventType,
    eventId: text(first(request.headers.get("x-gameboost-event-id"), request.headers.get("X-GameBoost-Event-Id"), envelope?.event_id, envelope?.id)),
    orderId: text(first(order?.id, order?.order_id, order?.item_order_id, order?.external_order_id)),
    offerId: text(first(order?.item_offer_id, order?.offer_id, order?.offer?.id)),
    quantity: qty(first(order?.quantity, order?.qty)),
    amount: num(first(order?.price_eur, order?.amount, order?.total, order?.price)),
    currency: text(first(order?.currency, "EUR")) || "EUR",
    buyerReference: text(first(order?.buyer?.username, order?.buyer?.id, order?.buyer_id, order?.buyer_reference)),
    createdAt: isoDate(first(order?.purchased_at, order?.created_at)),
    status: text(order?.status),
    data,
  };
}

function mapOrderStatus(eventType, supplied) {
  const s = text(supplied).toLowerCase();
  if (["completed", "complete", "fulfilled", "delivered"].includes(s)) return { status: "completed", delivery_status: "delivered" };
  if (s === "refunded") return { status: "refunded", delivery_status: "failed" };
  if (["failed", "cancelled", "canceled"].includes(s)) return { status: s === "failed" ? "failed" : "cancelled", delivery_status: "failed" };
  if (eventType.includes("complete") || eventType.includes("deliver") || eventType.includes("fulfilled")) return { status: "completed", delivery_status: "delivered" };
  return eventType === "item.order.purchased" ? { status: "confirmed", delivery_status: "queued" } : { status: "pending", delivery_status: "not_started" };
}

async function findAccount(env) {
  const rows = await supabaseRequest(env, "marketplace_accounts?select=id,user_id,marketplace,display_name,external_account_id,status&marketplace=eq.gameboost&status=eq.connected&order=created_at.asc&limit=1");
  return rows?.[0] || null;
}

// Temporary browser-test support. Prefer GAMEBOOST_WEBHOOK_TEST_TOKEN in Cloudflare.
// The legacy token remains only for compatibility with the already-shared test URL.
const LEGACY_TEST_TOKEN = "2E9DvKirr_aLZ66-20Ict5uCZoub6LZA";

function testTokenFromRequest(request, url, env) {
  return text(first(
    request.headers.get("x-gameboost-test-token"),
    url.searchParams.get("token"),
  )) || text(env.GAMEBOOST_WEBHOOK_TEST_TOKEN) || LEGACY_TEST_TOKEN;
}

function isAuthorizedTestRequest(request, url, env) {
  const supplied = text(first(
    request.headers.get("x-gameboost-test-token"),
    url.searchParams.get("token"),
  ));
  if (!supplied) return false;
  const configured = text(env.GAMEBOOST_WEBHOOK_TEST_TOKEN) || LEGACY_TEST_TOKEN;
  return safeEqual(supplied, configured);
}

async function runTemporaryWebhookTest(env) {
  const secret = text(env.GAMEBOOST_WEBHOOK_SECRET);
  if (!secret) return json({ ok: false, error: "GAMEBOOST_WEBHOOK_SECRET belum dikonfigurasi." }, 503);

  const testOrderId = `WEBHOOK_TEST_${Date.now()}`;
  const envelope = {
    event: "item.order.purchased",
    event_id: testOrderId,
    test_mode: true,
    payload: {
      id: testOrderId,
      item_offer_id: "WEBHOOK_TEST_OFFER",
      title: "Temporary Webhook Test",
      quantity: 1,
      status: "pending",
      price_eur: "0.01",
      currency: "EUR",
      buyer: { username: "webhook-test" },
      created_at: new Date().toISOString(),
    },
  };
  const rawBody = JSON.stringify(envelope);
  const headers = new Headers({
    "content-type": "application/json",
    "x-gameboost-event-id": testOrderId,
    "x-gameboost-topic": "item.order.purchased",
    "x-gameboost-signature": await signature(secret, rawBody),
    "x-gameboost-test-mode": "1",
  });
  const response = await onRequestPost({
    request: new Request("https://temporary-test.local/webhooks/gameboost", { method: "POST", headers, body: rawBody }),
    env,
  });
  const result = await response.json();
  return json({ ok: response.ok, temporary_test: true, signature_verified: response.status !== 401, test_order_id: testOrderId, webhook_result: result }, response.status);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const isTestPath = url.pathname === "/webhooks/gameboost/test";
  const isLegacyTestQuery = url.pathname === "/webhooks/gameboost" && url.searchParams.get("test") === "1";

  if (isTestPath || isLegacyTestQuery) {
    if (!isAuthorizedTestRequest(request, url, env)) return json({ ok: false, error: "Invalid test token." }, 403);
    return runTemporaryWebhookTest(env);
  }

  return json({
    ok: true,
    service: "gameboost-webhook",
    configured: Boolean(text(env.GAMEBOOST_WEBHOOK_SECRET) && text(env.SUPABASE_URL) && text(env.SUPABASE_SERVICE_ROLE_KEY)),
    endpoint: "/webhooks/gameboost",
    test_endpoint: "/webhooks/gameboost/test?token=YOUR_TEST_TOKEN",
  });
}

export async function onRequestPost({ request, env }) {
  const secret = text(env.GAMEBOOST_WEBHOOK_SECRET);
  if (!secret) return json({ ok: false, error: "GAMEBOOST_WEBHOOK_SECRET belum dikonfigurasi." }, 503);

  const rawBody = await request.text();
  if (!(await verifySignature(request, rawBody, secret))) return json({ ok: false, error: "Invalid webhook signature." }, 401);

  let envelope;
  try { envelope = JSON.parse(rawBody); } catch { return json({ ok: false, error: "Invalid JSON payload." }, 400); }

  const info = normalizeEvent(request, envelope);
  const isTestMode = request.headers.get("x-gameboost-test-mode") === "1" || envelope?.test_mode === true;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
  const eventId = info.eventId || hex(digest);

  try {
    const existing = await supabaseRequest(env, `webhook_events?marketplace=eq.gameboost&event_id=eq.${escPath(eventId)}&select=id,status&limit=1`);
    if (existing?.[0]?.status === "processed") return json({ ok: true, duplicate: true, event_id: eventId, test_mode: isTestMode });

    if (!existing?.[0]) {
      await supabaseRequest(env, "webhook_events", {
        method: "POST",
        body: JSON.stringify({ marketplace: "gameboost", event_id: eventId, event_type: info.eventType, payload: envelope, status: "received" }),
      });
    }

    const account = await findAccount(env);
    if (!account) throw new Error("Tidak ada marketplace_accounts GameBoost yang berstatus connected.");

    if (!info.orderId) {
      await supabaseRequest(env, `webhook_events?marketplace=eq.gameboost&event_id=eq.${escPath(eventId)}`, {
        method: "PATCH", body: JSON.stringify({ status: "processed", processed_at: new Date().toISOString() }),
      });
      return json({ ok: true, event_id: eventId, event_type: info.eventType, order_persisted: false, test_mode: isTestMode });
    }

    let listing = null;
    if (info.offerId) {
      const rows = await supabaseRequest(env, `listings?marketplace_account_id=eq.${escPath(account.id)}&external_offer_id=eq.${escPath(info.offerId)}&select=id,product_id,stock,status,title&limit=1`);
      listing = rows?.[0] || null;
    }

    const mapped = mapOrderStatus(info.eventType, info.status);
    const orderRow = {
      user_id: account.user_id,
      marketplace_account_id: account.id,
      product_id: listing?.product_id || null,
      external_order_id: info.orderId,
      buyer_reference: info.buyerReference || null,
      quantity: info.quantity,
      amount: info.amount,
      currency: info.currency,
      status: mapped.status,
      delivery_status: mapped.delivery_status,
      raw_data: envelope,
      updated_at: new Date().toISOString(),
    };
    if (info.createdAt) orderRow.created_at = info.createdAt;

    const old = await supabaseRequest(env, `orders?marketplace_account_id=eq.${escPath(account.id)}&external_order_id=eq.${escPath(info.orderId)}&select=id&limit=1`);
    let savedOrder;
    if (old?.[0]) {
      const updated = await supabaseRequest(env, `orders?id=eq.${escPath(old[0].id)}`, { method: "PATCH", body: JSON.stringify(orderRow) });
      savedOrder = updated?.[0] || old[0];
    } else {
      const created = await supabaseRequest(env, "orders", { method: "POST", body: JSON.stringify(orderRow) });
      savedOrder = created?.[0] || null;
    }

    // Test requests must never consume real listing stock.
    // Real purchase events still decrement stock exactly once.
    if (!isTestMode && listing && info.eventType === "item.order.purchased") {
      const nextStock = Math.max(0, (num(listing.stock) ?? 0) - info.quantity);
      await supabaseRequest(env, `listings?id=eq.${escPath(listing.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ stock: nextStock, status: nextStock === 0 ? "sold_out" : listing.status, updated_at: new Date().toISOString() }),
      });
    }

    await supabaseRequest(env, `webhook_events?marketplace=eq.gameboost&event_id=eq.${escPath(eventId)}`, {
      method: "PATCH", body: JSON.stringify({ status: "processed", processed_at: new Date().toISOString(), error_message: null }),
    });

    await supabaseRequest(env, "sync_logs", {
      method: "POST",
      body: JSON.stringify({
        user_id: account.user_id,
        marketplace_account_id: account.id,
        operation: isTestMode ? "gameboost_webhook_test" : "gameboost_webhook",
        status: "success",
        message: `${info.eventType} received for order ${info.orderId}${isTestMode ? " (TEST MODE)" : ""}.`,
        metadata: { event_id: eventId, event_type: info.eventType, offer_id: info.offerId || null, order_id: savedOrder?.id || null, listing_matched: Boolean(listing), test_mode: isTestMode },
      }),
    });

    return json({ ok: true, event_id: eventId, event_type: info.eventType, external_order_id: info.orderId, order_id: savedOrder?.id || null, listing_matched: Boolean(listing), stock_changed: !isTestMode && Boolean(listing && info.eventType === "item.order.purchased"), test_mode: isTestMode });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await supabaseRequest(env, `webhook_events?marketplace=eq.gameboost&event_id=eq.${escPath(eventId)}`, { method: "PATCH", body: JSON.stringify({ status: "failed", error_message: message }) });
    } catch {}
    return json({ ok: false, error: message, event_id: eventId, test_mode: isTestMode }, 500);
  }
}