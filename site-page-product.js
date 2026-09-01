(() => {
  const DATA_URL = 'data/products.json';
  const MANAGED_CATEGORIES = new Set(['unity-tools', '3d-assets']);
  const q = (selector, root = document) => root.querySelector(selector);

  function pageId() {
    return String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase();
  }

  function addLabels(panel, product) {
    const copy = q('.managed-text-copy', panel);
    if (!copy || q('.managed-product-labels', copy)) return;
    const labels = [];
    if (product?.status) labels.push(String(product.status));
    if (product?.version) labels.push(`V${String(product.version).replace(/^v/i, '')}`);
    if (!labels.length) return;
    const row = document.createElement('div');
    row.className = 'managed-product-labels';
    labels.forEach(value => {
      const span = document.createElement('span');
      span.textContent = value;
      row.appendChild(span);
    });
    const body = q('.managed-page-text-body', copy);
    copy.insertBefore(row, body || null);
  }

  function enhance(product) {
    const host = q('#managed-page-content');
    if (!host) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const panel = q('.managed-text-panel', host);
      if (!panel && attempts < 60) return;
      if (!panel) {
        clearInterval(timer);
        return;
      }

      addLabels(panel, product);
      const firstImage = q('.managed-page-image-block', host);
      if (product?.cover && firstImage) {
        const img = q('img', firstImage);
        const expected = String(product.cover || '').replace(/^\/+/, '');
        let current = '';
        try {
          current = new URL(img?.src || '', location.href).pathname.replace(/^\/+/, '');
        } catch {}
        if (current.endsWith(expected)) {
          panel.classList.add('managed-product-hero');
          firstImage.classList.add('managed-product-cover');
          panel.appendChild(firstImage);
        }
      }
      clearInterval(timer);
    }, 50);
  }

  fetch(DATA_URL, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(data => {
      const id = pageId();
      const product = (Array.isArray(data?.products) ? data.products : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (product && MANAGED_CATEGORIES.has(String(product.category || ''))) enhance(product);
    })
    .catch(() => {});
})();
