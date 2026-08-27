// Navigation state fix: keep the visible active indicator synchronized with the page.
if (!window.__marketplaceNavigationFixLoaded) {
  window.__marketplaceNavigationFixLoaded = true;

  function setActivePage(page) {
    if (!page) return;
    document.querySelectorAll('.nav-item[data-page]').forEach(nav => {
      nav.classList.toggle('active', nav.dataset.page === page);
    });
  }

  // app.js emits this after every render.
  document.addEventListener('page-rendered', event => {
    setActivePage(event.detail?.page);
  });

  // Keep the state correct immediately on navigation as well.
  document.addEventListener('click', event => {
    const nav = event.target.closest('.nav-item[data-page]');
    if (!nav) return;
    setActivePage(nav.dataset.page);
    // On touch devices the tapped item can retain focus after navigation.
    setTimeout(() => nav.blur(), 0);
  }, true);

  // Initial page.
  setActivePage(document.querySelector('.nav-item.active[data-page]')?.dataset.page || 'dashboard');
}
