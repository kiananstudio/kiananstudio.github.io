(() => {
  const API_URL = '/api/catalog';
  const PUBLIC_ORIGIN = 'https://kiananstudio.com';
  const params = new URLSearchParams(location.search);
  const categoryId = params.get('category') || 'unity-tools';
  const title = document.getElementById('category-title');
  const description = document.getElementById('category-description');
  const list = document.getElementById('category-list');

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function assetUrl(value) {
    const path = String(value || '').trim();
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${PUBLIC_ORIGIN}/${path.replace(/^\/+/, '')}`;
  }

  function isImageIcon(value) {
    const path = String(value || '').trim();
    return /^https?:\/\//i.test(path) || /^(?:assets\/|\/assets\/)/i.test(path) || /\.(webp|png|jpe?g)(?:[?#].*)?$/i.test(path);
  }

  function safeHref(product) {
    const href = String(product?.href || `product.html?id=${encodeURIComponent(product?.id || '')}`).trim();
    if (!href || /^(javascript|data|vbscript):/i.test(href)) return `product.html?id=${encodeURIComponent(product?.id || '')}`;
    return href;
  }

  fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' })
    .then(r => {
      if (!r.ok) throw new Error(`Catalog load failed: ${r.status}`);
      return r.json();
    })
    .then(data => {
      const category = data.categories.find(c => c.id === categoryId) || data.categories[0];
      if (!category) throw new Error('Category not found');
      const products = data.products.filter(p => p.category === category.id);
      document.title = `${category.title} — Kianan Bibika`;
      if (title) title.textContent = category.title;
      if (description) description.textContent = category.description || '';

      if (!products.length) {
        list.innerHTML = `<div class="empty-state"><strong>Coming soon.</strong><span>New ${escapeHtml(category.title)} will appear here.</span></div>`;
        return;
      }

      list.innerHTML = products.map(product => {
        let visual;
        if (product.icon && isImageIcon(product.icon)) {
          visual = `<img class="catalog-product-icon" src="${escapeHtml(assetUrl(product.icon))}" alt="${escapeHtml(product.title)} icon" loading="lazy">`;
        } else if (product.cover) {
          visual = `<img src="${escapeHtml(assetUrl(product.cover))}" alt="${escapeHtml(product.title)}" loading="lazy">`;
        } else if (product.icon) {
          visual = `<div class="item-placeholder">${escapeHtml(product.icon)}</div>`;
        } else {
          visual = `<div class="item-placeholder">${escapeHtml(product.title.slice(0,2).toUpperCase())}</div>`;
        }
        return `<a class="catalog-item" href="${escapeHtml(safeHref(product))}">
          <div class="catalog-thumb">${visual}</div>
          <div class="catalog-item-copy">
            <div class="catalog-meta">${product.status ? `<span>${escapeHtml(product.status)}</span>` : ''}${product.version ? `<span>v${escapeHtml(product.version)}</span>` : ''}</div>
            <h4>${escapeHtml(product.title)}</h4>
            <p>${escapeHtml(product.shortDescription || '')}</p>
          </div>
          <span class="catalog-arrow">→</span>
        </a>`;
      }).join('');
    })
    .catch(err => {
      console.error(err);
      list.innerHTML = '<p class="load-error">Catalog is temporarily unavailable.</p>';
    });
})();