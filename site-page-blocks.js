(() => {
  const DATA_URL = 'data/products.json';
  const q = selector => document.querySelector(selector);

  function pageId() {
    return String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase();
  }

  function normalizeButton(button) {
    return {
      label: String(button?.label || '').trim(),
      href: String(button?.href || '').trim(),
      style: button?.style === 'secondary' ? 'secondary' : 'primary'
    };
  }

  function normalizeBlock(block) {
    if (block?.type === 'image') {
      return {
        type: 'image',
        image: String(block?.image || '').trim(),
        alt: String(block?.alt || '').trim()
      };
    }
    return {
      type: 'text',
      heading: String(block?.heading || '').trim(),
      content: String(block?.content || '').trim(),
      buttonPosition: block?.buttonPosition === 'bottom' ? 'bottom' : 'side',
      buttons: Array.isArray(block?.buttons) ? block.buttons.map(normalizeButton).filter(item => item.label && item.href) : []
    };
  }

  function safeHref(value) {
    const href = String(value || '').trim();
    if (!href || /^(javascript|data|vbscript):/i.test(href)) return '';
    return href;
  }

  function appendParagraphs(host, value) {
    String(value || '').split(/\n{2,}/).map(part => part.trim()).filter(Boolean).forEach(part => {
      const p = document.createElement('p');
      p.textContent = part;
      host.appendChild(p);
    });
  }

  function renderTextBlock(block) {
    const panel = document.createElement('section');
    panel.className = `contact-panel standalone-contact managed-text-panel managed-extra-block ${block.buttonPosition === 'bottom' ? 'buttons-bottom' : 'buttons-side'}`;

    const copy = document.createElement('div');
    copy.className = 'managed-text-copy';
    if (block.heading) {
      const heading = document.createElement('h2');
      heading.className = 'managed-extra-heading';
      heading.textContent = block.heading;
      copy.appendChild(heading);
    }
    const body = document.createElement('div');
    body.className = 'managed-page-text-body';
    appendParagraphs(body, block.content);
    copy.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'contact-actions managed-text-actions';
    block.buttons.forEach(button => {
      const href = safeHref(button.href);
      if (!href) return;
      const link = document.createElement('a');
      link.className = `button ${button.style === 'secondary' ? 'button-secondary' : 'button-primary'}`;
      link.textContent = button.label;
      link.href = href;
      if (/^https?:\/\//i.test(href)) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      actions.appendChild(link);
    });

    panel.append(copy, actions);
    return panel;
  }

  function renderImageBlock(block) {
    if (!block.image) return null;
    const figure = document.createElement('figure');
    figure.className = 'managed-page-image-block managed-extra-block';
    const img = document.createElement('img');
    img.src = block.image;
    img.alt = block.alt || '';
    img.loading = 'lazy';
    figure.appendChild(img);
    return figure;
  }

  function appendBlocks(page) {
    const host = q('#managed-page-content');
    if (!host || page?.type === 'categories') return;
    const blocks = Array.isArray(page?.blocks) ? page.blocks.map(normalizeBlock) : [];
    if (!blocks.length) return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const first = q('.managed-text-panel', host);
      if (!first && attempts < 40) return;
      clearInterval(timer);
      host.querySelectorAll('.managed-extra-block').forEach(node => node.remove());
      blocks.forEach(block => {
        const node = block.type === 'image' ? renderImageBlock(block) : renderTextBlock(block);
        if (node) host.appendChild(node);
      });
    }, 50);
  }

  fetch(DATA_URL, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(data => {
      const id = pageId();
      const page = (Array.isArray(data?.sitePages) ? data.sitePages : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (page) appendBlocks(page);
    })
    .catch(() => {});
})();
