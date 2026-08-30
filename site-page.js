(() => {
  const DATA_URL = 'data/products.json';
  const q = selector => document.querySelector(selector);
  const DEFAULT_ICONS = {
    'unity-tools': '◇',
    games: '🎮',
    '3d-assets': '⬡'
  };

  function pageId() {
    return String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase();
  }

  function normalizeCard(card) {
    return {
      title: String(card?.title || '').trim(),
      description: String(card?.description || '').trim(),
      icon: String(card?.icon || '').trim(),
      href: String(card?.href || '').trim()
    };
  }

  function normalizeButton(button) {
    return {
      label: String(button?.label || '').trim(),
      href: String(button?.href || '').trim(),
      style: button?.style === 'secondary' ? 'secondary' : 'primary'
    };
  }

  function normalizePages(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(item => {
        const title = String(item?.title || '').trim();
        const type = item?.type === 'categories' ? 'categories' : 'text';
        return {
          id: String(item?.id || '').trim().toLowerCase(),
          title,
          type,
          heading: String(item?.heading || title).trim() || title,
          content: String(item?.content ?? item?.description ?? '').trim(),
          cards: Array.isArray(item?.cards) ? item.cards.map(normalizeCard).filter(card => card.title) : [],
          categoryIds: Array.isArray(item?.categoryIds) ? item.categoryIds.map(id => String(id || '').trim()).filter(Boolean) : [],
          buttonPosition: item?.buttonPosition === 'bottom' ? 'bottom' : 'side',
          buttons: Array.isArray(item?.buttons) ? item.buttons.map(normalizeButton).filter(button => button.label && button.href) : []
        };
      })
      .filter(item => item.id && item.title);
  }

  function normalizeCategories(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => ({
      id: String(item?.id || '').trim(),
      title: String(item?.title || '').trim(),
      description: String(item?.description || '').trim(),
      icon: String(item?.icon || DEFAULT_ICONS[item?.id] || '').trim()
    })).filter(item => item.id && item.title);
  }

  function safeHref(value) {
    const href = String(value || '').trim();
    if (!href || /^(javascript|data|vbscript):/i.test(href)) return '';
    return href;
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
    const headingBlock = q('#managed-page .section-heading');
    const title = q('#managed-page-title');
    const description = q('#managed-page-description');
    const content = q('#managed-page-content');
    if (headingBlock) headingBlock.hidden = false;
    if (title) title.textContent = 'Page not found.';
    if (description) {
      description.hidden = false;
      description.textContent = 'This page does not exist or has been removed.';
    }
    if (content) content.replaceChildren();
  }

  function appendParagraphs(host, value) {
    String(value || '').split(/\n{2,}/).map(item => item.trim()).filter(Boolean).forEach(chunk => {
      const p = document.createElement('p');
      p.textContent = chunk;
      host.appendChild(p);
    });
  }

  function renderTextButton(button) {
    const href = safeHref(button.href);
    if (!href) return null;
    const link = document.createElement('a');
    link.className = `button ${button.style === 'secondary' ? 'button-secondary' : 'button-primary'}`;
    link.textContent = button.label;
    link.href = href;
    if (/^https?:\/\//i.test(href)) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
    return link;
  }

  function renderTextContent(page, host) {
    host.className = 'managed-page-content managed-page-text';
    const panel = document.createElement('section');
    panel.className = `contact-panel standalone-contact managed-text-panel ${page.buttonPosition === 'bottom' ? 'buttons-bottom' : 'buttons-side'}`;

    const copy = document.createElement('div');
    copy.className = 'managed-text-copy';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = page.title;
    const heading = document.createElement('h1');
    heading.className = 'catalog-page-title';
    heading.textContent = page.heading || page.title;
    const text = document.createElement('div');
    text.className = 'managed-page-text-body';
    appendParagraphs(text, page.content);
    copy.append(eyebrow, heading, text);

    const actions = document.createElement('div');
    actions.className = 'contact-actions managed-text-actions';
    page.buttons.forEach(button => {
      const link = renderTextButton(button);
      if (link) actions.appendChild(link);
    });

    panel.append(copy, actions);
    host.replaceChildren(panel);
    host.hidden = false;
  }

  function legacyCards(page, categories) {
    if (!page.categoryIds.length) return [];
    return page.categoryIds.map(id => {
      const category = categories.find(item => item.id === id);
      if (!category) return null;
      return {
        title: category.title,
        description: category.description,
        icon: category.icon,
        href: `category.html?category=${encodeURIComponent(category.id)}`
      };
    }).filter(Boolean);
  }

  function renderCategoryCard(card) {
    const href = safeHref(card.href);
    const node = document.createElement(href ? 'a' : 'div');
    node.className = `category-card category-link${href ? '' : ' managed-page-category-static'}`;
    if (href) node.href = href;

    const icon = document.createElement('span');
    icon.className = 'category-icon';
    icon.textContent = card.icon;

    const copy = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = card.title;
    const small = document.createElement('small');
    small.textContent = card.description;
    copy.append(strong, small);

    node.append(icon, copy);
    if (href) {
      const arrow = document.createElement('span');
      arrow.className = 'catalog-arrow';
      arrow.textContent = '→';
      node.appendChild(arrow);
    }
    return node;
  }

  function renderCategoryContent(page, host, categories) {
    host.className = 'managed-page-content managed-page-categories';
    const cards = page.cards.length ? page.cards : legacyCards(page, categories);
    const grid = document.createElement('div');
    grid.className = 'category-grid home-category-grid';
    cards.forEach(card => grid.appendChild(renderCategoryCard(card)));
    host.replaceChildren(grid);
    host.hidden = !cards.length;
  }

  function renderPage(page, data) {
    document.title = `${page.title} — Kianan Studio`;
    const headingBlock = q('#managed-page .section-heading');
    const title = q('#managed-page-title');
    const description = q('#managed-page-description');
    const content = q('#managed-page-content');
    if (!content) return;

    if (page.type === 'categories') {
      if (headingBlock) headingBlock.hidden = false;
      if (title) title.textContent = page.heading || page.title;
      if (description) description.hidden = true;
      renderCategoryContent(page, content, normalizeCategories(data?.categories));
    } else {
      if (headingBlock) headingBlock.hidden = true;
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
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      renderFooter(data);
      const id = pageId();
      const page = normalizePages(data?.sitePages).find(item => item.id === id);
      if (!page) renderNotFound();
      else renderPage(page, data);
    })
    .catch(() => renderNotFound());
})();
