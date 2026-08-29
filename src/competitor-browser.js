const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));

const normalise = value => String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slugify = value => normalise(value).replace(/\s+/g, '-');

function extractInertia(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.component && parsed.props) return parsed;
  } catch (_) {}

  try {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const scripts = [...doc.querySelectorAll('script[type="application/json"]')];
    for (const script of scripts) {
      const raw = script.textContent.trim();
      if (!raw.includes('"component"') || !raw.includes('"props"')) continue;
      try { return JSON.parse(raw); } catch (_) {}
      try { return JSON.parse(JSON.parse(raw)); } catch (_) {}
    }
    const root = doc.querySelector('[data-page]');
    if (root?.getAttribute('data-page')) {
      try { return JSON.parse(root.getAttribute('data-page')); } catch (_) {}
    }
  } catch (_) {}
  return null;
}

async function fetchGameBoostBrowser({ game, search, locale = 'id', page = 1, sort = 'price' }) {
  const gameSlug = slugify(game);
  const query = String(search || '').trim();
  if (!gameSlug) throw new Error('Game slug wajib diisi.');
  if (!query) throw new Error('Nama item wajib diisi.');

  const url = new URL(`https://gameboost.com/${locale}/${gameSlug}/items`);
  url.searchParams.set('s', query);
  url.searchParams.set('page', String(Math.max(1, Number(page) || 1)));
  if (sort) url.searchParams.set('sort', sort);

  let response;
  try {
    response = await fetch(url.href, {
      method: 'GET',
      credentials: 'include',
      mode: 'cors',
      headers: {
        Accept: 'text/html, application/xhtml+xml',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Inertia': 'true'
      }
    });
  } catch (error) {
    throw new Error('Browser tidak diizinkan membaca GameBoost dari domain dashboard (CORS). Buka GameBoost pada tab yang sama/origin atau gunakan endpoint resmi GameBoost yang mengizinkan CORS.');
  }

  const text = await response.text();
  if (!response.ok) throw new Error(`GameBoost browser HTTP ${response.status}`);

  const payload = extractInertia(text);
  if (!payload) throw new Error(`Payload Inertia GameBoost tidak ditemukan (HTTP ${response.status}, ${text.length} bytes).`);

  const items = payload?.props?.items;
  const listings = Array.isArray(items?.data) ? items.data : [];
  const rows = listings.map((x, index) => ({
    no: index + 1,
    id: x?.id ?? null,
    title: x?.title ?? '',
    seller: x?.seller?.username ?? x?.seller ?? null,
    seller_id: x?.seller?.id ?? null,
    price: x?.price?.value ?? null,
    price_format: x?.price?.format ?? null,
    currency: x?.price?.currency?.code ?? 'EUR',
    local_price: x?.local_price?.value ?? null,
    local_price_format: x?.local_price?.format ?? null,
    local_currency: x?.local_price?.currency?.code ?? 'USD',
    stock: x?.stock ?? null,
    min_quantity: x?.min_quantity ?? null,
    delivery_time: x?.delivery_time ?? null,
    status: x?.status ?? null,
    slug: x?.slug ?? null,
    url: x?.slug ? `https://gameboost.com/${locale}/${gameSlug}/items/${x.slug}` : null
  }));

  return {
    ok: true,
    component: payload.component,
    query: items?.query ?? query,
    current_page: items?.current_page ?? page,
    per_page: items?.per_page ?? rows.length,
    total: items?.total ?? rows.length,
    last_page: items?.last_page ?? 1,
    next_page_url: items?.next_page_url ?? null,
    prev_page_url: items?.prev_page_url ?? null,
    listings: rows,
    source_url: url.href,
    source: 'GameBoost browser / Inertia'
  };
}

function installCompetitorBrowser() {
  const host = document.getElementById('page-content');
  const title = document.getElementById('page-title');
  if (!host || !title || title.textContent.trim().toLowerCase() !== 'pricing') return;
  if (document.getElementById('gb-competitor-browser')) return;

  const box = document.createElement('div');
  box.id = 'gb-competitor-browser';
  box.className = 'gbc-card';
  box.innerHTML = `
    <div class="gbc-head">
      <div><h2>Competitor Listings</h2><p>Membaca payload Inertia GameBoost dari sesi browser.</p></div>
      <span id="gbc-source" class="gbc-source">GameBoost /items</span>
    </div>
    <div class="gbc-toolbar">
      <input id="gbc-game" value="steal-a-brainrot" placeholder="Game slug">
      <input id="gbc-search" value="Garama And Madundung" placeholder="Nama item">
      <select id="gbc-sort"><option value="price">Harga terendah</option><option value="-price">Harga tertinggi</option><option value="recommended">Direkomendasikan</option><option value="newest">Terbaru</option></select>
      <button id="gbc-load" class="gbc-btn gbc-primary">Cari Kompetitor</button>
    </div>
    <div id="gbc-meta" class="gbc-meta"></div>
    <div id="gbc-result" class="gbc-result"><div class="gbc-empty">Masukkan game dan nama item lalu tekan Cari Kompetitor.</div></div>`;
  host.prepend(box);

  const style = document.createElement('style');
  style.textContent = `
    #gb-competitor-browser{margin-bottom:16px;background:#0d141e;border:1px solid #273243;border-radius:14px;overflow:hidden;color:#edf2f8}
    #gb-competitor-browser .gbc-head{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #273243}
    #gb-competitor-browser h2{margin:0;font-size:15px}#gb-competitor-browser p{margin:4px 0 0;color:#8793a5;font-size:11px}
    .gbc-source{font-size:10px;color:#6ee7a3;white-space:nowrap}.gbc-toolbar{display:grid;grid-template-columns:1.1fr 1.8fr 170px auto;gap:8px;padding:12px;border-bottom:1px solid #273243}
    .gbc-toolbar input,.gbc-toolbar select{height:40px;border:1px solid #293548;border-radius:8px;background:#080e15;color:#edf2f8;padding:0 10px;outline:none;min-width:0}.gbc-toolbar input:focus,.gbc-toolbar select:focus{border-color:#596eff}
    .gbc-btn{height:40px;border:1px solid #303d51;background:#151c28;color:#e8edf5;border-radius:8px;padding:0 13px;cursor:pointer;font-weight:700}.gbc-primary{background:#4d5cff;border-color:#4d5cff;color:white}.gbc-btn:disabled{opacity:.55;cursor:wait}
    .gbc-meta{padding:10px 12px;color:#8793a5;font-size:10px}.gbc-result{overflow:auto}.gbc-table{width:100%;border-collapse:collapse;min-width:760px}.gbc-table th,.gbc-table td{padding:10px 12px;border-top:1px solid #202a38;text-align:left;font-size:10px}.gbc-table th{color:#8793a5;font-weight:700}.gbc-price{font-weight:800}.gbc-link{color:#8bb5ff;text-decoration:none}.gbc-empty,.gbc-error{padding:28px 12px;text-align:center;color:#8793a5;font-size:11px}.gbc-error{color:#ff9d9d}
    @media(max-width:720px){.gbc-toolbar{grid-template-columns:1fr 1fr}.gbc-toolbar select,.gbc-toolbar button{grid-column:span 1}.gbc-head{align-items:flex-start;flex-direction:column}.gbc-source{white-space:normal}}
    @media(max-width:480px){.gbc-toolbar{grid-template-columns:1fr}.gbc-toolbar select,.gbc-toolbar button{grid-column:auto}}
  `;
  document.head.appendChild(style);

  const gameInput = box.querySelector('#gbc-game');
  const searchInput = box.querySelector('#gbc-search');
  const sortInput = box.querySelector('#gbc-sort');
  const load = box.querySelector('#gbc-load');
  const meta = box.querySelector('#gbc-meta');
  const result = box.querySelector('#gbc-result');

  const render = data => {
    const rows = Array.isArray(data?.listings) ? data.listings : [];
    meta.textContent = `Halaman ${data?.current_page ?? 1}/${data?.last_page ?? 1} · ${data?.total ?? rows.length} listing ditemukan · Browser → GameBoost`;
    if (!rows.length) { result.innerHTML = '<div class="gbc-empty">Tidak ada listing kompetitor pada halaman ini.</div>'; return; }
    const body = rows.map(x => {
      const link = x.url ? '<a class="gbc-link" href="' + esc(x.url) + '" target="_blank" rel="noopener">Buka</a>' : '';
      return '<tr><td><strong>' + esc(x.title) + '</strong></td><td>' + esc(x.seller || '—') + '</td><td class="gbc-price">' + esc(x.price_format ?? x.price ?? '—') + '</td><td>' + esc(x.local_price_format ?? x.local_price ?? '—') + '</td><td>' + esc(x.stock ?? '—') + '</td><td>' + esc(x.min_quantity ?? '—') + '</td><td>' + esc(x.delivery_time?.format || x.delivery_time?.formatLong || x.delivery_time || '—') + '</td><td>' + link + '</td></tr>';
    }).join('');
    result.innerHTML = '<table class="gbc-table"><thead><tr><th>Item</th><th>Seller</th><th>EUR</th><th>USD</th><th>Stock</th><th>Min</th><th>Delivery</th><th></th></tr></thead><tbody>' + body + '</tbody></table>';
  };

  const run = async () => {
    const game = gameInput.value.trim();
    const search = searchInput.value.trim();
    if (!game || !search) { result.innerHTML = '<div class="gbc-error">Game slug dan nama item wajib diisi.</div>'; return; }
    load.disabled = true; load.textContent = 'Mengambil...'; result.innerHTML = '<div class="gbc-empty">Mengambil payload GameBoost dari browser...</div>';
    try { render(await fetchGameBoostBrowser({ game, search, locale:'id', page:1, sort:sortInput.value })); }
    catch (e) { result.innerHTML = `<div class="gbc-error">Gagal mengambil kompetitor: ${esc(e?.message || e)}</div>`; }
    finally { load.disabled = false; load.textContent = 'Cari Kompetitor'; }
  };
  load.addEventListener('click', run);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  run();
}

let lastPageContent = null;
setInterval(() => { const current = document.getElementById('page-content'); if (current !== lastPageContent) { lastPageContent = current; installCompetitorBrowser(); } else installCompetitorBrowser(); }, 700);
installCompetitorBrowser();
