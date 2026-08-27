// Navigation state fix: keep the visible active indicator and page header synchronized.
if (!window.__marketplaceNavigationFixLoaded) {
  window.__marketplaceNavigationFixLoaded = true;

  function setActivePage(page) {
    if (!page) return;
    document.querySelectorAll('.nav-item[data-page]').forEach(nav => {
      nav.classList.toggle('active', nav.dataset.page === page);
    });
    const title = document.getElementById('page-title');
    if (title) {
      const titles = {
        dashboard: 'Dashboard',
        products: 'Products',
        listings: 'Listings',
        orders: 'Orders',
        stock: 'Stock',
        pricing: 'Pricing',
        delivery: 'Delivery',
        settings: 'Settings'
      };
      title.textContent = titles[page] || page.charAt(0).toUpperCase() + page.slice(1);
    }
  }

  document.addEventListener('page-rendered', event => {
    setActivePage(event.detail?.page);
  });

  document.addEventListener('click', event => {
    const nav = event.target.closest('.nav-item[data-page]');
    if (!nav) return;
    setActivePage(nav.dataset.page);
    setTimeout(() => nav.blur(), 0);
  }, true);

  setActivePage(document.querySelector('.nav-item.active[data-page]')?.dataset.page || 'dashboard');
}
