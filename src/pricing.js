// pricing.js
import { supabase } from "./supabase.js";

const fnName = "competitive-pricing";
const num = (v) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^0-9,.-]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const esc = (s) => String(s ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const eur = (v) => Number.isFinite(Number(v)) ? `€${Number(v).toFixed(2).replace(".", ",")}` : "—";

async function invoke(action, payload = {}) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
  const { data, error } = await supabase.functions.invoke(fnName, { body: { action, ...payload }, headers: { Authorization: `Bearer ${session.access_token}` } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function loadCompetitivePreview(listing, rule = {}) {
  return invoke("preview", { listing_id: listing.id, rule });
}
export async function savePricingRule(listing, form) {
  return invoke("save_rule", {
    listing_id: listing.id,
    enabled: !!form.enabled,
    undercut_eur: num(form.undercut_eur) ?? 0.10,
    min_price_eur: num(form.min_price_eur),
    max_cut_eur: num(form.max_cut_eur),
    follow_up_enabled: !!form.follow_up_enabled,
    follow_up_raise_eur: num(form.follow_up_raise_eur) ?? 0,
    follow_up_max_price_eur: num(form.follow_up_max_price_eur),
    interval_minutes: Number(form.interval_minutes || 15)
  });
}
export async function getPricingHistory(listingId) { return invoke("history", { listing_id: listingId }); }

export function renderCompetitorPreview(container, listing, result) {
  if (!container) return;
  if (!result || result.status === "error") { container.innerHTML = `<div class="pricing-empty">${esc(result?.error || "Gagal mengambil harga kompetitor.")}</div>`; return; }
  const cp = num(result.competitor_price_eur);
  const competitors = Array.isArray(result.competitors) ? result.competitors : [];
  const current = num(listing?.price) ?? num(listing?.metadata?.price_eur?.value);
  const target = num(result.target) ?? current;
  container.innerHTML = `<div class="pricing-preview-head"><b>Competitor Preview — READ ONLY</b><small>Mode preview tidak mengubah harga GameBoost.</small></div><div class="pricing-preview-table"><div class="pricing-preview-row pricing-preview-header"><span>Listing</span><span>Kita</span><span>Kompetitor</span><span>Target</span><span>Action</span></div><div class="pricing-preview-row"><span><b>${esc(listing?.title || "Listing")}</b></span><span>${eur(current)}</span><span>${eur(cp)}</span><span>${eur(target)}</span><span>${esc(result.action || "no_change")}</span></div></div><div class="pricing-source">${cp == null ? "Kompetitor lain tidak ditemukan." : `Harga kompetitor terendah: <b>${eur(cp)}</b>`} · ${esc(result.source || "GameBoost")}</div>${competitors.length ? `<details><summary>${competitors.length} kompetitor terdeteksi</summary>${competitors.map(c => `<div>${eur(num(c.price_eur))}${c.competitor_offer_id ? ` · offer ${esc(c.competitor_offer_id)}` : ""}</div>`).join("")}</details>` : ""}`;
}
