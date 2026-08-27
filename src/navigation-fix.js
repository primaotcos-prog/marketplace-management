// Navigation guard: Listings must never be routed to Orders.
if (!window.__marketplaceNavigationFixLoaded) {
  window.__marketplaceNavigationFixLoaded = true;
  const navigateListings = () => {
    const nav = document.querySelector('.nav-item[data-page="listings"]');
    if (!nav) return;
    nav.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  };
  document.addEventListener('click', event => {
    const nav = event.target.closest('.nav-item[data-page]');
    if (!nav || nav.dataset.page !== 'listings') return;
    setTimeout(() => {
      const pageTitle = document.getElementById('page-title');
      if (pageTitle && pageTitle.textContent.trim().toLowerCase() === 'orders') navigateListings();
    }, 0);
  }, true);
}