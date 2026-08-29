(() => {
  const DATA_URL = 'data/products.json';
  const q = (selector) => document.querySelector(selector);
  const DEFAULT_ICONS = {
    'unity-tools': '◇',
    games: '🎮',
    '3d-assets': '⬡'
  };

  function pageId() {
    return String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase();
  }

  function normalizePages(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        const title = String(item?.title || '').trim();
        const type = item?.type === 'categories' ? 'categories' : 'text';
        return {
          id: String(item?.id || '').trim().toLowerCase(),
          title,
          type,
          heading: String(item?.heading || title).trim() || title,
          content: String(item?.content ?? item?.description ?? '').trim(),
          categoryIds: Array.isArray(item?.categoryIds)
            ? item.categoryIds.map((id) => String(id || '').trim()).filter(Boolean)
            : []
        };
      })
      .filter((item) => item.id && item.title);
  }

  function normalizeCategories(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => ({
      id: String(item?.id || '').trim(),
      title: String(item?.title || '').trim(),
      description: String(item?.description || '').trim(),
      icon: String(item?.icon || DEFAULT_ICONS[item?.id] || '').trim()
    })).filter((item) => item.id && item.title);
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
    const content = q('#managed-page-content');
    if (title) title.textContent = 'Page not found.';
    if (description) {
      description.hidden = false;
      description.textContent = 'This page does not exist or has been removed.';
    }
    if (content) content.replaceChildren();
  }

  function renderTextContent(page, host) {
    host.className = 'managed-page-content managed-page-text';
    const text = document.createElement('div');
    text.className = 'managed-page-text-body';
    text.textContent = page.content;
    host.replaceChildren(text);
    host.hidden = !page.content;
  }

  function renderCategoryContent(page, host, categories) {
    host.className = 'managed-page-content managed-page-categories';
    const chosen = page.categoryIds.length
      ? page.categoryIds.map((id) => categories.find((category) => category.id === id)).filter(Boolean)
      : categories;

    const grid = document.createElement('div');
    grid.className = 'category-grid home-category-grid';
    chosen.forEach((category) => {
      const link = document.createElement('a');
      link.className = 'category-card category-link';
      link.href = `category.html?category=${encodeURIComponent(category.id)}`;

      const icon = document.createElement('span');
      icon.className = 'category-icon';
      icon.textContent = category.icon;

      const copy = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = category.title;
      const small = document.createElement('small');
      small.textContent = category.description;
      copy.append(strong, small);

      const arrow = document.createElement('span');
      arrow.className = 'catalog-arrow';
      arrow.textContent = '→';
      link.append(icon, copy, arrow);
      grid.appendChild(link);
    });

    host.replaceChildren(grid);
    host.hidden = !chosen.length;
  }

  function renderPage(page, data) {
    document.title = `${page.title} — Kianan Studio`;
    const title = q('#managed-page-title');
    const description = q('#managed-page-description');
    const content = q('#managed-page-content');
    if (title) title.textContent = page.heading || page.title;
    if (description) description.hidden = true;
    if (!content) return;

    if (page.type === 'categories') {
      renderCategoryContent(page, content, normalizeCategories(data?.categories));
    } else {
      renderTextContent(page, content);
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
      else renderPage(page, data);
    })
    .catch(() => renderNotFound());
})();