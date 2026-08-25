import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const first = (...v: unknown[]) => v.find((x) => x !== undefined && x !== null && x !== "");
const num = (v: unknown) => { if (v == null || v === "") return null; if (typeof v === "number") return Number.isFinite(v) ? v : null; const t = String(v).trim().replace(/[^0-9,.-]/g, ""); if (!t) return null; const c=t.lastIndexOf(","), d=t.lastIndexOf("."); const n=Number(c!==-1&&d!==-1?(c>d?t.replace(/\./g,"").replace(",","."):t.replace(/,/g,"")):c!==-1?t.replace(",","."):t); return Number.isFinite(n)?n:null; };
const stock = (v: unknown) => Math.max(0, Math.trunc(num(v) ?? 0));
const extractOffers = (p: any): any[] => { if (Array.isArray(p)) return p; if (!p || typeof p !== "object") return []; for (const v of [p.data,p.items,p.offers,p.results]) { if (Array.isArray(v)) return v; if (v && typeof v === "object") { const n=extractOffers(v); if(n.length)return n; } } return []; };
const price = (v: any) => v && typeof v === "object" ? first(v.value, v.amount != null ? Number(v.amount)/100 : null) : num(v);

async function fetchGB() {
  const key=Deno.env.get("GAMEBOOST_API_KEY"); if(!key) throw new Error("GAMEBOOST_API_KEY belum dikonfigurasi.");
  const base=Deno.env.get("GAMEBOOST_BASE_URL")||"https://api.gameboost.com/v2";
  const response=await fetch(base.replace(/\/$/,"")+"/item-offers",{headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json",Accept:"application/json"}});
  const text=await response.text(); let data:any; try{data=text?JSON.parse(text):null}catch{data={raw:text};}
  if(!response.ok) throw new Error(data?.message||data?.error||`GameBoost HTTP ${response.status}`);
  return {status:response.status,data,offers:extractOffers(data),endpoint:"/item-offers"};
}

async function getAccount(s:any){
  const q=await s.from("marketplace_accounts").select("*").eq("marketplace","gameboost").eq("display_name","GameBoost").limit(1); if(q.error)throw q.error;
  if(q.data?.[0]){const u=await s.from("marketplace_accounts").update({status:"connected",updated_at:new Date().toISOString()}).eq("id",q.data[0].id).select("*").single();if(u.error)throw u.error;return u.data;}
  const c=await s.from("marketplace_accounts").insert({marketplace:"gameboost",display_name:"GameBoost",status:"connected"}).select("*").single();if(c.error)throw c.error;return c.data;
}
async function upsertProduct(s:any,o:any){
  const g=o?.game||{}, game=String(first(g.name,o.game_name,o.game,"Unknown Game")), name=String(first(o.product_name,o.title,o.name,`GameBoost ${o.id??"Offer"}`));
  const q=await s.from("products").select("*").eq("game",game).eq("name",name).limit(1);if(q.error)throw q.error;if(q.data?.[0])return q.data[0];
  const c=await s.from("products").insert({name,game,product_type:"gameboost_offer",description:first(o.description,null),active:true}).select("*").single();if(c.error)throw c.error;return c.data;
}
async function upsertListing(s:any,a:any,p:any,o:any){
  const id=String(first(o.id,o.uuid,o.offer_id,o.external_id,""));if(!id)throw new Error("Offer GameBoost tidak memiliki id/uuid/offer_id/external_id.");
  const payload={product_id:p.id,marketplace_account_id:a.id,external_listing_id:id,title:String(first(o.title,o.name,p.name,`Offer ${id}`)),status:String(first(o.status,"active")),price:price(first(o.price_eur,o.price)),currency:o.price_eur!==undefined?"EUR":String(first(o.currency,"EUR")),stock:stock(first(o.stock,o.marketplace_stock,o.quantity)),external_data:o,last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const q=await s.from("listings").select("id").eq("marketplace_account_id",a.id).eq("external_listing_id",id).limit(1);if(q.error)throw q.error;
  if(q.data?.[0]){const u=await s.from("listings").update(payload).eq("id",q.data[0].id).select("*").single();if(u.error)throw u.error;return u.data;}
  const c=await s.from("listings").insert(payload).select("*").single();if(c.error)throw c.error;return c.data;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"POST only"},405);
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return json({ok:false,error:"Supabase server credentials are not configured."},500);
  const s=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});let body:any={};try{body=await req.json();}catch{}
  if((body?.operation||"health")==="health")return json({ok:true,configured:Boolean(Deno.env.get("GAMEBOOST_API_KEY")),base_url:Deno.env.get("GAMEBOOST_BASE_URL")||"https://api.gameboost.com/v2"});
  if((body?.operation||"import_offers")!=="import_offers")return json({ok:false,error:"Unsupported operation",allowed:["health","import_offers"]},400);
  const started=Date.now();try{
    const gb=await fetchGB(),a=await getAccount(s);let imported=0,failed=0;const errors:any[]=[];
    for(const o of gb.offers){try{const p=await upsertProduct(s,o);await upsertListing(s,a,p,o);imported++;}catch(e){failed++;if(errors.length<25)errors.push({offer_id:first(o?.id,o?.uuid,o?.offer_id,null),message:e instanceof Error?e.message:String(e)});}}
    await s.from("sync_logs").insert({marketplace_account_id:a.id,operation:"import_item_offers",status:failed?"partial":"success",message:`GameBoost HTTP ${gb.status}: ${imported} imported, ${failed} failed.`,metadata:{endpoint:gb.endpoint,gameboost_status:gb.status,offers_found:gb.offers.length,failed,errors}});
    return json({ok:failed===0,gameboost_status:gb.status,offers_found:gb.offers.length,imported,failed,duration_ms:Date.now()-started,errors});
  }catch(e){return json({ok:false,error:e instanceof Error?e.message:String(e),duration_ms:Date.now()-started},502);}
});