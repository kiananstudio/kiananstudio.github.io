(() => {
  const DATA_URL = 'data/products.json';
  const key = String(document.body?.dataset?.staticPage || '').trim().toLowerCase();
  const q = selector => document.querySelector(selector);

  const FALLBACKS = {
    about: {
      eyebrow: 'About',
      heading: 'Kianan Studio',
      content: 'Kianan Studio creates practical digital products for game development — Unity tools, reusable 3D assets and original games. We focus on clear workflows, useful functionality and products that are easy to integrate into real projects.',
      buttonPosition: 'side',
      buttons: [
        { label: 'Unity Tools', href: 'category.html?category=unity-tools', style: 'primary' },
        { label: 'Contact', href: 'contact.html', style: 'secondary' }
      ]
    },
    contact: {
      eyebrow: 'Contact',
      heading: 'Support & business inquiries',
      content: 'For product support, feedback, collaboration or other inquiries, contact Kianan Studio.\n\nsupport@kiananstudio.com',
      buttonPosition: 'side',
      buttons: [
        { label: 'Email Kianan Studio', href: 'mailto:support@kiananstudio.com', style: 'primary' },
        { label: 'Unity Asset Store', href: 'https://assetstore.unity.com/packages/slug/398482', style: 'secondary' }
      ]
    }
  };

  function normalizeButton(button) {
    return {
      label: String(button?.label || '').trim(),
      href: String(button?.href || '').trim(),
      style: button?.style === 'secondary' ? 'secondary' : 'primary'
    };
  }

  function normalizePage(value) {
    const fallback = FALLBACKS[key] || { eyebrow: '', heading: '', content: '', buttonPosition: 'side', buttons: [] };
    const source = value && typeof value === 'object' ? value : {};
    return {
      eyebrow: String(source.eyebrow ?? fallback.eyebrow).trim(),
      heading: String(source.heading ?? fallback.heading).trim(),
      content: String(source.content ?? fallback.content).trim(),
      buttonPosition: source.buttonPosition === 'bottom' ? 'bottom' : 'side',
      buttons: Array.isArray(source.buttons) ? source.buttons.map(normalizeButton).filter(item => item.label && item.href) : fallback.buttons.map(normalizeButton)
    };
  }

  function safeHref(value) {
    const href = String(value || '').trim();
    if (!href || /^(javascript|data|vbscript):/i.test(href)) return '';
    return href;
  }

  function renderText(host, value) {
    host.replaceChildren();
    const chunks = String(value || '').split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
    chunks.forEach(chunk => {
      const p = document.createElement('p');
      p.textContent = chunk;
      host.appendChild(p);
    });
  }

  function renderButtons(host, buttons) {
    host.replaceChildren();
    buttons.forEach(button => {
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
      host.appendChild(link);
    });
  }

  function render(page) {
    const panel = q('#static-page-panel');
    const eyebrow = q('#static-page-eyebrow');
    const heading = q('#static-page-heading');
    const text = q('#static-page-text');
    const actions = q('#static-page-actions');
    if (!panel || !heading || !text || !actions) return;

    if (eyebrow) eyebrow.textContent = page.eyebrow;
    heading.textContent = page.heading;
    renderText(text, page.content);
    renderButtons(actions, page.buttons);
    panel.classList.toggle('buttons-bottom', page.buttonPosition === 'bottom');
    panel.classList.toggle('buttons-side', page.buttonPosition !== 'bottom');
    document.title = `${page.eyebrow || page.heading} — Kianan Studio`;
  }

  const year = q('#year');
  if (year) year.textContent = new Date().getFullYear();
  render(normalizePage(null));

  fetch(DATA_URL, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => render(normalizePage(data?.siteStaticPages?.[key])))
    .catch(() => {});
})();
