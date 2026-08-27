// pricing.js
import { supabase } from "./supabase.js";

const fnName = "competitive-pricing";
const num = (v) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^0-9,.-]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const esc = (s) => String(s ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const eur = (v) => Number.isFinite(Number(v)) ? `€${Number(v).toFixed(2).replace(".", ",")}` : "—";

function installPricingUI(){
  if(document.getElementById("pricing-reference-ui")) return;
  const style=document.createElement("style");
  style.id="pricing-reference-ui";
  style.textContent=`
    .pricing-page-panel{background:linear-gradient(180deg,#101722,#0d131c);border:1px solid #273243;border-radius:14px;overflow:hidden}
    .pricing-page-panel>.panel-head{padding:18px 20px;border-bottom:1px solid #273243}
    .pricing-preview{margin:0!important;padding:0!important;background:transparent!important;border:0!important}
    .pricing-preview-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px;border-bottom:1px solid #273243}
    .pricing-preview-head b{font-size:16px;letter-spacing:-.01em}.pricing-preview-head small{display:block;color:#8d99aa;font-size:11px;margin-top:4px}
    .pricing-preview-table{padding:0 20px}
    .pricing-preview-row{display:grid;grid-template-columns:minmax(220px,1.8fr) repeat(4,minmax(95px,1fr));gap:16px;align-items:center;padding:15px 0;border-bottom:1px solid #202a38}
    .pricing-preview-row span{min-width:0;font-size:12px;color:#cbd3df}.pricing-preview-row span b{color:#f1f4f8;font-size:13px}.pricing-preview-header{padding:12px 0;color:#8793a5;font-weight:700}.pricing-preview-header span{color:#8793a5;font-size:11px}
    .pricing-preview-row:not(.pricing-preview-header) span:nth-child(3),.pricing-preview-row:not(.pricing-preview-header) span:nth-child(4){font-weight:800;font-size:18px;color:#54e19d}
    .pricing-preview-row:not(.pricing-preview-header) span:nth-child(5){font-weight:800;color:#62e6a8}
    .pricing-source{margin:14px 20px;padding:10px 12px;border:1px solid #263346;border-radius:9px;background:#0a1017;color:#9ba6b6;font-size:11px}
    .pricing-source b{color:#5be1a2}.pricing-preview details{margin:0 20px 16px;color:#9da8b8;font-size:11px}.pricing-preview details>div{padding:7px 0;border-bottom:1px solid #202a38}
    .pricing-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:0 20px 18px;border:1px solid #273243;border-radius:11px;overflow:hidden;background:#0d131c}
    .pricing-stat{padding:14px 16px;border-right:1px solid #273243}.pricing-stat:last-child{border-right:0}.pricing-stat small{display:block;color:#8b96a8;font-size:10px;margin-bottom:5px}.pricing-stat strong{font-size:17px;color:#edf2f8}.pricing-stat em{font-style:normal;color:#54e19d;font-size:11px;margin-left:5px}
    .pricing-rule-panel{margin-top:14px!important;padding:20px!important;background:#101722;border:1px solid #273243;border-radius:14px}
    .pricing-rule-panel>.panel-head{padding:0 0 14px;margin-bottom:14px;border-bottom:1px solid #273243}
    .pricing-rule-panel .form-grid,.pricing-rule-panel .pricing-form-grid{gap:12px}
    .pricing-rule-panel label{font-size:11px;color:#aab5c5}
    .pricing-rule-panel input,.pricing-rule-panel select,.pricing-rule-panel textarea{background:#080e15;border-color:#293548;border-radius:8px;min-height:40px}
    .pricing-rule-panel input:focus,.pricing-rule-panel select:focus,.pricing-rule-panel textarea:focus{border-color:#657eff;box-shadow:0 0 0 2px rgba(101,126,255,.12)}
    .pricing-rule-panel .form-actions{margin-top:16px;padding-top:14px}
    .pricing-rule-panel .action.primary{min-width:190px}
    .pricing-rule-columns{display:grid;grid-template-columns:1fr 1fr;gap:22px}
    .pricing-rule-section{padding:14px 0}.pricing-rule-section+.pricing-rule-section{border-left:1px solid #273243;padding-left:22px}
    .pricing-section-title{font-weight:800;font-size:13px;margin-bottom:5px}.pricing-section-help{font-size:10px;color:#7f8b9d;line-height:1.45;margin-bottom:12px}
    .pricing-toggle{display:flex;align-items:center;gap:9px;margin-bottom:12px;font-size:12px;color:#d7dee8}.pricing-toggle input{accent-color:#4f7cff}
    .pricing-back{margin-left:auto}
    @media(max-width:900px){.pricing-preview-row{grid-template-columns:minmax(170px,1.5fr) repeat(4,minmax(80px,1fr));gap:9px}.pricing-rule-columns{grid-template-columns:1fr}.pricing-rule-section+.pricing-rule-section{border-left:0;border-top:1px solid #273243;padding-left:0;padding-top:18px}.pricing-stats{grid-template-columns:1fr 1fr}.pricing-stat:last-child{grid-column:1/-1;border-top:1px solid #273243}}
    @media(max-width:640px){.pricing-preview-head{padding:14px 14px;display:block}.pricing-preview-table{padding:0 14px;overflow-x:auto}.pricing-preview-row{min-width:620px;grid-template-columns:minmax(190px,1.6fr) repeat(4,90px);gap:8px;padding:12px 0}.pricing-preview-header{position:sticky;left:0}.pricing-source{margin:12px 14px}.pricing-preview details{margin:0 14px 14px}.pricing-stats{margin:0 14px 14px;grid-template-columns:1fr}.pricing-stat{border-right:0;border-bottom:1px solid #273243}.pricing-stat:last-child{grid-column:auto;border-bottom:0}.pricing-rule-panel{padding:14px!important}.pricing-rule-panel .panel-head-actions{width:100%}.pricing-rule-panel .action.primary{width:100%}}
  `;
  document.head.appendChild(style);
}

function decoratePricingPanels(){
  installPricingUI();
  document.querySelectorAll(".panel").forEach(panel=>{
    const text=(panel.textContent||"").toLowerCase();
    if(text.includes("pricing rule") || text.includes("pricing rules")) panel.classList.add("pricing-rule-panel");
    if(panel.querySelector(".pricing-preview-head")) panel.classList.add("pricing-page-panel");
  });
}

async function invoke(action, payload = {}) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sesi login tidak ditemukan. Silakan login kembali.");
  const { data, error } = await supabase.functions.invoke(fnName, { body: { action, ...payload }, headers: { Authorization: `Bearer ${session.access_token}` } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function loadCompetitivePreview(listing, rule = {}) {
  installPricingUI();
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
  installPricingUI();
  decoratePricingPanels();
  if (!result || result.status === "error") { container.innerHTML = `<div class="pricing-empty">${esc(result?.error || "Gagal mengambil harga kompetitor.")}</div>`; return; }
  const cp = num(result.competitor_price_eur);
  const competitors = Array.isArray(result.competitors) ? result.competitors : [];
  const current = num(listing?.price) ?? num(listing?.metadata?.price_eur?.value);
  const target = num(result.target) ?? current;
  const action = String(result.action || "no_change");
  const seller = result.competitor_seller || result.seller || result.competitor?.seller || "";
  const count = num(result.competitor_count ?? result.listings_found ?? result.total_competitors);
  const undercut = cp != null && current != null ? Math.max(0,current-cp) : null;
  const remaining = num(result.remaining_auto_cut_eur ?? result.max_cut_remaining_eur);
  container.classList.add("pricing-preview");
  container.innerHTML = `<div class="pricing-preview-head"><div><b>Competitor Preview — READ ONLY</b><small>Preview hanya membaca harga marketplace dan tidak mengubah harga GameBoost.</small></div><button type="button" class="action pricing-back" data-pricing-refresh>↻ Refresh Preview</button></div><div class="pricing-preview-table"><div class="pricing-preview-row pricing-preview-header"><span>Listing</span><span>Kita</span><span>Kompetitor (termurah)</span><span>Target</span><span>Action</span></div><div class="pricing-preview-row"><span><b>${esc(listing?.title || "Listing")}</b></span><span>${eur(current)}</span><span><b>${eur(cp)}</b>${seller?`<small style="display:block;color:#8b96a8;margin-top:4px">Seller: ${esc(seller)}</small>`:""}${count!=null?`<small style="display:block;color:#8b96a8;margin-top:2px">${count} listings found</small>`:""}</span><span>${eur(target)}</span><span><strong>${esc(action)}</strong></span></div></div><div class="pricing-stats"><div class="pricing-stat"><small>Minimum price</small><strong>${eur(num(result.minimum_price_eur ?? result.min_price_eur))}</strong></div><div class="pricing-stat"><small>Maximum total auto-cut</small><strong>${eur(num(result.max_cut_eur))}</strong>${remaining!=null?`<em>tersisa ${eur(remaining)}</em>`:""}</div><div class="pricing-stat"><small>Total auto-cut saat ini</small><strong>${eur(num(result.total_auto_cut_eur ?? undercut))}</strong></div></div><div class="pricing-source">${cp == null ? "Kompetitor lain tidak ditemukan." : `Harga kompetitor terendah: <b>${eur(cp)}</b>`} · ${esc(result.source || "GameBoost")}</div>${competitors.length ? `<details><summary>${competitors.length} kompetitor terdeteksi</summary>${competitors.map(c => `<div>${eur(num(c.price_eur))}${c.competitor_offer_id ? ` · offer ${esc(c.competitor_offer_id)}` : ""}${c.seller?` · ${esc(c.seller)}`:""}</div>`).join("")}</details>` : ""}`;
  decoratePricingPanels();
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", decoratePricingPanels, { once:true });
else decoratePricingPanels();
const pricingObserver = new MutationObserver(() => decoratePricingPanels());
pricingObserver.observe(document.body, { childList:true, subtree:true });
