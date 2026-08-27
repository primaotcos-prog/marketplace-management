import { supabase } from './supabase.js';

if (!window.__listingStatusToolsLoaded) {
  window.__listingStatusToolsLoaded = true;

  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

  // Status changes use a dedicated adapter so ON/OFF can use the exact
  // GameBoost list/unlist transport independently of the general API adapter.
  const api=async body=>{
    const {data,error}=await supabase.functions.invoke('gameboost-status',{body});
    if(error){
      let detail='';
      try{if(error.context?.json){const d=await error.context.json();detail=d?.error||d?.message||(d?.gameboost_response?JSON.stringify(d.gameboost_response):'');}}catch{}
      throw new Error(detail||error.message||'GameBoost status API error');
    }
    if(!data?.ok){
      const e=new Error(data?.error||'GameBoost status API error');
      e.gameboost_status=data?.gameboost_status;
      e.remote_not_found=data?.remote_not_found;
      throw e;
    }
    return data;
  };

  const load=async()=>{
    const r=await supabase.from('listings').select('id,title,external_offer_id,status,stock,price,currency,metadata').order('created_at',{ascending:false}).limit(500);
    if(r.error)throw r.error;
    return r.data||[];
  };

  const statusOf=x=>String(x?.status||x?.metadata?.status||'').toLowerCase();
  const isMissing=x=>String(x?.metadata?.remote_sync_status||'').toLowerCase()==='missing_remote';
  const isOn=x=>!isMissing(x)&&['active','listed','published'].includes(statusOf(x));
  const badge=x=>isMissing(x)?'MISSING':(isOn(x)?'ON':'OFF');

  const style=()=>{
    if(document.getElementById('listing-status-tools-css'))return;
    const s=document.createElement('style');
    s.id='listing-status-tools-css';
    s.textContent='.lst-modal{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;display:grid;place-items:center;padding:12px}.lst-card{width:min(820px,100%);max-height:92vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px}.lst-list{display:grid;gap:7px;max-height:58vh;overflow:auto;margin-top:10px}.lst-item{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;padding:9px;border:1px solid var(--border);border-radius:9px;background:#0c1118}.lst-item strong{font-size:11px;display:block;word-break:break-word}.lst-item small{display:block;color:var(--muted);font-size:9px;margin-top:3px}.lst-badge{font-size:9px;padding:3px 7px;border-radius:999px;background:#18251f;color:#6ee7a8}.lst-badge.off{background:#252b35;color:#aab2c0}.lst-badge.missing{background:#3a2024;color:#ffabab}.lst-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px}.lst-msg{white-space:pre-wrap;font-size:11px;margin-top:10px}.lst-msg.err{color:#ffaaaa}.lst-msg.ok{color:var(--success)}';
    document.head.appendChild(s);
  };

  const open=async(pre=[])=>{
    style();
    const w=document.createElement('div');
    w.className='lst-modal';
    w.innerHTML='<div class="lst-card"><div class="panel-head"><strong>ON / OFF Listings</strong><button class="action" data-close>Tutup</button></div><p>Pilih listing yang ingin diubah. Status dikirim melalui GameBoost adapter dan diverifikasi kembali dari GameBoost.</p><div class="lst-actions" style="justify-content:space-between"><span data-count>Memuat...</span><span><button class="action" data-all>Pilih semua</button><button class="action" data-none>Batal pilih</button></span></div><div class="lst-list" data-list><div class="empty">Loading...</div></div><div class="lst-actions"><select class="status-select" data-action><option value="list">ON — Listed / aktif</option><option value="unlist">OFF — Unlisted / nonaktif</option></select><button class="action" data-close>Batal</button><button class="action primary" data-apply>Terapkan</button></div><div class="lst-msg" data-msg></div></div>';
    document.body.appendChild(w);
    w.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>w.remove());

    const list=w.querySelector('[data-list]');
    const count=w.querySelector('[data-count]');
    const msg=w.querySelector('[data-msg]');

    try{
      const items=await load();
      const selected=new Set(pre.map(String));
      if(!items.length){list.innerHTML='<div class="empty">Tidak ada listing.</div>';count.textContent='0 listing';return;}

      list.innerHTML=items.map(x=>{const missing=isMissing(x);return `<label class="lst-item"><input type="checkbox" data-id="${esc(x.id)}"${selected.has(String(x.id))?' checked':''}><span><strong>${esc(x.title||'Untitled')}</strong><small>Offer ID: ${esc(x.external_offer_id||'-')} · Stock ${Number(x.stock||0)} · ${esc(x.price??'-')} ${esc(x.currency||'')}${missing?' · Tidak ditemukan di GameBoost':''}</small></span><span class="lst-badge ${missing?'missing':(isOn(x)?'':'off')}">${badge(x)}</span></label>`}).join('');

      const update=()=>count.textContent=`${list.querySelectorAll('[data-id]:checked').length} dipilih dari ${items.length}`;
      list.addEventListener('change',update);update();
      w.querySelector('[data-all]').onclick=()=>{list.querySelectorAll('[data-id]').forEach(x=>x.checked=true);update();};
      w.querySelector('[data-none]').onclick=()=>{list.querySelectorAll('[data-id]').forEach(x=>x.checked=false);update();};

      w.querySelector('[data-apply]').onclick=async()=>{
        const ids=[...list.querySelectorAll('[data-id]:checked')].map(x=>x.dataset.id);
        const action=w.querySelector('[data-action]').value;
        const b=w.querySelector('[data-apply]');
        if(!ids.length){msg.className='lst-msg err';msg.textContent='Pilih minimal 1 listing.';return;}
        const targets=ids.map(id=>items.find(r=>String(r.id)===String(id))).filter(Boolean);
        const pending=targets.filter(x=>action==='list'?!isOn(x):isOn(x));
        const already=targets.length-pending.length;
        if(!pending.length){msg.className='lst-msg ok';msg.textContent=`Semua ${targets.length} listing sudah ${action==='list'?'ON':'OFF'} atau MISSING. Tidak ada request GameBoost yang perlu dikirim.`;return;}
        if(!confirm(`${action==='list'?'ON':'OFF'} ${pending.length} listing di GameBoost?`))return;

        b.disabled=true;let ok=0,fail=0;const errors=[];
        for(const x of pending){
          try{
            if(!x.external_offer_id)throw Error('Listing tidak memiliki Offer ID GameBoost.');
            const result=await api({operation:'set_offer_status',offer_id:x.external_offer_id,listing_id:x.id,action,title:x.title});
            const remoteStatus=String(result?.remote_status||result?.offer?.status||'').toLowerCase();
            const expected=action==='list'?['active','listed','published']:['draft','inactive','unlisted'];
            if(remoteStatus&&!expected.includes(remoteStatus))throw Error(`Status GameBoost tidak sesuai setelah perubahan: ${remoteStatus}`);
            ok++;
          }catch(e){
            fail++;
            errors.push(e.remote_not_found?`${x.title||x.id}: Offer ${x.external_offer_id} tidak ditemukan di GameBoost. Listing ditandai MISSING.`:`${x.title||x.id}: ${e.message}`);
          }
        }
        msg.className=`lst-msg ${fail?'err':'ok'}`;
        msg.textContent=`Selesai. Berhasil: ${ok}. Sudah sesuai/MISSING: ${already}. Gagal: ${fail}.${errors.length?'\\n'+errors.join('\\n'):''}`;
        b.disabled=false;
        if(ok||fail)document.querySelector('[data-sync]')?.click();
      };
    }catch(e){list.innerHTML=`<div class="empty">Gagal memuat listing: ${esc(e.message)}</div>`;count.textContent='Gagal';}
  };

  const inject=()=>{
    style();
    const list=document.getElementById('listings-list');
    const panel=list?.closest('.panel');
    const head=panel?.querySelector('.panel-head');
    if(!list||!head)return;
    if(!head.querySelector('[data-status-manager]')){
      const b=document.createElement('button');b.type='button';b.className='action listing-tool-status';b.dataset.statusManager='1';b.textContent='ON / OFF Listings';b.onclick=()=>open();
      const actions=head.querySelector('.panel-head-actions');if(actions)actions.insertBefore(b,actions.firstChild);else head.appendChild(b);
    }
  };

  document.addEventListener('click',async e=>{
    const b=e.target?.closest?.('button');if(!b)return;
    const t=String(b.textContent||'').trim().toUpperCase();
    if(!['ON','OFF'].includes(t)||!document.getElementById('listings-list'))return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    try{
      const items=await load();
      const row=b.closest('tr')||b.closest('[data-listing-row]')||b.parentElement?.parentElement;
      const text=String(row?.textContent||'').toLowerCase();
      const hit=items.find(x=>{const id=String(x.external_offer_id||'').toLowerCase();const title=String(x.title||'').toLowerCase();return (id&&text.includes(id))||(title&&text.includes(title));});
      await open(hit?[hit.id]:[]);
    }catch(err){alert(`ON/OFF gagal: ${err.message}`);}
  },true);

  const obs=new MutationObserver(inject);obs.observe(document.body,{childList:true,subtree:true});inject();setTimeout(inject,500);setTimeout(inject,1500);
}
