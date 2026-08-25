import { supabase } from './supabase.js';

const content=document.getElementById('page-content');
const title=document.getElementById('page-title');
const connectionText=document.getElementById('connection-text');
const connectionDot=document.getElementById('connection-dot');
const authGate=document.getElementById('auth-gate');
const app=document.getElementById('app');
const loginForm=document.getElementById('login-form');
const loginMessage=document.getElementById('login-message');
const logout=document.getElementById('logout');
let currentListings=[];

const esc=v=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const fmtDate=v=>{if(!v)return '-';const n=Number(v);const d=new Date(n<100000000000?n*1000:n);return Number.isNaN(d.getTime())?esc(v):d.toLocaleString()};
const api=async body=>{const {data,error}=await supabase.functions.invoke('gameboost-api',{body});if(error)throw error;if(!data?.ok)throw new Error(data?.error||'GameBoost API error');return data};

const pages={
 dashboard:{title:'Dashboard',html:`<div class="hero"><h2>GameBoost control center</h2><p>Central management for products, listings, orders, stock and automation.</p></div><div class="cards"><div class="card"><div class="card-label">Products</div><div class="card-value" id="products-count">—</div></div><div class="card"><div class="card-label">Listings</div><div class="card-value" id="listings-count">—</div></div><div class="card"><div class="card-label">Orders</div><div class="card-value" id="orders-count">—</div></div><div class="card"><div class="card-label">Stock</div><div class="card-value" id="stock-count">—</div></div></div><div class="grid"><div class="panel"><div class="panel-head"><strong>Recent orders</strong></div><div id="recent-orders" class="empty">Loading...</div></div><div class="panel"><div class="panel-head"><strong>Integration</strong><span id="integration-status" class="status">Checking</span></div><div class="panel-body"><div class="status-row"><span>Marketplace</span><strong>GameBoost</strong></div><div class="status-row"><span>Supabase</span><span id="supabase-status" class="status">Checking</span></div><div class="status-row"><span>GameBoost API</span><span id="gameboost-status" class="status">Ready</span></div></div></div></div>`},
 products:{title:'Products',html:`<div class="panel"><div class="panel-head"><strong>Products</strong><div style="display:flex;gap:8px"><button class="action" data-add-product>Add Product</button><button class="action" data-sync>Sync GameBoost</button></div></div><div id="products-list" class="empty">Loading...</div><div id="product-form"></div></div>`},
 listings:{title:'Listings',html:`<div class="panel"><div class="panel-head"><strong>GameBoost Listings</strong><div style="display:flex;gap:8px"><button class="action" data-add-product>Add Listing</button><button class="action" data-sync>Sync GameBoost</button></div></div><div id="listings-list" class="table-wrap">Loading...</div><div id="listing-detail"></div><div id="product-form"></div></div>`},
 orders:{title:'Orders',html:`<div class="panel"><strong>Orders</strong><div class="empty">Orders will appear after the order adapter is connected.</div></div>`},
 stock:{title:'Stock',html:`<div class="panel"><strong>Central Stock</strong><div class="empty">Inventory synchronization follows listings.</div></div>`},
 pricing:{title:'Pricing',html:`<div class="panel"><strong>Pricing Rules</strong><div class="empty">Pricing automation follows live marketplace data.</div></div>`},
 delivery:{title:'Delivery',html:`<div class="panel"><strong>Delivery</strong><div class="empty">Delivery follows order integration.</div></div>`},
 settings:{title:'Settings',html:`<div class="panel"><strong>Settings</strong><div class="empty">Marketplace connections and automation.</div></div>`}
};

async function stats(){try{const [p,l,o,i]=await Promise.all([supabase.from('products').select('id',{count:'exact',head:true}),supabase.from('listings').select('id',{count:'exact',head:true}),supabase.from('orders').select('id',{count:'exact',head:true}),supabase.from('inventory').select('available')]);const e=[p,l,o,i].find(x=>x.error)?.error;if(e)throw e;document.getElementById('products-count').textContent=p.count??0;document.getElementById('listings-count').textContent=l.count??0;document.getElementById('orders-count').textContent=o.count??0;document.getElementById('stock-count').textContent=(i.data||[]).reduce((s,r)=>s+Number(r.available||0),0);document.getElementById('recent-orders').textContent=o.count?`${o.count} orders available.`:'No orders yet.';document.getElementById('integration-status').textContent='Connected';document.getElementById('supabase-status').textContent='Connected';connectionText.textContent='Signed in';connectionDot.classList.add('connected')}catch(e){connectionText.textContent='Database error';document.getElementById('supabase-status').textContent=e.message}}

async function sync(){const bs=document.querySelectorAll('[data-sync]');bs.forEach(b=>{b.disabled=true;b.textContent='Syncing...'});try{const data=await api({operation:'import_offers'});alert(`Sync selesai. Ditemukan ${data.offers_found??0}, masuk ${data.imported??0}, gagal ${data.failed??0}.`);await render('listings')}catch(e){alert(`GameBoost sync gagal: ${e.message}`)}finally{bs.forEach(b=>{b.disabled=false;b.textContent='Sync GameBoost'})}}

function statusIsOn(x){const s=String(x?.metadata?.status||x?.status||'').toLowerCase();return ['active','listed'].includes(s)}

async function toggleOffer(index){const x=currentListings[index];if(!x)return;const on=statusIsOn(x);const action=on?'unlist':'list';const label=on?'OFF':'ON';if(!confirm(`${label} listing "${x.title}" di GameBoost?`))return;try{await api({operation:'set_offer_status',offer_id:x.external_offer_id,action});await listings()}catch(e){alert(`Gagal mengubah status: ${e.message}`)}}

async function refreshOffer(index){const x=currentListings[index];if(!x)return;try{await api({operation:'get_offer',offer_id:x.external_offer_id});await listings();alert('Data offer berhasil diperbarui dari GameBoost.')}catch(e){alert(`Refresh gagal: ${e.message}`)}}

let gameSearchTimer=null;
let selectedGame=null;
let selectedTemplate=null;

function templatePayload(template){
  if(template==null)return null;
  if(Array.isArray(template))return template;
  if(typeof template!=='object')return template;
  return template.template??template.data??template.schema??template;
}

function templateFields(template){
  const t=templatePayload(template);
  if(!t||typeof t!=='object'||Array.isArray(t))return [];
  const source=t.fields||t.parameters||t.item_fields||t.properties;
  if(!source)return [];
  if(Array.isArray(source))return source.map((x,i)=>typeof x==='string'?{name:x,label:x,type:'text'}:{...x,name:x.name||x.key||x.id||`field_${i+1}`,label:x.label||x.title||x.name||x.key||`Field ${i+1}`});
  return Object.entries(source).map(([name,x])=>typeof x==='string'?{name,label:name,type:'text'}:{...(x||{}),name,label:x?.label||x?.title||name});
}

function renderTemplateFields(template){
  const box=document.getElementById('template-fields');
  if(!box)return;
  const fields=templateFields(template);
  if(!fields.length){box.innerHTML='<div class="empty">Template tidak menyediakan field terstruktur. Gunakan Parameters JSON / Item data JSON di bawah.</div>';return}
  box.innerHTML=fields.map((f,i)=>{
    const type=String(f.type||f.input_type||'text').toLowerCase();
    const req=f.required?' required':'';
    const opts=Array.isArray(f.options)?f.options:Array.isArray(f.enum)?f.enum:[];
    let input;
    if(opts.length)input=`<select name="template_${i}" data-template-name="${esc(f.name)}"${req}><option value="">Pilih...</option>${opts.map(o=>{const v=typeof o==='object'?(o.value??o.id??o.name):o;const l=typeof o==='object'?(o.label??o.name??o.value):o;return `<option value="${esc(v)}">${esc(l)}</option>`}).join('')}</select>`;
    else if(type==='textarea'||type==='longtext')input=`<textarea name="template_${i}" data-template-name="${esc(f.name)}" rows="3"${req} placeholder="${esc(f.description||'')}"></textarea>`;
    else input=`<input name="template_${i}" data-template-name="${esc(f.name)}" type="${['number','integer'].includes(type)?'number':'text'}"${req} placeholder="${esc(f.description||f.placeholder||'')}">`;
    return `<label>${esc(f.label||f.name)}${f.required?' *':''}${input}</label>`;
  }).join('');
}

async function searchGames(search=''){
  const data=await api({operation:'list_games',search,sort:'name'});
  return Array.isArray(data.games)?data.games:[];
}

async function loadGameTemplate(game){
  selectedGame=game;selectedTemplate=null;
  const status=document.getElementById('game-template-status');
  const box=document.getElementById('template-preview');
  const fields=document.getElementById('template-fields');
  if(status)status.textContent=`Memuat template ${game.name}...`;
  if(box)box.textContent='Loading...';
  if(fields)fields.innerHTML='';
  try{
    const [detail,template]=await Promise.all([api({operation:'get_game',slug:game.slug}),api({operation:'get_template',slug:game.slug})]);
    selectedGame=detail.game||game;
    selectedTemplate=template.template;
    if(status)status.textContent=`Template aktif: ${selectedGame.name||game.name}`;
    if(box)box.textContent=JSON.stringify(templatePayload(selectedTemplate),null,2);
    renderTemplateFields(selectedTemplate);
    const gameId=document.querySelector('#create-product-form [name="game_id"]');
    const gameSlug=document.querySelector('#create-product-form [name="game"]');
    if(gameId)gameId.value=selectedGame.id??game.id??'';
    if(gameSlug)gameSlug.value=selectedGame.slug||game.slug||'';
  }catch(e){
    if(status)status.textContent=`Template gagal dimuat: ${e.message}`;
    if(box)box.textContent='Template tidak dapat dimuat.';
  }
}

function gamePicker(){
  const input=document.getElementById('game-search-input');
  const results=document.getElementById('game-results');
  if(!input||!results)return;
  const run=async()=>{
    const q=input.value.trim();
    results.innerHTML='<div class="empty">Mencari game...</div>';
    try{
      const games=await searchGames(q);
      if(!games.length){results.innerHTML='<div class="empty">Game tidak ditemukan.</div>';return}
      results.innerHTML=games.slice(0,30).map((g,i)=>`<button type="button" class="action" data-game-index="${i}" style="width:100%;text-align:left;margin-bottom:6px"><strong>${esc(g.name)}</strong><span style="opacity:.7;margin-left:8px">${esc(g.slug||'')}${g.acronym?` · ${esc(g.acronym)}`:''}</span></button>`).join('');
      results.querySelectorAll('[data-game-index]').forEach((b,i)=>b.addEventListener('click',()=>{
        const game=games[i];
        input.value=game.name;
        results.innerHTML='';
        document.getElementById('selected-game-label').textContent=`${game.name} · ID ${game.id} · ${game.slug}`;
        loadGameTemplate(game);
      }));
    }catch(e){results.innerHTML=`<div class="empty">Gagal mengambil game: ${esc(e.message)}</div>`}
  };
  input.addEventListener('input',()=>{clearTimeout(gameSearchTimer);gameSearchTimer=setTimeout(run,250)});
  input.addEventListener('focus',()=>{if(!input.value.trim())run()});
}

function collectTemplateData(form){
  const out={};
  form.querySelectorAll('[data-template-name]').forEach(el=>{const v=String(el.value??'').trim();if(v)out[el.dataset.templateName]=v});
  return out;
}

function productForm(){const box=document.getElementById('product-form');if(!box)return;selectedGame=null;selectedTemplate=null;box.innerHTML=`<div class="panel" style="margin-top:12px"><div class="panel-head"><strong>Tambah produk / listing GameBoost</strong><button class="action" data-close-form>Tutup</button></div><form id="create-product-form"><input type="hidden" name="game_id"><input type="hidden" name="game"><div class="form-grid"><label style="grid-column:1/-1">Cari Game<input id="game-search-input" autocomplete="off" placeholder="Ketik nama game, slug, acronym, atau ID..." required><div id="game-results" style="margin-top:8px"></div><div id="selected-game-label" class="status" style="margin-top:8px">Belum memilih game</div></label><label style="grid-column:1/-1"><span>Template GameBoost</span><div id="game-template-status" class="status" style="margin-top:6px">Pilih game untuk memuat template.</div><pre id="template-preview" style="max-height:180px;overflow:auto;white-space:pre-wrap;margin:8px 0 0">-</pre></label><div id="template-fields" class="form-grid" style="grid-column:1/-1"></div><label>Judul<input name="title" required placeholder="Nama produk"></label><label>Harga EUR<input name="price" type="number" min="0.01" step="0.01" required placeholder="2.20"></label><label>Stock<input name="stock" type="number" min="0" step="1" value="1" required></label><label>Min quantity<input name="min_quantity" type="number" min="1" step="1" value="1"></label><label>Delivery method<select name="delivery_method"><option value="trade">trade</option><option value="username">username</option><option value="gift">gift</option><option value="mail">mail</option><option value="redeem">redeem</option><option value="none">none</option></select></label><label style="grid-column:1/-1">Description<textarea name="description" rows="4" placeholder="Deskripsi produk"></textarea></label><label style="grid-column:1/-1">Parameters JSON<textarea name="parameters" rows="3" placeholder='{"item_type":"Brainrot"}'></textarea></label><label style="grid-column:1/-1">Item data JSON<textarea name="item_data" rows="3" placeholder='{}'></textarea></label><label style="grid-column:1/-1">Image URLs (satu per baris)<textarea name="image_urls" rows="3" placeholder="https://..."></textarea></label></div><button class="action" type="submit" style="margin-top:12px">Buat Produk</button><div id="create-product-message" class="empty" style="display:none"></div></form></div>`;box.querySelector('[data-close-form]').addEventListener('click',()=>box.innerHTML='');gamePicker();box.querySelector('#create-product-form').addEventListener('submit',createProduct)}

async function createProduct(e){e.preventDefault();const form=e.currentTarget;const msg=form.querySelector('#create-product-message');const fd=new FormData(form);if(!selectedGame){msg.style.display='block';msg.textContent='Pilih game terlebih dahulu.';return}let parameters=null,item_data=null;for(const [key,target] of [['parameters','parameters'],['item_data','item_data']]){const raw=String(fd.get(key)||'').trim();if(raw){try{const parsed=JSON.parse(raw);if(target==='parameters')parameters=parsed;else item_data=parsed}catch{msg.style.display='block';msg.textContent=`${key} harus JSON yang valid.`;return}}}const templateData=collectTemplateData(form);const image_urls=String(fd.get('image_urls')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const payload={game_id:Number(selectedGame.id),game:String(selectedGame.slug||''),title:String(fd.get('title')).trim(),description:String(fd.get('description')||'').trim()||null,price:Number(fd.get('price')),stock:Number(fd.get('stock')),min_quantity:Number(fd.get('min_quantity')||1),delivery_method:String(fd.get('delivery_method')||'trade'),parameters,item_data,template_data:templateData,image_urls};const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Membuat...';try{await api({operation:'create_offer',...payload});msg.style.display='block';msg.textContent='Produk berhasil dibuat di GameBoost.';await render('listings')}catch(err){msg.style.display='block';msg.textContent=`Gagal membuat produk: ${err.message}`}finally{btn.disabled=false;btn.textContent='Buat Produk'}}

function detail(i){const x=currentListings[i];if(!x)return;const m=x.metadata||{};const game=m.game||{};const pt=m.parameters||{};const dt=m.delivery_time||{};const price=m.price_eur||{};const img=(m.image_urls||[])[0];const box=document.getElementById('listing-detail');const on=statusIsOn(x);box.innerHTML=`<div class="panel" style="margin-top:12px"><div class="panel-head"><strong>Offer detail</strong><div style="display:flex;gap:8px"><button class="action" data-toggle-detail>${on?'OFF':'ON'}</button><button class="action" data-refresh-detail>Refresh</button><button class="action" data-close-detail>Close</button></div></div>${img?`<img src="${esc(img)}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:10px;margin-bottom:12px">`:''}<div class="status-row"><span>Title</span><strong>${esc(x.title)}</strong></div><div class="status-row"><span>Offer ID</span><span>${esc(x.external_offer_id)}</span></div><div class="status-row"><span>Game</span><span>${esc(game.name||'-')} (${esc(game.slug||'-')})</span></div><div class="status-row"><span>Game ID</span><span>${esc(game.id||'-')}</span></div><div class="status-row"><span>Price</span><span>${esc(price.format||x.price+' EUR')} · USD ${esc(m.price_usd?.format||'-')}</span></div><div class="status-row"><span>Stock</span><span>${esc(m.stock??x.stock)} · Min ${esc(m.min_quantity??1)}</span></div><div class="status-row"><span>GameBoost status</span><span>${esc(m.status||x.status)}</span></div><div class="status-row"><span>Delivery</span><span>${esc(dt.format_long||dt.format||'-')} · ${esc(m.delivery_method||'-')}</span></div><div class="status-row"><span>Parameters</span><span>${esc(Object.entries(pt).map(([k,v])=>`${k}: ${v}`).join(' · ')||'-')}</span></div><div class="status-row"><span>Views</span><span>${esc(m.views??0)}</span></div><div class="status-row"><span>Updated</span><span>${fmtDate(m.updated_at)}</span></div><div class="status-row"><span>External ID</span><span>${esc(m.external_id||'-')}</span></div><div style="margin-top:12px"><strong>Description</strong><div class="empty" style="white-space:pre-wrap;text-align:left;margin-top:8px">${esc(m.description||'-')}</div></div></div>`;box.querySelector('[data-close-detail]').addEventListener('click',()=>box.innerHTML='');box.querySelector('[data-toggle-detail]').addEventListener('click',()=>toggleOffer(i));box.querySelector('[data-refresh-detail]').addEventListener('click',()=>refreshOffer(i))}

async function listings(){const box=document.getElementById('listings-list');try{const {data,error}=await supabase.from('listings').select('id,title,external_offer_id,price,currency,stock,status,metadata,updated_at').order('updated_at',{ascending:false}).limit(100);if(error)throw error;currentListings=data||[];if(!data?.length){box.innerHTML='<div class="empty">Belum ada listing. Tekan Add Listing atau Sync GameBoost.</div>';return}box.innerHTML=`<table><thead><tr><th>Title</th><th>Offer ID</th><th>Price</th><th>Stock</th><th>Status</th><th>On/Off</th></tr></thead><tbody>${data.map((x,i)=>{const on=statusIsOn(x);return `<tr data-listing="${i}" style="cursor:pointer"><td>${esc(x.title)}</td><td>${esc(x.external_offer_id||'-')}</td><td>${esc(x.price)} ${esc(x.currency)}</td><td>${x.stock}</td><td>${on?'active':esc(x.status)}</td><td><button class="action" data-toggle="${i}" style="min-width:54px">${on?'ON':'OFF'}</button></td></tr>`}).join('')}</tbody></table>`;box.querySelectorAll('[data-listing]').forEach(r=>r.addEventListener('click',()=>detail(Number(r.dataset.listing))));box.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();toggleOffer(Number(b.dataset.toggle))}))}catch(e){box.textContent=e.message}}

async function loadProducts(){const box=document.getElementById('products-list');if(!box)return;const {data,error}=await supabase.from('products').select('name,game,active').order('updated_at',{ascending:false}).limit(100);if(error){box.textContent=error.message;return}box.innerHTML=data?.length?data.map(x=>`<div class="status-row"><span>${esc(x.name)}</span><span>${esc(x.game||'')} · ${x.active?'Active':'Inactive'}</span></div>`).join(''):'<div class="empty">Belum ada product. Gunakan Add Product untuk membuat listing baru di GameBoost.</div>'}

async function render(page){const x=pages[page]||pages.dashboard;title.textContent=x.title;content.innerHTML=x.html;document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));if(page==='dashboard')await stats();if(page==='listings')await listings();if(page==='products')await loadProducts();document.querySelectorAll('[data-sync]').forEach(b=>b.addEventListener('click',sync));document.querySelectorAll('[data-add-product]').forEach(b=>b.addEventListener('click',productForm))}

async function showApp(){authGate.hidden=true;app.hidden=false;await render('dashboard')}
async function showLogin(){app.hidden=true;authGate.hidden=false}
if(loginForm){loginForm.addEventListener('submit',async e=>{e.preventDefault();loginMessage.textContent='Memproses...';const email=document.getElementById('login-email').value.trim();const password=document.getElementById('login-password').value;const {error}=await supabase.auth.signInWithPassword({email,password});if(error){loginMessage.textContent=error.message;return}loginMessage.textContent='';await showApp()})}
if(logout)logout.addEventListener('click',async()=>{await supabase.auth.signOut();await showLogin()});
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>render(b.dataset.page)));
supabase.auth.onAuthStateChange((_event,session)=>{if(session){authGate.hidden=true;app.hidden=false}else{app.hidden=true;authGate.hidden=false}});
supabase.auth.getSession().then(({data})=>{if(data.session)showApp();else showLogin()});