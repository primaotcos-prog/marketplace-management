import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const C = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), {
  status,
  headers: { ...C, "Content-Type": "application/json" },
});

const first = (...values: any[]) => values.find((v) => v !== undefined && v !== null && v !== "");
const num = (value: any): number | null => {
  if (value == null || value === "") return null;
  if (typeof value === "object") return num(first(value.value, value.amount != null ? Number(value.amount) / 100 : null));
  const n = Number(String(value).replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const norm = (value: any) => String(value ?? "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const slug = (value: any) => norm(value).replace(/\s+/g, "-");

function gameSlug(listing: any, explicit?: string) {
  return slug(first(
    explicit,
    listing?.game_slug,
    listing?.game_name,
    listing?.game?.slug,
    listing?.game?.name,
    listing?.metadata?.game?.slug,
    listing?.metadata?.game?.name,
    listing?.metadata?.game_slug,
    listing?.metadata?.game_name,
    listing?.metadata?.game,
    "",
  ));
}

function searchName(listing: any, explicit?: string) {
  if (explicit?.trim()) return explicit.trim();
  const direct = first(
    listing?.search,
    listing?.item_name,
    listing?.metadata?.item?.name,
    listing?.metadata?.item_name,
    listing?.metadata?.product_name,
    listing?.metadata?.catalog_item?.name,
  );
  if (direct) return String(direct).trim();

  let s = String(listing?.title || "").split("|")[0].trim();
  s = s
    .replace(/(?:random\s+mutation|secret\s+mutated|instant\s+delivery|fast\s+delivery|cheap\s+and\s+fast\s+delivery|low\s+price|fast\s+and\s+secure|steal\s+a\s+brainrot)/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*[kmb]?\s*\/\s*s\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*[kmb]\b/gi, " ")
    .replace(/\b(?:rainbow|gold|diamond|galaxy|divine|phantom|candy|bubble|og)\b/gi, " ")
    .replace(/[^a-zA-Z0-9&' -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || String(listing?.title || "").trim();
}

function extractInertia(html: string): any {
  const scripts = html.match(/<script[^>]*type=["']application\/json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const body = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>\s*$/i, "").trim();
    if (!body.includes('"component"') || !body.includes('"props"')) continue;
    try {
      const parsed = JSON.parse(body);
      const data = parsed?.props?.items?.data;
      if (Array.isArray(data)) return parsed;
    } catch {
      // Continue looking; GameBoost can contain other JSON scripts.
    }
  }
  return null;
}

function normalizeListing(item: any, locale: string) {
  const price = item?.price?.value ?? num(item?.price);
  const localPrice = item?.local_price?.value ?? num(item?.local_price);
  const seller = item?.seller || {};
  return {
    id: item?.id ?? null,
    title: item?.title ?? "",
    slug: item?.slug ?? "",
    seller: seller?.username ?? null,
    seller_id: seller?.id ?? null,
    seller_verified: seller?.is_verified ?? false,
    seller_rating: seller?.rating?.value ?? null,
    seller_orders: seller?.total_sales ?? null,
    seller_ratings: seller?.total_ratings ?? null,
    price: price,
    currency: item?.price?.currency?.code ?? "EUR",
    price_format: item?.price?.format ?? null,
    local_price: localPrice,
    local_currency: item?.local_price?.currency?.code ?? "USD",
    local_price_format: item?.local_price?.format ?? null,
    stock: item?.stock ?? null,
    min_quantity: item?.min_quantity ?? null,
    delivery_time: item?.delivery_time ?? null,
    status: item?.status ?? null,
    item_type: item?.data?.item_type ?? null,
    image_url: item?.icon_url ?? item?.media?.[0] ?? null,
    updated_at: item?.updated_at ?? null,
    created_at: item?.created_at ?? null,
    url: item?.slug ? `https://gameboost.com/${locale}/${item?.game?.slug || "steal-a-brainrot"}/items/${item.slug}` : null,
  };
}

async function fetchPublicListings(game: string, search: string, locale = "id", page = 1, sort = "price") {
  if (!game) throw new Error("Game slug wajib diisi.");
  if (!search) throw new Error("Search item wajib diisi.");

  const u = new URL(`https://gameboost.com/${locale}/${game}/items`);
  u.searchParams.set("s", search);
  u.searchParams.set("sort", sort);
  u.searchParams.set("page", String(Math.max(1, page)));

  const response = await fetch(u.toString(), {
    method: "GET",
    headers: {
      Accept: "text/html, application/xhtml+xml, application/json",
      "Accept-Language": locale === "id" ? "id-ID,id;q=0.9,en;q=0.7" : "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (compatible; MarketplaceManagement/1.0; competitor-reader)",
      "Cache-Control": "no-cache",
    },
  });

  const html = await response.text();
  if (!response.ok) throw new Error(`GameBoost public marketplace HTTP ${response.status}`);

  const inertia = extractInertia(html);
  if (!inertia) throw new Error("Payload Inertia GameBoost tidak ditemukan pada halaman marketplace.");

  const items = inertia?.props?.items || {};
  const raw = Array.isArray(items?.data) ? items.data : [];
  const listings = raw.map((x: any) => normalizeListing(x, locale));
  return {
    component: inertia?.component ?? null,
    query: items?.query ?? null,
    path: items?.path ?? u.toString(),
    current_page: items?.current_page ?? page,
    per_page: items?.per_page ?? listings.length,
    total: items?.total ?? null,
    last_page: items?.last_page ?? null,
    next_page_url: items?.next_page_url ?? null,
    prev_page_url: items?.prev_page_url ?? null,
    listings,
    source_url: u.toString(),
  };
}

async function auth(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw Object.assign(new Error("Authorization required"), { status: 401 });
  const url = Deno.env.get("SUPABASE_URL")!;
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw Object.assign(new Error("Invalid session"), { status: 401 });
  return {
    user,
    admin: createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

function calculateTarget(current: number, competitor: number, rule: any) {
  const undercut = Math.max(0.01, Number(rule?.undercut_eur || 0.10));
  const desired = Math.max(0.01, competitor - undercut);
  const minimum = rule?.min_price_eur == null ? 0 : Number(rule.min_price_eur);
  const maxCut = rule?.max_cut_eur == null ? Infinity : Number(rule.max_cut_eur);
  const floor = Math.max(minimum, current - maxCut);
  if (desired < current) {
    const target = Math.max(desired, floor);
    return { target, action: target < current ? "undercut" : "floor_protected" };
  }
  if (rule?.follow_up_enabled && desired > current) {
    const maxFollow = rule?.follow_up_max_price_eur == null ? Infinity : Number(rule.follow_up_max_price_eur);
    const raise = Number(rule?.follow_up_raise_eur || 0);
    const target = Math.min(desired, raise > 0 ? current + raise : desired, maxFollow);
    if (target > current) return { target, action: "follow_up" };
  }
  return { target: current, action: "no_change" };
}

async function preview(user: any, admin: any, body: any) {
  let rules: any[] = [];
  if (body?.listing_id) {
    const { data, error } = await admin.from("pricing_rules").select("*").eq("user_id", user.id).eq("listing_id", body.listing_id).limit(1);
    if (error) throw error;
    rules = data || [];
    if (!rules.length) rules = [{ listing_id: body.listing_id, ...(body.rule || {}) }];
  } else {
    const { data, error } = await admin.from("pricing_rules").select("*").eq("user_id", user.id);
    if (error) throw error;
    rules = data || [];
  }

  const ids = rules.map((r) => r.listing_id).filter(Boolean);
  if (!ids.length) return { ok: true, mode: "preview", read_only: true, processed: 0, previews: [] };

  const { data: listings, error: listingError } = await admin.from("listings").select("*").eq("user_id", user.id).in("id", ids);
  if (listingError) throw listingError;
  const byId = new Map((listings || []).map((x: any) => [x.id, x]));
  const previews: any[] = [];

  for (const rule of rules) {
    const listing = byId.get(rule.listing_id);
    if (!listing) continue;
    try {
      const game = gameSlug(listing, body?.game);
      const search = searchName(listing, body?.search);
      const locale = String(body?.locale || "id");
      const result = await fetchPublicListings(game, search, locale, 1, "price");
      const ownId = String(listing?.external_offer_id ?? listing?.metadata?.id ?? "");
      const current = num(listing?.price) ?? num(listing?.metadata?.price_eur?.value) ?? 0;
      const terms = norm(search).split(" ").filter(Boolean);
      const competitors = result.listings
        .filter((x: any) => String(x.id ?? "") !== ownId)
        .filter((x: any) => terms.every((term) => norm(x.title).includes(term)))
        .filter((x: any) => num(x.price) != null && num(x.price)! > 0)
        .sort((a: any, b: any) => Number(a.price) - Number(b.price));
      const cp = num(competitors[0]?.price);
      if (cp == null) {
        previews.push({
          listing_id: listing.id,
          offer_id: listing.external_offer_id,
          title: listing.title,
          our_price_eur: current,
          competitor_price_eur: null,
          target_price_eur: current,
          action: "no_change",
          status: "no_other_eur_listing_found",
          source: "GameBoost public marketplace / Inertia items",
          game_slug: game,
          item_name: search,
          source_url: result.source_url,
          listings_found: result.total,
          competitors: [],
        });
        continue;
      }
      const target = calculateTarget(current, cp, rule);
      previews.push({
        listing_id: listing.id,
        offer_id: listing.external_offer_id,
        title: listing.title,
        our_price_eur: current,
        competitor_price_eur: Math.round(cp * 100) / 100,
        target_price_eur: Math.round(target.target * 100) / 100,
        action: target.action,
        reason: `Competitor €${cp.toFixed(2)}; undercut €${Math.max(0.01, Number(rule?.undercut_eur || 0.10)).toFixed(2)}`,
        source: "GameBoost public marketplace / Inertia items",
        status: "ok",
        game_slug: game,
        item_name: search,
        source_url: result.source_url,
        listings_found: result.total,
        competitor_offer_id: competitors[0]?.id ?? null,
        competitors: competitors.slice(0, 10),
      });
    } catch (error) {
      previews.push({
        listing_id: listing.id,
        offer_id: listing.external_offer_id,
        title: listing.title,
        our_price_eur: num(listing?.price) ?? 0,
        competitor_price_eur: null,
        target_price_eur: num(listing?.price) ?? 0,
        action: "no_change",
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ok: true, mode: "preview", read_only: true, processed: previews.length, previews };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: C });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const { user, admin } = await auth(req);

    if (body?.operation === "search") {
      const game = slug(body?.game);
      const search = String(body?.search || "").trim();
      const result = await fetchPublicListings(game, search, String(body?.locale || "id"), Number(body?.page || 1), String(body?.sort || "price"));
      return json({ ok: true, ...result });
    }

    if (body?.operation === "preview" || body?.action === "preview" || !body?.operation) {
      return json(await preview(user, admin, body));
    }

    return json({ ok: false, error: "Unsupported operation" }, 400);
  } catch (error) {
    const status = (error as any)?.status;
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, status === 401 ? 401 : 500);
  }
});
