import { supabase, isSupabaseConfigured } from './supabase.js';

const content = document.getElementById('page-content');
const title = document.getElementById('page-title');
const connectionText = document.getElementById('connection-text');
const connectionDot = document.getElementById('connection-dot');

const pages = {
  dashboard: {
    title: 'Dashboard',
    html: `
      <div class="hero"><h2>GameBoost control center</h2><p>Central management for products, listings, orders, stock and automation.</p></div>
      <div class="cards">
        <div class="card"><div class="card-label">Products</div><div class="card-value" id="products-count">—</div><div class="card-note">Supabase</div></div>
        <div class="card"><div class="card-label">Listings</div><div class="card-value" id="listings-count">—</div><div class="card-note">GameBoost</div></div>
        <div class="card"><div class="card-label">Orders</div><div class="card-value" id="orders-count">—</div><div class="card-note">All statuses</div></div>
        <div class="card"><div class="card-label">Stock</div><div class="card-value" id="stock-count">—</div><div class="card-note">Available units</div></div>
      </div>
      <div class="grid">
        <div class="panel"><div class="panel-head"><strong>Recent orders</strong><span class="card-label">V1</span></div><div id="recent-orders" class="empty">Loading...</div></div>
        <div class="panel"><div class="panel-head"><strong>Integration</strong><span id="integration-status" class="status">Checking</span></div><div class="panel-body">
          <div class="status-row"><span>Marketplace</span><strong>GameBoost</strong></div>
          <div class="status-row"><span>Supabase</span><span id="supabase-status" class="status">Checking</span></div>
          <div class="status-row"><span>GameBoost API</span><span class="status">Next phase</span></div>
          <div class="status-row"><span>U7BUY</span><span>Future</span></div>
        </div></div>
      </div>`
  },
  products: { title: 'Products', html: `<div class="panel"><div class="panel-head"><strong>Products</strong></div><div class="empty">Canonical products will be managed here.</div></div>` },
  listings: { title: 'Listings', html: `<div class="panel"><div class="panel-head"><strong>GameBoost Listings</strong></div><div class="empty">Offer mapping will be added after the GameBoost adapter.</div></div>` },
  orders: { title: 'Orders', html: `<div class="panel"><div class="panel-head"><strong>Orders</strong></div><div class="empty">Normalized GameBoost orders will appear here.</div></div>` },
  stock: { title: 'Stock', html: `<div class="panel"><div class="panel-head"><strong>Central Stock</strong></div><div class="empty">Inventory synchronization will be added with the API adapter.</div></div>` },
  pricing: { title: 'Pricing', html: `<div class="panel"><div class="panel-head"><strong>Pricing Rules</strong></div><div class="empty">Pricing automation will be added after marketplace data is connected.</div></div>` },
  delivery: { title: 'Delivery', html: `<div class="panel"><div class="panel-head"><strong>Delivery</strong></div><div class="empty">Delivery actions and proof logs will be managed here.</div></div>` },
  settings: { title: 'Settings', html: `<div class="panel"><div class="panel-head"><strong>Settings</strong></div><div class="empty">Connection secrets will stay server-side. Public Supabase configuration is separate.</div></div>` }
};

async function loadDashboardStats() {
  if (!supabase) {
    connectionText.textContent = 'Demo mode';
    connectionDot.classList.remove('connected');
    document.getElementById('integration-status').textContent = 'Not configured';
    document.getElementById('supabase-status').textContent = 'Add publishable key';
    document.getElementById('recent-orders').textContent = 'Connect Supabase to load live data.';
    return;
  }

  try {
    const [products, listings, orders, inventory] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase.from('listings').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('inventory').select('available')
    ]);
    const firstError = [products, listings, orders, inventory].find((result) => result.error)?.error;
    if (firstError) throw firstError;

    document.getElementById('products-count').textContent = products.count ?? 0;
    document.getElementById('listings-count').textContent = listings.count ?? 0;
    document.getElementById('orders-count').textContent = orders.count ?? 0;
    document.getElementById('stock-count').textContent = (inventory.data || []).reduce((sum, row) => sum + Number(row.available || 0), 0);
    document.getElementById('recent-orders').textContent = orders.count ? `${orders.count} orders available in Supabase.` : 'No orders yet.';
    document.getElementById('integration-status').textContent = 'Connected';
    document.getElementById('supabase-status').textContent = 'Connected';
    connectionText.textContent = 'Supabase connected';
    connectionDot.classList.add('connected');
  } catch (error) {
    document.getElementById('integration-status').textContent = 'Error';
    document.getElementById('supabase-status').textContent = error.message;
    connectionText.textContent = 'Supabase error';
    connectionDot.classList.remove('connected');
  }
}

function render(page) {
  const selected = pages[page] || pages.dashboard;
  title.textContent = selected.title;
  content.innerHTML = selected.html;
  document.querySelectorAll('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  if (page === 'dashboard') loadDashboardStats();
}

document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => render(button.dataset.page)));
render('dashboard');
