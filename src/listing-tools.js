import { supabase } from './supabase.js';

if (!window.__listingToolsLoaded) {
  window.__listingToolsLoaded = true;

  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const api=async body=>{const {data,error}=await supabase.functions.invoke('gameboost-api',{body});if(error)throw error;if(!data?.ok)throw new Error(data?.error||'GameBoost API error');return data};
  const archiveApi=async offer_id=>{const {data,error}=await supabase.functions.invoke('gameboost-archive',{body:{offer_id}});if(error)throw error;if(!data?.ok)throw new Error(data?.error||'GameBoost archive gagal');return data};

  function styles(){
    if(document.getElementById('listing-tools-styles'))return;
    const s=document.createElement('style');s.id='listing-tools-styles';
    s.textContent='.listing-tools{display:flex;gap:8px;flex-wrap:wrap}.listing-tools .action{white-space:nowrap}.listing-tool-danger{border-color:#7f3030!important}.listing-tools-modal{position:fixed;inset:0;background:rgba(0,0,0,.68);z-index:9999;display:grid;place-items:center;padding:12px}.listing-tools-card{width:min(820px,100%);max-height:92vh;overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px}.listing-tools-card textarea{box-sizing:border-box;width:100%;min-height:260px;background:#090d13;color:var(--text);border:1px solid var(--border);border-radius:9px;padding:10px;font:11px/1.5 ui-monospace,SFMono-Regular,monospace}.listing-tools-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px}.listing-tools-msg{white-space:pre-wrap;font-size:11px;margin-top:10px}.listing-tools-msg.err{color:#ffaaaa}.listing-tools-msg.ok{color:var(--success)}.delete-list{display:grid;gap:7px;max-height:52vh;overflow:auto;margin-top:10px}.delete-item{display:grid;grid-template-columns:auto 1fr;gap:9px;padding:9px;border:1px solid var(--border);border-radius:9px;background:#0c1118}.delete-item strong{font-size:11px;word-break:break-word}.delete-item small{display:block;color:var(--muted);font-size:9px;margin-top:3px}';
    document.head.appendChild(s);
  }

  function modal(title,body){
    const w=document.createElement('div');w.className='listing-tools-modal';
    w.innerHTML=`<div class="listing-tools-card"><div class="panel-head"><strong>${esc(title)}</strong><button class="action" data-close-tools>Tutup</button></div>${body}</div>`;
    document.body.appendChild(w);w.querySelector('[data-close-tools]').onclick=()=>w.remove();w.addEventListener('click',e=>{if(e.target===w)w.remove()});return w;
  }

  function bulk(){
    styles();
    const sample=JSON.stringify([{game:'game-slug',title:'Nama Listing',description:'Deskripsi',price:1.25,stock:10,min_quantity:1,delivery_method:'username',delivery_time:{duration:20,unit:'minutes'},image_urls:[]}],null,2);
    const m=modal('Bulk Listing GameBoost',`<p>Masukkan JSON array. Setiap item diproses satu per satu.</p><textarea id="bulk-json">${esc(sample)}</textarea><div class="listing-tools-actions"><button class="action" data-close-tools>Batal</button><button class="action primary" data-run-bulk>Buat Listing</button></div><div class="listing-tools-msg" data-msg></div>`);
    m.querySelector('[data-run-bulk]').onclick=async()=>{const b=m.querySelector('[data-run-bulk]'),msg=m.querySelector('[data-msg]');let items;try{items=JSON.parse(m.querySelector('#bulk-json').value);if(!Array.isArray(items)||!items.length)throw Error('JSON harus berupa array dan berisi minimal 1 listing.');if(items.length>100)throw Error('Maksimal 100 listing per proses.')}catch(e){msg.className='listing-tools-msg err';msg.textContent=e.message;return}b.disabled=true;let ok=0,fail=0,errors=[];for(let i=0;i<items.length;i++){try{await api({operation:'create_offer',...items[i]});ok++}catch(e){fail++;errors.push(`#${i+1}: ${e.message}`)}}msg.className=`listing-tools-msg ${fail?'err':'ok'}`;msg.textContent=`Selesai. Berhasil: ${ok}. Gagal: ${fail}.${errors.length?'\n'+errors.join('\n'):''}`;b.disabled=false;if(ok)document.querySelector('[data-sync]')?.click()};
  }

  async function removeListings(){
    styles();
    const m=modal('Arsipkan & Hapus Listings',`<p>Listing yang dipilih akan <b>di-archive di GameBoost terlebih dahulu</b>. Sistem memverifikasi status GameBoost. Hanya jika berhasil, listing lokal dihapus dari dashboard ini.</p><div class="listing-tools-actions" style="justify-content:space-between"><span data-count>Memuat...</span><button class="action" data-all>Pilih semua</button></div><div class="delete-list" data-list><div class="empty">Loading...</div></div><div class="listing-tools-actions"><button class="action" data-close-tools>Batal</button><button class="action listing-tool-danger" data-delete>Arsipkan & Hapus</button></div><div class="listing-tools-msg" data-msg></div>`);
    const list=m.querySelector('[data-list]'),count=m.querySelector('[data-count]');let items;
    try{
      const r=await supabase.from('listings').select('id,title,external_offer_id,status,stock,price,currency').order('created_at',{ascending:false}).limit(500);if(r.error)throw r.error;items=r.data||[];
      if(!items.length){list.innerHTML='<div class="empty">Tidak ada listing.</div>';count.textContent='0 listing';return}
      list.innerHTML=items.map(x=>`<label class="delete-item"><input type="checkbox" data-id="${esc(x.id)}"><span><strong>${esc(x.title||'Untitled')}</strong><small>Offer ID: ${esc(x.external_offer_id||'-')} · ${esc(x.price??'-')} ${esc(x.currency||'')} · Stock ${Number(x.stock||0)} · Status ${esc(x.status||'-')}</small></span></label>`).join('');
      const updateCount=()=>count.textContent=`${list.querySelectorAll('[data-id]:checked').length} dipilih dari ${items.length}`;list.addEventListener('change',updateCount);updateCount();
      m.querySelector('[data-all]').onclick=()=>{const boxes=[...list.querySelectorAll('[data-id]')],all=boxes.length&&boxes.every(x=>x.checked);boxes.forEach(x=>x.checked=!all);updateCount()};
      m.querySelector('[data-delete]').onclick=async()=>{
        const ids=[...list.querySelectorAll('[data-id]:checked')].map(x=>x.dataset.id),msg=m.querySelector('[data-msg]');
        if(!ids.length){msg.className='listing-tools-msg err';msg.textContent='Pilih minimal 1 listing.';return}
        if(!confirm(`Arsipkan di GameBoost lalu hapus ${ids.length} listing dari dashboard?`))return;
        let ok=0,fail=0,errors=[];const b=m.querySelector('[data-delete]');b.disabled=true;
        for(const id of ids){
          const x=items.find(r=>r.id===id);
          try{if(!x?.external_offer_id)throw Error('Listing tidak memiliki Offer ID GameBoost.');await archiveApi(x.external_offer_id);const q=await supabase.from('listings').delete().eq('id',id);if(q.error)throw q.error;ok++}catch(e){fail++;errors.push(`${x?.title||id}: ${e.message}`)}
        }
        msg.className=`listing-tools-msg ${fail?'err':'ok'}`;msg.textContent=`Selesai. Berhasil diarsipkan & dihapus lokal: ${ok}. Gagal: ${fail}.${errors.length?'\n'+errors.join('\n'):''}`;b.disabled=false;
        if(ok)document.querySelector('[data-sync]')?.click();
      };
    }catch(e){list.innerHTML=`<div class="empty">Gagal memuat listing: ${esc(e.message)}</div>`;count.textContent='Gagal'}
  }

  function inject(){
    styles();
    const list=document.getElementById('listings-list');
    if(!list)return false;
    const panel=list.closest('.panel');
    const head=panel?.querySelector('.panel-head');
    if(!panel||!head)return false;
    let bar=head.querySelector('[data-listing-tools]');
    if(bar)return true;
    bar=document.createElement('div');
    bar.className='listing-tools';
    bar.dataset.listingTools='1';
    bar.innerHTML='<button type="button" class="action" data-bulk-listing>Bulk Listing</button><button type="button" class="action listing-tool-danger" data-delete-listings>Arsipkan & Hapus</button>';
    const actions=head.querySelector('.panel-head-actions');
    if(actions){actions.insertBefore(bar,actions.firstChild)}else{head.appendChild(bar)}
    bar.querySelector('[data-bulk-listing]').onclick=bulk;
    bar.querySelector('[data-delete-listings]').onclick=removeListings;
    return true;
  }

  const observer=new MutationObserver(()=>inject());
  observer.observe(document.body,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});
  else inject();
  setTimeout(inject,300);
  setTimeout(inject,1000);
  setTimeout(inject,2500);
}
