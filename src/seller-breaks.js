import { supabase } from './supabase.js';

const content = document.getElementById('page-content');

function esc(v) {
  return String(v ?? '').replace(/[&<>'\"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;'
  }[c]));
}

async function loadSellerBreaks() {
  const result = document.getElementById('seller-breaks-result');
  const button = document.getElementById('seller-breaks-refresh');
  if (!result) return;
  if (button) { button.disabled = true; button.textContent = 'Checking...'; }
  result.innerHTML = '<div class="empty">Memeriksa Seller Break melalui GameBoost API v2...</div>';
  try {
    const { data, error } = await supabase.functions.invoke('gameboost-seller-breaks', {
      body: { page: 1, per_page: 20 }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Seller Break API error');

    const payload = data.data ?? {};
    const rows = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
    const active = rows.filter(x => !x?.ended_at && !x?.end_at && String(x?.status ?? '').toLowerCase() === 'active');

    result.innerHTML = `
      <div class="status-row"><span>GameBoost HTTP</span><strong>${esc(data.gameboost_status)}</strong></div>
      <div class="status-row"><span>Break records</span><strong>${rows.length}</strong></div>
      <div class="status-row"><span>Active break detected</span><strong>${active.length ? 'YES' : 'NO'}</strong></div>
      <div class="panel-body" style="margin-top:12px;">
        <details>
          <summary>Raw Seller Break response</summary>
          <pre style="white-space:pre-wrap;overflow:auto;max-height:360px;">${esc(JSON.stringify(payload, null, 2))}</pre>
        </details>
      </div>
      <div class="template-note" style="margin-top:12px;">
        Read-only test. Belum mengubah Online/Away/Offline dan belum mengakhiri break otomatis.
      </div>`;
  } catch (e) {
    result.innerHTML = `<div class="empty" style="color:#ff8d8d;">Gagal membaca Seller Break: ${esc(e?.message || e)}</div>`;
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Refresh Seller Status'; }
  }
}

function installSellerBreakPanel() {
  document.querySelectorAll('[data-page="settings"]').forEach(button => {
    button.addEventListener('click', () => {
      setTimeout(() => {
        if (!content || !document.querySelector('[data-page="settings"].active, [data-page="settings"].is-active')) return;
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `
          <div class="panel-head">
            <div>
              <strong>GameBoost Seller Presence</strong>
              <div class="template-note">Read Seller Break API untuk memeriksa apakah akun sedang dalam break.</div>
            </div>
            <button id="seller-breaks-refresh" class="action">Refresh Seller Status</button>
          </div>
          <div id="seller-breaks-result" class="panel-body"><div class="empty">Belum diperiksa.</div></div>`;
        content.appendChild(panel);
        document.getElementById('seller-breaks-refresh')?.addEventListener('click', loadSellerBreaks);
        loadSellerBreaks();
      }, 0);
    }, { passive: true });
  });
}

installSellerBreakPanel();
window.GameBoostSellerBreaks = { refresh: loadSellerBreaks };
