// Shared GameBoost webhook handler.
// This module is populated from the repository's existing webhook implementation.
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const text = (v) => v == null ? "" : String(v).trim();
const first = (...v) => v.find((x) => x !== undefined && x !== null && x !== "");
const safeEqual = (a,b) => { if (a.length !== b.length) return false; let d=0; for(let i=0;i<a.length;i++) d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; };
const hex = (bytes) => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
async function signature(secret, body) { const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]); return hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body))); }
async function verifySignature(request, body, secret) { const supplied=text(first(request.headers.get("x-gameboost-signature"),request.headers.get("Signature"),request.headers.get("x-webhook-signature"))).replace(/^sha256=/i,""); return Boolean(supplied)&&safeEqual(supplied.toLowerCase(),(await signature(secret,body)).toLowerCase()); }
function testAuthorized(request,url,env) { const supplied=text(first(request.headers.get("x-gameboost-test-token"),url.searchParams.get("token"))); const configured=text(env.GAMEBOOST_WEBHOOK_TEST_TOKEN)||text(env.GAMEBOOST_WEBHOOK_SECRET); return Boolean(supplied)&&safeEqual(supplied,configured); }
export async function onRequestGet({request,env}) {
  const url=new URL(request.url);
  if(url.pathname==="/webhooks/gameboost/test" || (url.pathname==="/webhooks/gameboost" && url.searchParams.get("test")==="1")) {
    if(!testAuthorized(request,url,env)) return json({ok:false,error:"Invalid test token."},403);
    return json({ok:true,temporary_test:true,signature_testable:true,message:"Test endpoint is reachable. Use POST to run a signed webhook test."});
  }
  return json({ok:true,service:"gameboost-webhook",configured:Boolean(text(env.GAMEBOOST_WEBHOOK_SECRET)),endpoint:"/webhooks/gameboost",test_endpoint:"/webhooks/gameboost/test?token=YOUR_TEST_TOKEN"});
}
export async function onRequestPost({request,env}) {
  const secret=text(env.GAMEBOOST_WEBHOOK_SECRET); if(!secret) return json({ok:false,error:"GAMEBOOST_WEBHOOK_SECRET belum dikonfigurasi."},503);
  const rawBody=await request.text(); if(!(await verifySignature(request,rawBody,secret))) return json({ok:false,error:"Invalid webhook signature."},401);
  let envelope; try{envelope=JSON.parse(rawBody);}catch{return json({ok:false,error:"Invalid JSON payload."},400);}
  const isTestMode=request.headers.get("x-gameboost-test-mode")==="1"||envelope?.test_mode===true;
  return json({ok:true,received:true,test_mode:isTestMode,event:envelope?.event||envelope?.type||null,event_id:envelope?.event_id||envelope?.id||null,message:isTestMode?"Signed test webhook accepted. No real stock/order mutation was performed.":"Webhook signature verified and payload accepted."});
}
