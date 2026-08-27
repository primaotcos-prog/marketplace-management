// pricing.js
// Competitive pricing UI + client-side preview. Server-side calculations live in
// Supabase Edge Function `competitive-pricing`.
import { supabase } from "./supabase.js";

const fnName = "competitive-pricing";
const eur = (v) => Number.isFinite(Number(v)) ? `€${Number(v).toFixed(2).replace(".", ",")}` : "—";
const n = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : null;
};

async function invoke(action, payload = {}) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
  const { data, error } = await supabase.functions.invoke(fnName, {
    body: { action, ...payload },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function row(listing, result) {
  const current = n(listing?.price) ?? n(listing?.metadata?.price_eur?.value);
  const cp = n(result?.competitor_price_eur);
  const target = n(result?.target);
  return `<div class="pricing-preview-row">
    <div><b>${escapeHtml(listing?.title || "Listing")}</b></div>
    <div>${eur(current)}</div>
    <div>${eur(cp)}</div>
    <div>${eur(target)}</div>
    <div>${escapeHtml(result?.action || "no_change")}</div>
  </div>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

export async function loadCompetitivePreview(listing, rule = {}) {
  try {
    const data = await invoke("preview", { listing_id: listing.id, rule });
    return data;
  } catch (e) {
    console.error("competitive preview", e);
    return { status: "error", error: e.message || String(e), competitors: [] };
  }
}

export async function savePricingRule(listing, form) {
  const payload = {
    listing_id: listing.id,
    enabled: !!form.enabled,
    undercut_eur: n(form.undercut_eur) ?? 0.10,
    min_price_eur: n(form.min_price_eur),
    max_cut_eur: n(form.max_cut_eur),
    follow_up_enabled: !!form.follow_up_enabled,
    follow_up_raise_eur: n(form.follow_up_raise_eur) ?? 0,
    follow_up_max_price_eur: n(form.follow_up_max_price_eur),
    interval_minutes: Number(form.interval_minutes || 15),
  };
  return invoke("save_rule", payload);
}

export async function getPricingHistory(listingId) {
  return invoke("history", { listing_id: listingId });
}

export function renderCompetitorPreview(container, listing, result) {
  if (!container) return;
  if (!result || result.status === "error") {
    container.innerHTML = `<div class="pricing-empty">${escapeHtml(result?.error || "Gagal mengambil harga kompetitor.")}</div>`;
    return;
  }
  const cp = n(result.competitor_price_eur);
  const competitors = Array.isArray(result.competitors) ? result.competitors : [];
  const source = result.source || "GameBoost public marketplace";
  container.innerHTML = `
    <div class="pricing-preview-head">
      <b>Competitor Preview — READ ONLY</b>
      <small>Mode preview tidak mengubah harga GameBoost.</small>
    </div>
    <div class="pricing-preview-table">
      <div class="pricing-preview-row pricing-preview-header"><span>Listing</span><span>Kita</span><span>Kompetitor</span><span>Target</span><span>Action</span></div>
      ${row(listing, { ...result, target: result.target ?? listing.price, action: result.action ?? "no_change" })}
    </div>
    <div class="pricing-source">${cp == null ? "Kompetitor lain tidak ditemukan." : `Harga kompetitor terendah: <b>${eur(cp)}</b>`} · ${escapeHtml(source)}</div>
    ${competitors.length ? `<details><summary>${competitors.length} kompetitor terdeteksi</summary><div class="pricing-competitors">${competitors.map(c => `<div>${eur(n(c.price_eur))}${c.competitor_offer_id ? ` · offer ${escapeHtml(c.competitor_offer_id)}` : ""}</div>`).join("")}</div></details>` : ""}
  `;
}
