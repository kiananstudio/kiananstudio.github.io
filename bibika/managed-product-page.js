(() => {
  const API_URL = '/api/catalog';
  const PUBLIC_ORIGIN = 'https://kiananstudio.com';
  const MANAGED_CATEGORIES = new Set(['unity-tools', '3d-assets']);
  const q = (selector, root = document) => root.querySelector(selector);

  function pageId() {
    return String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase();
  }

  function assetUrl(value) {
    const path = String(value || '').trim();
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${PUBLIC_ORIGIN}/${path.replace(/^\/+/, '')}`;
  }

  function safeHref(value) {
    const href = String(value || '').trim();
    if (!href || /^(javascript|data|vbscript):/i.test(href)) return '';
    return href;
  }

  function addParagraphs(host, value) {
    String(value || '').split(/\n{2,}/).map(part => part.trim()).filter(Boolean).forEach(part => {
      const p = document.createElement('p');
      p.textContent = part;
      host.appendChild(p);
    });
  }

  function renderTextBlock(block) {
    const panel = document.createElement('section');
    panel.className = `contact-panel standalone-contact managed-text-panel managed-product-extra ${block?.buttonPosition === 'bottom' ? 'buttons-bottom' : 'buttons-side'}`;
    const copy = document.createElement('div');
    copy.className = 'managed-text-copy';
    if (block?.heading) {
      const heading = document.createElement('h2');
      heading.className = 'managed-extra-heading';
      heading.textContent = String(block.heading);
      copy.appendChild(heading);
    }
    const body = document.createElement('div');
    body.className = 'managed-page-text-body';
    addParagraphs(body, block?.content || '');
    copy.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'contact-actions managed-text-actions';
    (Array.isArray(block?.buttons) ? block.buttons : []).forEach(button => {
      const href = safeHref(button?.href);
      if (!href || !button?.label) return;
      const link = document.createElement('a');
      link.className = `button ${button?.style === 'secondary' ? 'button-secondary' : 'button-primary'}`;
      link.textContent = button.label;
      link.href = href;
      if (/^https?:\/\//i.test(href)) {
        link.dataset.bibikaPublic = 'true';
        link.target = '_blank';
        link.rel = 'noopener';
      }
      actions.appendChild(link);
    });
    panel.append(copy, actions);
    return panel;
  }

  function renderImageBlock(block) {
    const src = assetUrl(block?.image);
    if (!src) return null;
    const figure = document.createElement('figure');
    figure.className = 'managed-page-image-block managed-product-extra';
    figure.dataset.sourcePath = String(block.image || '');
    const img = document.createElement('img');
    img.src = src;
    img.alt = String(block?.alt || '');
    img.loading = 'lazy';
    figure.appendChild(img);
    return figure;
  }

  function addLabels(panel, product) {
    const copy = q('.managed-text-copy', panel);
    if (!copy || q('.managed-product-preview-labels', copy)) return;
    const labels = [];
    if (product?.status) labels.push(String(product.status));
    if (product?.version) labels.push(`V${String(product.version).replace(/^v/i, '')}`);
    if (!labels.length) return;
    const row = document.createElement('div');
    row.className = 'managed-product-preview-labels';
    labels.forEach(value => {
      const span = document.createElement('span');
      span.textContent = value;
      row.appendChild(span);
    });
    const body = q('.managed-page-text-body', copy);
    copy.insertBefore(row, body || null);
  }

  function render(page, product) {
    const host = q('#managed-page-content');
    if (!host) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const first = q('.managed-text-panel', host);
      if (!first && attempts < 50) return;
      clearInterval(timer);
      if (!first) return;

      host.querySelectorAll('.managed-product-extra').forEach(node => node.remove());
      addLabels(first, product);

      const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
      let coverNode = null;
      blocks.forEach((block, index) => {
        let node = null;
        if (block?.type === 'image') node = renderImageBlock(block);
        else node = renderTextBlock(block || {});
        if (!node) return;
        if (!coverNode && index === 0 && block?.type === 'image' && product?.cover && String(block.image || '') === String(product.cover || '')) {
          coverNode = node;
          return;
        }
        host.appendChild(node);
      });

      if (coverNode) {
        first.classList.add('managed-product-hero');
        first.appendChild(coverNode);
      }
    }, 50);
  }

  fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(data => {
      const id = pageId();
      const product = (Array.isArray(data?.products) ? data.products : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (!product || !MANAGED_CATEGORIES.has(String(product.category || ''))) return;
      const page = (Array.isArray(data?.sitePages) ? data.sitePages : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (page) render(page, product);
    })
    .catch(() => {});
})();
