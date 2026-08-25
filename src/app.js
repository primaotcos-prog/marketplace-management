const content = document.getElementById('page-content');
const title = document.getElementById('page-title');

const pages = {
  dashboard: {
    title: 'Dashboard',
    html: `
      <div class="hero">
        <h2>GameBoost control center</h2>
        <p>Manage products, listings, orders, stock and future automation from one place.</p>
      </div>
      <div class="cards">
        <div class="card"><div class="card-label">Products</div><div class="card-value">0</div><div class="card-note">Ready to configure</div></div>
        <div class="card"><div class="card-label">Listings</div><div class="card-value">0</div><div class="card-note">GameBoost</div></div>
        <div class="card"><div class="card-label">Orders</div><div class="card-value">0</div><div class="card-note">Awaiting connection</div></div>
        <div class="card"><div class="card-label">Stock</div><div class="card-value">0</div><div class="card-note">Central inventory</div></div>
      </div>
      <div class="grid">
        <div class="panel"><div class="panel-head"><strong>Recent orders</strong><span class="card-label">V1</span></div><div class="empty">Orders will appear here after the GameBoost API is connected.</div></div>
        <div class="panel"><div class="panel-head"><strong>Integration</strong><span class="status">Foundation ready</span></div><div class="panel-body">
          <div class="status-row"><span>Marketplace</span><strong>GameBoost</strong></div>
          <div class="status-row"><span>API adapter</span><span class="status">Next phase</span></div>
          <div class="status-row"><span>Supabase</span><span class="status">Not connected</span></div>
          <div class="status-row"><span>U7BUY</span><span>Future</span></div>
        </div></div>
      </div>`
  },
  products: { title: 'Products', html: `<div class="panel"><div class="panel-head"><strong>Products</strong></div><div class="empty">Canonical products will be managed here.</div></div>` },
  listings: { title: 'Listings', html: `<div class="panel"><div class="panel-head"><strong>GameBoost Listings</strong></div><div class="empty">Marketplace offer mapping will be added next.</div></div>` },
  orders: { title: 'Orders', html: `<div class="panel"><div class="panel-head"><strong>Orders</strong></div><div class="empty">Normalized GameBoost orders will appear here.</div></div>` },
  stock: { title: 'Stock', html: `<div class="panel"><div class="panel-head"><strong>Central Stock</strong></div><div class="empty">Inventory synchronization will be added after the API adapter.</div></div>` },
  pricing: { title: 'Pricing', html: `<div class="panel"><div class="panel-head"><strong>Pricing Rules</strong></div><div class="empty">Pricing automation is planned for a later phase.</div></div>` },
  delivery: { title: 'Delivery', html: `<div class="panel"><div class="panel-head"><strong>Delivery</strong></div><div class="empty">Delivery actions and proof logs will be managed here.</div></div>` },
  settings: { title: 'Settings', html: `<div class="panel"><div class="panel-head"><strong>Settings</strong></div><div class="empty">Marketplace connection settings will be added securely on the server side.</div></div>` }
};

function render(page) {
  const selected = pages[page] || pages.dashboard;
  title.textContent = selected.title;
  content.innerHTML = selected.html;
  document.querySelectorAll('[data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === page);
  });
}

document.querySelectorAll('[data-page]').forEach((button) => {
  button.addEventListener('click', () => render(button.dataset.page));
});

render('dashboard');
