const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const text = (value) => value === undefined || value === null ? "" : String(value).trim();

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

const objectAt = (root, paths) => {
  for (const path of paths) {
    let value = root;
    for (const part of path.split(".")) value = value?.[part];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

const numberValue = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace(/[^0-9,.-]/g, "");
  if (!cleaned) return null;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  const normalized = comma !== -1 && dot !== -1
    ? (comma > dot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, ""))
    : comma !== -1 ? cleaned.replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

const quantityValue = (value) => Math.max(1, Math.trunc(numberValue(value) ?? 1));

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

const base64 = (bytes) => {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary);
};

const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function hmacSha256(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
}

async function verifySignature(request, rawBody, secret) {
  const supplied = text(
    request.headers.get("x-gameboost-signature") ||
    request.headers.get("X-GameBoost-Signature") ||
    request.headers.get("x-webhook-signature"),
  );
  if (!supplied) return false;

  const digest = await hmacSha256(secret, rawBody);
  const expectedHex = hex(digest);
  const expectedBase64 = base64(digest);
  const candidates = [supplied, supplied.replace(/^sha256=/i, "").trim()];

  return candidates.some((candidate) =>
    timingSafeEqual(candidate.toLowerCase(), expectedHex.toLowerCase()) ||
    candidate === expectedBase64
  );
}

const supabaseRequest = async (env, path, init = {}) => {
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
  if (!response.ok) {
    throw new Error(data?.message || data?.hint || data?.details || `Supabase HTTP ${response.status}`);
  }
  return data;
};

function eventInfo(payload) {
  const eventType = text(first(
    payload?.type,
    payload?.event_type,
    payload?.event,
    payload?.name,
    payload?.data?.type,
    payload?.data?.event_type,
    "unknown",
  ));

  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const order = data?.order && typeof data.order === "object" ? data.order : data;

  const eventId = text(first(
    payload?.id,
    payload?.event_id,
    payload?.webhook_id,
    payload?.data?.event_id,
    order?.event_id,
  ));

  const orderId = text(first(
    order?.id,
    order?.order_id,
    order?.item_order_id,
    order?.external_order_id,
    data?.order_id,
    data?.item_order_id,
  ));

  const offerId = text(first(
    order?.offer_id,
    order?.item_offer_id,
    order?.offer?.id,
    data?.offer_id,
    data?.item_offer_id,
    data?.offer?.id,
  ));

  const quantity = quantityValue(first(order?.quantity, order?.qty, data?.quantity, data?.qty));
  const amount = numberValue(first(
    order?.amount,
    order?.total,
    order?.price,
    order?.price_eur,
    data?.amount,
    data?.total,
    data?.price,
  ));
  const currency = text(first(order?.currency, order?.currency_code, data?.currency, "EUR")) || "EUR";
  const buyerReference = text(first(
    order?.buyer_reference,
    order?.buyer_id,
    order?.buyer?.id,
    order?.buyer?.username,
    data?.buyer_reference,
    data?.buyer_id,
  ));
  const orderedAt = first(order?.created_at, order?.ordered_at, payload?.created_at, payload?.timestamp, null);
  const suppliedStatus = text(first(order?.status, data?.status, payload?.status));

  return { eventType, eventId, orderId, offerId, quantity, amount, currency, buyerReference, orderedAt, suppliedStatus, data };
}

function orderStatus(eventType, suppliedStatus) {
  const s = text(suppliedStatus).toLowerCase();
  if (["completed", "complete", "fulfilled", "delivered"].includes(s)) return { status: "completed", delivery_status: "delivered" };
  if (["cancelled", "canceled", "refunded", "failed"].includes(s)) return { status: s === "refunded" ? "refunded" : s === "failed" ? "failed" : "cancelled", delivery_status: "failed" };
  if (eventType.includes("complete") || eventType.includes("deliver") || eventType.includes("fulfilled")) return { status: "completed", delivery_status: "delivered" };
  if (eventType.includes("cancel") || eventType.includes("refund")) return { status: eventType.includes("refund") ? "refunded" : "cancelled", delivery_status: "failed" };
  if (eventType.includes("process")) return { status: "processing", delivery_status: "processing" };
  if (eventType.includes("purchase") || eventType.includes("created") || eventType.includes("order")) return { status: "confirmed", delivery_status: "queued" };
  return { status: "pending", delivery_status: "not_started" };
}

async function findAccount(env, externalAccountId) {
  const accountFilter = externalAccountId
    ? `marketplace=eq.gameboost&external_account_id=eq.${encodeURIComponent(externalAccountId)}&limit=1`
    : "marketplace=eq.gameboost&status=eq.connected&order=created_at.asc&limit=1";
  const accounts = await supabaseRequest(env, `marketplace_accounts?select=id,user_id,marketplace,display_name,external_account_id,status&${accountFilter}`);
  return accounts?.[0] || null;
}

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    service: "gameboost-webhook",
    configured: Boolean(text(env.GAMEBOOST_WEBHOOK_SECRET) && text(env.SUPABASE_URL) && text(env.SUPABASE_SERVICE_ROLE_KEY)),
    endpoint: "/webhooks/gameboost",
  });
}

export async function onRequestPost({ request, env }) {
  const secret = text(env.GAMEBOOST_WEBHOOK_SECRET);
  if (!secret) return json({ ok: false, error: "GAMEBOOST_WEBHOOK_SECRET belum dikonfigurasi." }, 503);

  const rawBody = await request.text();
  if (!(await verifySignature(request, rawBody, secret))) {
    return json({ ok: false, error: "Invalid webhook signature." }, 401);
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch {
    return json({ ok: false, error: "Invalid JSON payload." }, 400);
  }

  const info = eventInfo(payload);
  const fallbackEventId = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawBody));
  const eventId = info.eventId || hex(fallbackEventId);

  try {
    const existing = await supabaseRequest(env, `webhook_events?marketplace=eq.gameboost&event_id=eq.${encodeURIComponent(eventId)}&select=id,status&limit=1`);
    if (existing?.[0]?.status === "processed") {
      return json({ ok: true, duplicate: true, event_id: eventId });
    }

    if (!existing?.[0]) {
      await supabaseRequest(env, "webhook_events", {
        method: "POST",
        body: JSON.stringify({
          marketplace: "gameboost",
          event_id: eventId,
          event_type: info.eventType,
          payload,
          status: "received",
        }),
      });
    }

    const externalAccountId = text(first(
      info.data?.seller_id,
      info.data?.seller?.id,
      info.data?.account_id,
      info.data?.merchant_id,
    ));
    const account = await findAccount(env, externalAccountId);
    if (!account) throw new Error("Tidak ada marketplace_accounts GameBoost yang berstatus connected.");

    if (!info.orderId) {
      await supabaseRequest(env, `webhook_events?marketplace=eq.gameboost&event_id=eq.${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "processed", processed_at: new Date().toISOString() }),
      });
      await supabaseRequest(env, "sync_logs", {
        method: "POST",
        body: JSON.stringify({
          user_id: account.user_id,
          marketplace_account_id: account.id,
          operation: "gameboost_webhook",
          status: "success",
          message: `Received ${info.eventType}; no order id to persist.`,
          metadata: { event_id: eventId, payload },
        }),
      });
      return json({ ok: true, event_id: eventId, event_type: info.eventType, order_persisted: false });
    }

    let productId = null;
    let listing = null;
    if (info.offerId) {
      const listings = await supabaseRequest(
        env,
        `listings?marketplace_account_id=eq.${encodeURIComponent(account.id)}&external_offer_id=eq.${encodeURIComponent(info.offerId)}&select=id,product_id,stock,status,title&limit=1`,
      );
      listing = listings?.[0] || null;
      productId = listing?.product_id || null;
    }

    const mapped = orderStatus(info.eventType, info.suppliedStatus);
    const orderRow = {
      user_id: account.user_id,
      marketplace_account_id: account.id,
      product_id: productId,
      external_order_id: info.orderId,
      buyer_reference: info.buyerReference || null,
      quantity: info.quantity,
      amount: info.amount,
      currency: info.currency,
      status: mapped.status,
      delivery_status: mapped.delivery_status,
      raw_data: payload,
      updated_at: new Date().toISOString(),
    };
    if (info.orderedAt) orderRow.created_at = info.orderedAt;

    const orders = await supabaseRequest(env, "orders?on_conflict=marketplace_account_id,external_order_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(orderRow),
    });
    const savedOrder = orders?.[0] || null;

    if (listing && (info.eventType.includes("purchase") || info.eventType.includes("order"))) {
      const nextStock = Math.max(0, (numberValue(listing.stock) ?? 0) - info.quantity);
      await supabaseRequest(env, `listings?id=eq.${encodeURIComponent(listing.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          stock: nextStock,
          status: nextStock === 0 ? "sold_out" : listing.status,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    await supabaseRequest(env, `webhook_events?marketplace=eq.gameboost&event_id=eq.${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "processed", processed_at: new Date().toISOString(), error_message: null }),
    });

    await supabaseRequest(env, "sync_logs", {
      method: "POST",
      body: JSON.stringify({
        user_id: account.user_id,
        marketplace_account_id: account.id,
        operation: "gameboost_webhook",
        status: "success",
        message: `${info.eventType} received for order ${info.orderId}.`,
        metadata: { event_id: eventId, event_type: info.eventType, offer_id: info.offerId || null, order_id: savedOrder?.id || null },
      }),
    });

    return json({
      ok: true,
      event_id: eventId,
      event_type: info.eventType,
      external_order_id: info.orderId,
      order_id: savedOrder?.id || null,
      listing_matched: Boolean(listing),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await supabaseRequest(env, `webhook_events?marketplace=eq.gameboost&event_id=eq.${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", error_message: message }),
      });
    } catch {}
    return json({ ok: false, error: message, event_id: eventId }, 500);
  }
}
