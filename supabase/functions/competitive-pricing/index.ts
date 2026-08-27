import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const C = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (x: any, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { ...C, "Content-Type": "application/json" } });
const first = (...v: any[]) => v.find((x) => x !== undefined && x !== null && x !== "");
const num = (v: any): number | null => { if (v == null || v === "") return null; if (typeof v === "object") return num(first(v.value, v.amount)); const n = Number(String(v).replace(/[^0-9,.-]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const priceOf = (o: any): number | null => num(first(o?.price_eur?.value, o?.price_eur, o?.price?.eur?.value, o?.price?.value, o?.price, o?.metadata?.price_eur?.value));
const idOf = (o: any) => String(first(o?.id, o?.uuid, o?.offer_id, o?.external_id, ""));
const arr = (x: any): any[] => { if (Array.isArray(x)) return x; if (!x || typeof x !== "object") return []; for (const v of [x.data, x.items, x.offers, x.results]) { if (Array.isArray(v)) return v; if (v && typeof v === "object") { const a = arr(v); if (a.length) return a; } } return []; };
const norm = (x: any) => String(x ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const slug = (x: any) => norm(x).replace(/\s+/g, "-");
const base = () => (Deno.env.get("GAMEBOOST_BASE_URL") || "https://api.gameboost.com/v2").replace(/\/$/, "");

async function gb(path: string, method = "GET", body?: any) {
  const key = Deno.env.get("GAMEBOOST_API_KEY");
  if (!key) throw Error("GAMEBOOST_API_KEY belum dikonfigurasi.");
  const r = await fetch(base() + path, { method, headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d: any;
  try { d = t ? JSON.parse(t) : null; } catch { d = { raw: t }; }
  if (!r.ok) { const e = new Error(first(d?.message, d?.error, d?.detail, d?.details, `GameBoost HTTP ${r.status}`)); (e as any).status = r.status; (e as any).response = d; throw e; }
  return { status: r.status, data: d };
}

function gameSlug(l: any) { return slug(first(l?.metadata?.game?.slug, l?.metadata?.game_slug, l?.metadata?.game_name, l?.metadata?.game, l?.game, "")); }
function itemName(l: any) { const explicit = first(l?.metadata?.item?.name, l?.metadata?.item_name, l?.metadata?.product_name, l?.metadata?.catalog_item?.name, l?.metadata?.item?.title); if (explicit) return String(explicit); let s = String(l?.title || "").split("|")[0].trim(); s = s.replace(/^[^a-zA-Z0-9]*x?\d+(?:\.\d+)?\s*/i, "").replace(/^[^a-zA-Z0-9]+/, "").trim(); return s || String(l?.title || "").trim(); }
function offerKind(l: any) { return String(first(l?.offer_type, l?.type, l?.metadata?.offer_type, l?.metadata?.type, "item")).toLowerCase(); }

async function publicCompetitor(l: any) {
  const game = gameSlug(l), name = itemName(l), ownId = String(l?.external_offer_id || "");
  if (!game || !name) return { status: "insufficient_metadata", competitor_price_eur: null, competitors: [] };
  const item = slug(name);
  const urls = [`https://gameboost.com/sv/${game}/items/category/${item}`, `https://gameboost.com/${game}/items/category/${item}`];
  const candidates: any[] = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8", "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) continue;
      const html = await r.text();
      const clean = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
      const parts = clean.split(/(?:Buy Now|Köp nu|Beli Sekarang|Kaufen|Acheter|Comprar|Acquista|Comprar Agora|ซื้อเลย|立即购买)/i);
      const target = norm(name);
      for (const raw of parts) {
        const s = raw.slice(Math.max(0, raw.length - 1200));
        const ns = norm(s);
        if (ns.lastIndexOf(target) < 0) continue;
        const ownIdNorm = norm(ownId);
        if (ownIdNorm && ns.includes(ownIdNorm)) continue;
        const matches = [...s.matchAll(/€\s*([0-9]{1,6}(?:[.,][0-9]{1,4})?)/g)];
        for (const m of matches) { const p = Number(String(m[1]).replace(",", ".")); if (Number.isFinite(p) && p > 0) candidates.push({ price_eur: p, source_url: url, raw: s.slice(0, 600) }); }
      }
      if (candidates.length) break;
    } catch {}
  }
  candidates.sort((a, b) => a.price_eur - b.price_eur);
  return { status: candidates.length ? "ok" : "no_other_eur_listing_found", competitor_price_eur: candidates[0]?.price_eur ?? null, competitors: candidates.slice(0, 10), game_slug: game, item_name: name, item_slug: item, source: "GameBoost public marketplace (excluding own offer)" };
}

async function officialCurrency(l: any) {
  if (!offerKind(l).includes("currency")) return null;
  const r = await gb(`/currency-offers/${encodeURIComponent(String(l.external_offer_id))}/competing-offers`);
  const offers = arr(r.data).filter((o) => idOf(o) !== String(l.external_offer_id));
  offers.sort((a, b) => (priceOf(a) ?? Infinity) - (priceOf(b) ?? Infinity));
  const c = offers[0];
  return { status: "ok", competitor_price_eur: c ? priceOf(c) : null, competitor_offer_id: c ? idOf(c) : null, source: "GameBoost official API" };
}
async function competitor(l: any) { const official = await officialCurrency(l); if (official) return official; return publicCompetitor(l); }

function calc(current: number, cp: number, rule: any) {
  const under = Math.max(0.01, Number(rule.undercut_eur || 0.1));
  const desired = Math.max(0.01, cp - under);
  const minimum = rule.min_price_eur == null ? 0 : Number(rule.min_price_eur);
  const maxCut = rule.max_cut_eur == null ? Infinity : Number(rule.max_cut_eur);
  const floor = Math.max(minimum, current - maxCut);
  if (desired < current) { const target = Math.max(desired, floor); return { target, action: target < current ? "undercut" : "floor_protected", reason: `Competitor €${cp.toFixed(2)}; undercut €${under.toFixed(2)}` }; }
  if (rule.follow_up_enabled && desired > current) { const maxFollow = rule.follow_up_max_price_eur == null ? Infinity : Number(rule.follow_up_max_price_eur); const raise = Number(rule.follow_up_raise_eur || 0); const target = Math.min(desired, raise > 0 ? current + raise : desired, maxFollow); if (target > current) return { target, action: "follow_up", reason: `Competitor naik ke €${cp.toFixed(2)}; follow-up menuju €${desired.toFixed(2)}` }; }
  return { target: current, action: "no_change", reason: "Tidak ada perubahan harga yang diperlukan" };
}

async function auth(req: Request) {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) throw Object.assign(Error("Authorization required"), { status: 401 });
  const url = Deno.env.get("SUPABASE_URL")!;
  const uc = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: h } } });
  const { data: { user }, error } = await uc.auth.getUser();
  if (error || !user) throw Object.assign(Error("Invalid session"), { status: 401 });
  return { user, admin: createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } }) };
}

async function saveRule(req: Request, b: any) {
  const { user, admin } = await auth(req);
  const p: any = { user_id: user.id, listing_id: b.listing_id, enabled: Boolean(b.enabled), undercut_eur: Math.max(0.01, Number(b.undercut_eur || 0.1)), min_price_eur: b.min_price_eur == null ? null : Number(b.min_price_eur), max_cut_eur: b.max_cut_eur == null ? null : Number(b.max_cut_eur), follow_up_enabled: Boolean(b.follow_up_enabled), follow_up_raise_eur: Math.max(0, Number(b.follow_up_raise_eur || 0)), follow_up_max_price_eur: b.follow_up_max_price_eur == null ? null : Number(b.follow_up_max_price_eur), interval_minutes: Math.max(5, Math.min(60, Math.trunc(Number(b.interval_minutes || 15)))) };
  const q = await admin.from("pricing_rules").upsert(p, { onConflict: "user_id,listing_id" }).select("*").single();
  if (q.error) throw q.error;
  return json({ ok: true, rule: q.data });
}

async function cronAuth(req: Request, admin: any, body: any) {
  const supplied = String(body?.cron_secret || req.headers.get("x-pricing-cron-secret") || "");
  if (!supplied) throw Object.assign(Error("Cron authorization required"), { status: 401 });
  const { data, error } = await admin.from("pricing_runtime_secrets").select("secret").eq("name", "competitive_pricing_cron").maybeSingle();
  if (error || !data?.secret || supplied !== String(data.secret)) throw Object.assign(Error("Invalid cron authorization"), { status: 401 });
}

function roundPrice(v: number) { return Math.round(v * 100) / 100; }
function formatEur(v: number) { return `€${v.toFixed(2).replace(".", ",")}`; }
function withLocalPriceMetadata(metadata: any, price: number) { const next = metadata && typeof metadata === "object" ? structuredClone(metadata) : {}; next.price_eur = { ...(next.price_eur || {}), value: price, amount: Math.round(price * 100), format: formatEur(price), currency: { ...(next.price_eur?.currency || {}), code: "EUR", symbol: "€" } }; return next; }

async function getRemoteOffer(l: any) {
  const id = encodeURIComponent(String(l.external_offer_id));
  const path = offerKind(l).includes("currency") ? `/currency-offers/${id}` : `/item-offers/${id}`;
  const remote = await gb(path);
  return remote.data?.data ?? remote.data;
}
async function updateGameBoostPrice(l: any, target: number) {
  const id = encodeURIComponent(String(l.external_offer_id));
  const path = offerKind(l).includes("currency") ? `/currency-offers/${id}` : `/item-offers/${id}`;
  return gb(path, "PATCH", { price: roundPrice(target) });
}
async function saveLocalPrice(admin: any, l: any, target: number) { const p = roundPrice(target); const metadata = withLocalPriceMetadata(l.metadata, p); const q = await admin.from("listings").update({ price: p, metadata, updated_at: new Date().toISOString() }).eq("id", l.id).eq("user_id", l.user_id); if (q.error) throw q.error; }
async function writeHistory(admin: any, l: any, oldPrice: number, competitorPrice: number | null, newPrice: number | null, action: string, reason: string) { const q = await admin.from("pricing_history").insert({ user_id: l.user_id, listing_id: l.id, offer_id: l.external_offer_id, old_price_eur: oldPrice, competitor_price_eur: competitorPrice, new_price_eur: newPrice, action, reason }); if (q.error) throw q.error; }

async function preview(user: any, admin: any) {
  const { data: rules, error } = await admin.from("pricing_rules").select("*").eq("user_id", user.id);
  if (error) throw error;
  const ids = (rules || []).map((r: any) => r.listing_id);
  if (!ids.length) return { ok: true, mode: "preview", read_only: true, previews: [] };
  const { data: listings, error: le } = await admin.from("listings").select("*").eq("user_id", user.id).in("id", ids);
  if (le) throw le;
  const byId = new Map((listings || []).map((x: any) => [x.id, x]));
  const out: any[] = [];
  for (const rule of rules || []) {
    const l = byId.get(rule.listing_id);
    if (!l?.external_offer_id) continue;
    try {
      const offer = await getRemoteOffer(l);
      const current = priceOf(offer) ?? num(l.price) ?? 0;
      const c = await competitor(l);
      const cp = c.competitor_price_eur;
      if (cp == null) { out.push({ listing_id: l.id, offer_id: l.external_offer_id, title: l.title, our_price_eur: current, competitor_price_eur: null, target_price_eur: current, action: "no_change", status: c.status || "no_competitor", source: c.source || "GameBoost public marketplace", reason: "Harga kompetitor lain tidak ditemukan" }); continue; }
      const t = calc(current, cp, rule);
      out.push({ listing_id: l.id, offer_id: l.external_offer_id, title: l.title, our_price_eur: current, competitor_price_eur: cp, target_price_eur: roundPrice(t.target), action: t.action, reason: t.reason, source: c.source, status: c.status, competitor_offer_id: c.competitor_offer_id || null, competitors: c.competitors || [] });
    } catch (e) { out.push({ listing_id: l.id, offer_id: l.external_offer_id, title: l.title, our_price_eur: num(l.price) ?? 0, competitor_price_eur: null, target_price_eur: num(l.price) ?? 0, action: "no_change", status: "error", reason: e instanceof Error ? e.message : String(e) }); }
  }
  return { ok: true, mode: "preview", read_only: true, processed: out.length, previews: out };
}

async function runAll(admin: any) {
  const { data: rules, error: re } = await admin.from("pricing_rules").select("*").eq("enabled", true);
  if (re) throw re;
  const ids = (rules || []).map((r: any) => r.listing_id);
  if (!ids.length) return { ok: true, mode: "run", processed: 0, changed: 0, skipped: 0, errors: 0, message: "Tidak ada pricing rule yang aktif." };
  const { data: listings, error: le } = await admin.from("listings").select("*").in("id", ids);
  if (le) throw le;
  const byId = new Map((listings || []).map((x: any) => [x.id, x]));
  const result: any[] = [];
  let changed = 0, skipped = 0, errors = 0;
  for (const rule of rules || []) {
    const l = byId.get(rule.listing_id);
    if (!l?.external_offer_id) { skipped++; result.push({ listing_id: rule.listing_id, action: "skip", reason: "Listing tidak memiliki external_offer_id" }); continue; }
    const lastRun = rule.last_run_at ? new Date(rule.last_run_at).getTime() : 0;
    const intervalMs = Math.max(5, Number(rule.interval_minutes || 15)) * 60_000;
    if (lastRun && Date.now() - lastRun < intervalMs) { skipped++; result.push({ listing_id: l.id, offer_id: l.external_offer_id, action: "interval_skip" }); continue; }
    try {
      const offer = await getRemoteOffer(l);
      const current = priceOf(offer) ?? num(l.price) ?? 0;
      const c = await competitor(l);
      const cp = c.competitor_price_eur;
      if (cp == null) { skipped++; result.push({ listing_id: l.id, offer_id: l.external_offer_id, action: "no_change", status: c.status || "no_competitor", reason: "Harga kompetitor lain tidak ditemukan" }); }
      else {
        const t = calc(current, cp, rule);
        const target = roundPrice(t.target);
        if (Math.abs(target - roundPrice(current)) < 0.01) { skipped++; result.push({ listing_id: l.id, offer_id: l.external_offer_id, old_price_eur: current, competitor_price_eur: cp, new_price_eur: current, action: t.action === "floor_protected" ? "floor_protected" : "no_change", reason: t.reason }); }
        else {
          await updateGameBoostPrice(l, target);
          await saveLocalPrice(admin, l, target);
          await writeHistory(admin, l, current, cp, target, t.action, t.reason);
          changed++;
          result.push({ listing_id: l.id, offer_id: l.external_offer_id, old_price_eur: current, competitor_price_eur: cp, new_price_eur: target, action: t.action, reason: t.reason });
        }
      }
    } catch (e) {
      errors++;
      const reason = e instanceof Error ? e.message : String(e);
      try { await writeHistory(admin, l, num(l.price) ?? 0, null, null, "error", reason); } catch {}
      result.push({ listing_id: l.id, offer_id: l.external_offer_id, action: "error", reason });
    } finally {
      await admin.from("pricing_rules").update({ last_run_at: new Date().toISOString() }).eq("id", rule.id);
    }
  }
  return { ok: true, mode: "run", processed: rules?.length || 0, changed, skipped, errors, results: result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: C });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  try {
    let b: any = {};
    try { b = await req.json(); } catch { b = {}; }
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
    if (b.operation === "run") { await cronAuth(req, admin, b); return json(await runAll(admin)); }
    if (b.operation === "save_rule") return await saveRule(req, b);
    const { user, admin: userAdmin } = await auth(req);
    if (b.operation === "preview" || !b.operation) return json(await preview(user, userAdmin));
    return json({ ok: false, error: "Unsupported operation" }, 400);
  } catch (e) {
    const s = (e as any)?.status;
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, s === 401 ? 401 : 500);
  }
});