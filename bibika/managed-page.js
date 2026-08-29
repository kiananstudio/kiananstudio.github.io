(() => {
  const API_URL = '/api/catalog';
  const q = selector => document.querySelector(selector);

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

  function normalizePages(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => {
      const title = String(item?.title || '').trim();
      return {
        id: String(item?.id || '').trim().toLowerCase(),
        title,
        type: item?.type === 'categories' ? 'categories' : 'text',
        heading: String(item?.heading || title).trim() || title,
        content: String(item?.content ?? item?.description ?? '').trim(),
        cards: Array.isArray(item?.cards) ? item.cards.map(normalizeCard).filter(card => card.title) : []
      };
    }).filter(item => item.id && item.title);
  }

  function safeHref(value) {
    const href = String(value || '').trim();
    if (!href || /^(javascript|data|vbscript):/i.test(href)) return '';
    return href;
  }

  function renderNotFound() {
    document.title = 'Page not found — Kianan Bibika';
    q('#managed-page-title').textContent = 'Page not found.';
    const description = q('#managed-page-description');
    description.hidden = false;
    description.textContent = 'This page does not exist or has been removed.';
    q('#managed-page-content').replaceChildren();
    const edit = q('#edit-managed-page');
    if (edit) edit.hidden = true;
  }

  function renderText(page, host) {
    host.className = 'managed-page-content managed-page-text';
    const text = document.createElement('div');
    text.className = 'managed-page-text-body';
    text.textContent = page.content;
    host.replaceChildren(text);
    host.hidden = !page.content;
  }

  function renderCard(card) {
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

  function renderCategories(page, host) {
    host.className = 'managed-page-content managed-page-categories';
    const grid = document.createElement('div');
    grid.className = 'category-grid home-category-grid';
    page.cards.forEach(card => grid.appendChild(renderCard(card)));
    host.replaceChildren(grid);
    host.hidden = !page.cards.length;
  }

  function renderPage(page) {
    document.title = `${page.title} — Kianan Bibika`;
    q('#managed-page-title').textContent = page.heading || page.title;
    q('#managed-page-description').hidden = true;
    const host = q('#managed-page-content');
    if (page.type === 'categories') renderCategories(page, host);
    else renderText(page, host);
  }

  function openCurrentPageEditor() {
    const id = pageId();
    q('#edit-site-header')?.click();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const row = [...document.querySelectorAll('.header-page-row-managed')].find(item => item.dataset.pageId === id);
      const button = row?.querySelector('.header-page-edit');
      if (button) {
        clearInterval(timer);
        button.click();
      } else if (attempts > 40) {
        clearInterval(timer);
        const toast = q('#bibika-toast');
        if (toast) {
          toast.textContent = 'Не удалось открыть редактор этой страницы.';
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 3500);
        }
      }
    }, 75);
  }

  q('#edit-managed-page')?.addEventListener('click', openCurrentPageEditor);

  fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      const page = normalizePages(data?.sitePages).find(item => item.id === pageId());
      if (!page) renderNotFound();
      else renderPage(page);
    })
    .catch(renderNotFound);
})();