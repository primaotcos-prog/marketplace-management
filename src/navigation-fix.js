// Navigation and pricing UI fix.
if (!window.__marketplaceNavigationFixLoaded) {
  window.__marketplaceNavigationFixLoaded = true;

  function setActivePage(page) {
    if (!page) return;
    document.querySelectorAll('.nav-item[data-page]').forEach(nav => {
      nav.classList.toggle('active', nav.dataset.page === page);
    });
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

  // Pricing page is rendered by a separate module. Keep its header/navigation
  // synchronized and repair the mobile drawer containing block.
  function pricingUiFix() {
    const pricing = document.getElementById('pricing-manager');
    if (!pricing) return;

    const title = document.getElementById('page-title');
    if (title) title.textContent = 'Pricing';
    setActivePage('pricing');

    if (!document.getElementById('pricing-ui-fix-style')) {
      const style = document.createElement('style');
      style.id = 'pricing-ui-fix-style';
      style.textContent = `
        /* The pricing drawer must cover the whole viewport, not only .main. */
        .pm-modal-backdrop {
          position: fixed !important;
          top: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100dvh !important;
          z-index: 2147483000 !important;
          display: flex !important;
          justify-content: center !important;
          align-items: stretch !important;
          overflow: hidden !important;
          background: rgba(3,7,12,.82) !important;
        }
        .pm-modal {
          width: min(1040px, calc(100vw - 32px)) !important;
          max-width: 1040px !important;
          height: min(100dvh - 24px, 920px) !important;
          margin: 12px auto !important;
          border: 1px solid #2a3749 !important;
          border-radius: 16px !important;
          box-shadow: 0 24px 80px rgba(0,0,0,.55) !important;
        }
        .pm-modal-head { padding: 14px 18px !important; }
        .pm-hero { padding: 18px 20px !important; }
        .pm-switch-card { margin: 14px 20px !important; }
        .pm-section { padding-left: 20px !important; padding-right: 20px !important; }
        .pm-fields { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
        .pm-switch-card .pm-switch::after {
          content: 'OFF';
          position: absolute;
          right: -42px;
          color: #8d98a8;
          font-size: 10px;
          font-weight: 800;
        }
        .pm-switch-card .pm-switch input:checked + .pm-slider::after {
          content: 'ON';
          position: absolute;
          right: 8px;
          top: 7px;
          color: #06150e;
          font-size: 9px;
          font-weight: 900;
        }
        @media (max-width: 900px) {
          .pm-modal {
            width: min(760px, calc(100vw - 20px)) !important;
            height: calc(100dvh - 12px) !important;
            margin: 6px auto !important;
            border-radius: 14px !important;
          }
          .pm-fields { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 640px) {
          .pm-modal-backdrop { background: #0b121b !important; }
          .pm-modal {
            width: 100vw !important;
            max-width: none !important;
            height: 100dvh !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
          }
          .pm-modal-head { padding: 12px 14px !important; }
          .pm-hero { padding: 14px !important; }
          .pm-hero h3 { font-size: 14px !important; }
          .pm-switch-card { margin: 10px 14px !important; padding: 12px !important; }
          .pm-section { padding: 12px 14px !important; }
          .pm-fields { grid-template-columns: 1fr !important; }
          .pm-preview-head { padding: 12px 14px !important; }
          .pm-row { min-width: 560px !important; padding-left: 14px !important; padding-right: 14px !important; }
          .pm-stats { margin-left: 14px !important; margin-right: 14px !important; }
          .pm-source { margin-left: 14px !important; margin-right: 14px !important; }
          .pm-rule-actions { padding: 12px 14px !important; position: sticky; bottom: 0; background: #0d141e; z-index: 3; }
          .pm-rule-actions .pm-btn { width: 100%; }
        }
      `;
      document.head.appendChild(style);
    }

    // Add an explicit ON/OFF text beside the switch and update it live.
    const toggle = document.getElementById('pm-enabled');
    if (toggle && !toggle.dataset.uiFixed) {
      toggle.dataset.uiFixed = '1';
      const label = document.createElement('span');
      label.className = 'pm-toggle-label';
      label.textContent = toggle.checked ? 'ON' : 'OFF';
      label.style.cssText = 'font-size:11px;font-weight:800;min-width:24px;color:#8d98a8;';
      toggle.closest('.pm-switch')?.appendChild(label);
      const sync = () => {
        label.textContent = toggle.checked ? 'ON' : 'OFF';
        label.style.color = toggle.checked ? '#54e19d' : '#8d98a8';
      };
      toggle.addEventListener('change', sync);
      sync();
    }
  }

  const observer = new MutationObserver(() => pricingUiFix());
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(pricingUiFix, 500);
}
