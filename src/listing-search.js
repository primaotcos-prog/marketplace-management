const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

function enhanceListings() {
  const list = document.getElementById('listings-list');
  if (!list || list.dataset.searchReady === '1') return;
  list.dataset.searchReady = '1';

  const panel = list.closest('.panel');
  const head = panel?.querySelector('.panel-head');
  if (!head) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'listing-search-toolbar';
  toolbar.innerHTML = `
    <div class="listing-search-wrap">
      <span class="listing-search-icon">⌕</span>
      <input id="listing-search-input" class="listing-search-input" type="search" placeholder="Cari listing, game, offer ID..." autocomplete="off">
      <button type="button" class="listing-search-clear" id="listing-search-clear" hidden>×</button>
    </div>
    <select id="listing-status-filter" class="listing-filter">
      <option value="all">Semua status</option>
      <option value="listed">ON / Listed</option>
      <option value="draft">OFF / Draft</option>
      <option value="archived">Archived</option>
    </select>
    <span id="listing-search-count" class="listing-search-count"></span>
  `;
  head.insertAdjacentElement('afterend', toolbar);

  const input = toolbar.querySelector('#listing-search-input');
  const status = toolbar.querySelector('#listing-status-filter');
  const clear = toolbar.querySelector('#listing-search-clear');
  const count = toolbar.querySelector('#listing-search-count');

  const normalize = value => String(value || '').toLowerCase().trim();

  function apply() {
    const q = normalize(input.value);
    const wantedStatus = status.value;
    const rows = Array.from(list.querySelectorAll('tbody tr'));
    let visible = 0;

    rows.forEach(row => {
      const text = normalize(row.textContent);
      const statusText = normalize(row.querySelector('.status-pill')?.textContent || row.textContent);
      const matchesSearch = !q || text.includes(q);
      const matchesStatus = wantedStatus === 'all'
        || (wantedStatus === 'listed' && (statusText.includes('active') || statusText.includes('listed') || statusText.includes('on')))
        || (wantedStatus === 'draft' && (statusText.includes('draft') || statusText.includes('off')))
        || (wantedStatus === 'archived' && statusText.includes('archived'));
      row.hidden = !(matchesSearch && matchesStatus);
      if (!row.hidden) visible += 1;
    });

    const hasRows = rows.length > 0;
    count.textContent = hasRows ? `${visible} dari ${rows.length} listing` : '';
    clear.hidden = !input.value;
  }

  input.addEventListener('input', apply);
  status.addEventListener('change', apply);
  clear.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });

  const observer = new MutationObserver(() => apply());
  observer.observe(list, { childList: true, subtree: true });
  apply();
}

const observer = new MutationObserver(enhanceListings);
observer.observe(document.body, { childList: true, subtree: true });
enhanceListings();
