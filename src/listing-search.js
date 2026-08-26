const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

function enhanceListings() {
  const list = document.getElementById('listings-list');
  if (!list || list.dataset.searchReady === '1') return;
  const panel = list.closest('.panel');
  const head = panel?.querySelector('.panel-head');
  if (!head) return;
  list.dataset.searchReady = '1';
  const toolbar = document.createElement('div');
  toolbar.className = 'listing-search-toolbar';
  toolbar.innerHTML = `<div class="listing-search-wrap"><span class="listing-search-icon">⌕</span><input id="listing-search-input" class="listing-search-input" type="search" placeholder="Cari listing, game, offer ID..." autocomplete="off"><button type="button" class="listing-search-clear" id="listing-search-clear" hidden>×</button></div><select id="listing-status-filter" class="listing-filter"><option value="all">Semua status</option><option value="listed">ON / Listed</option><option value="draft">OFF / Draft</option><option value="archived">Archived</option></select><span id="listing-search-count" class="listing-search-count"></span>`;
  head.insertAdjacentElement('afterend', toolbar);
  const input=toolbar.querySelector('#listing-search-input'), status=toolbar.querySelector('#listing-status-filter'), clear=toolbar.querySelector('#listing-search-clear'), count=toolbar.querySelector('#listing-search-count');
  const normalize=v=>String(v||'').toLowerCase().trim();
  const apply=()=>{const q=normalize(input.value), wanted=status.value, rows=[...list.querySelectorAll('tbody tr')];let visible=0;rows.forEach(row=>{const text=normalize(row.textContent), st=normalize(row.querySelector('.status-pill')?.textContent||'');const searchOk=!q||text.includes(q);const statusOk=wanted==='all'||(wanted==='listed'&&(st.includes('active')||st.includes('listed')||st.includes('on')))||(wanted==='draft'&&(st.includes('draft')||st.includes('off')))||(wanted==='archived'&&st.includes('archived'));row.hidden=!(searchOk&&statusOk);if(!row.hidden)visible++});count.textContent=rows.length?`${visible} dari ${rows.length} listing`:'';clear.hidden=!input.value};
  input.addEventListener('input',apply);status.addEventListener('change',apply);clear.addEventListener('click',()=>{input.value='';apply();input.focus()});apply();
}
let lastList=null;
setInterval(()=>{const list=document.getElementById('listings-list');if(list!==lastList){lastList=list;enhanceListings()}},1000);
enhanceListings();
