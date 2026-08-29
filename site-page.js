(() => {
  const DATA_URL = 'data/products.json';
  const q = (selector) => document.querySelector(selector);

  function pageId() {
    return String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase();
  }

  function normalizePages(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => ({
        id: String(item?.id || '').trim().toLowerCase(),
        title: String(item?.title || '').trim(),
        description: String(item?.description || '').trim(),
        content: String(item?.content || '').trim()
      }))
      .filter((item) => item.id && item.title);
  }

  function renderFooter(data) {
    const footer = data?.siteFooter || {};
    const brand = String(footer.brand || 'Kianan Studio').trim();
    const tagline = String(footer.tagline ?? 'Unity tools, 3D assets and games.').trim();
    const copyright = String(footer.copyright || 'Kianan Studio. All rights reserved.').trim();
    const brandNode = q('.site-footer .footer-brand strong');
    const taglineNode = q('.site-footer .footer-brand span');
    const copyrightNode = q('.site-footer .footer-inner > p');
    if (brandNode) brandNode.textContent = brand;
    if (taglineNode) taglineNode.textContent = tagline;
    if (copyrightNode) copyrightNode.textContent = `© ${new Date().getFullYear()} ${copyright}`;
  }

  function renderNotFound() {
    document.title = 'Page not found — Kianan Studio';
    const title = q('#managed-page-title');
    const description = q('#managed-page-description');
    if (title) title.textContent = 'Page not found.';
    if (description) {
      description.hidden = false;
      description.textContent = 'This page does not exist or has been removed.';
    }
  }

  function renderPage(page) {
    document.title = `${page.title} — Kianan Studio`;
    const title = q('#managed-page-title');
    const description = q('#managed-page-description');
    const content = q('#managed-page-content');
    if (title) title.textContent = page.title;
    if (description) {
      description.textContent = page.description;
      description.hidden = !page.description;
    }
    if (content) {
      content.textContent = page.content;
      content.hidden = !page.content;
    }
  }

  const toggle = q('.nav-toggle');
  const nav = q('.nav-links');
  toggle?.addEventListener('click', () => {
    const open = nav?.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  const year = q('#year');
  if (year) year.textContent = new Date().getFullYear();

  fetch(DATA_URL, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      renderFooter(data);
      const id = pageId();
      const page = normalizePages(data?.sitePages).find((item) => item.id === id);
      if (!page) renderNotFound();
      else renderPage(page);
    })
    .catch(() => renderNotFound());
})();
