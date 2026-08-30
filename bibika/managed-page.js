(() => {
  const API_URL = '/api/catalog';
  const q = selector => document.querySelector(selector);
  let latestCatalog = null;

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
    return value.map(item => {
      const title = String(item?.title || '').trim();
      return {
        id: String(item?.id || '').trim().toLowerCase(),
        title,
        type: item?.type === 'categories' ? 'categories' : 'text',
        heading: String(item?.heading || title).trim() || title,
        content: String(item?.content ?? item?.description ?? '').trim(),
        cards: Array.isArray(item?.cards) ? item.cards.map(normalizeCard).filter(card => card.title) : [],
        buttonPosition: item?.buttonPosition === 'bottom' ? 'bottom' : 'side',
        buttons: Array.isArray(item?.buttons) ? item.buttons.map(normalizeButton).filter(button => button.label && button.href) : []
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

  function appendParagraphs(host, value) {
    String(value || '').split(/\n{2,}/).map(item => item.trim()).filter(Boolean).forEach(chunk => {
      const p = document.createElement('p');
      p.textContent = chunk;
      host.appendChild(p);
    });
  }

  function renderText(page, host) {
    const headingBlock = q('#managed-page .section-heading');
    if (headingBlock) headingBlock.hidden = true;
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
      const href = safeHref(button.href);
      if (!href) return;
      const link = document.createElement('a');
      link.className = `button ${button.style === 'secondary' ? 'button-secondary' : 'button-primary'}`;
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
    host.replaceChildren(panel);
    host.hidden = false;
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
    const headingBlock = q('#managed-page .section-heading');
    if (headingBlock) headingBlock.hidden = false;
    q('#managed-page-title').textContent = page.heading || page.title;
    q('#managed-page-description').hidden = true;
    host.className = 'managed-page-content managed-page-categories';
    const grid = document.createElement('div');
    grid.className = 'category-grid home-category-grid';
    page.cards.forEach(card => grid.appendChild(renderCard(card)));
    host.replaceChildren(grid);
    host.hidden = !page.cards.length;
  }

  function renderPage(page) {
    document.title = `${page.title} — Kianan Bibika`;
    const host = q('#managed-page-content');
    if (page.type === 'categories') renderCategories(page, host);
    else renderText(page, host);
  }

  function hideHeaderEditorBehindPageDialog() {
    const headerOverlay = q('#header-editor-overlay');
    if (headerOverlay) {
      headerOverlay.classList.remove('open');
      headerOverlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('header-editor-open');
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
        hideHeaderEditorBehindPageDialog();
      } else if (attempts > 40) {
        clearInterval(timer);
        hideHeaderEditorBehindPageDialog();
        const toast = q('#bibika-toast');
        if (toast) {
          toast.textContent = 'Не удалось открыть редактор этой страницы.';
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 3500);
        }
      }
    }, 75);
  }

  function sitePageItems(data) {
    const fixed = [
      { title: 'Home', href: './', badge: 'Существующая' },
      { title: 'Unity Tools', href: 'category.html?category=unity-tools', badge: 'Существующая' },
      { title: 'Games', href: 'category.html?category=games', badge: 'Существующая' },
      { title: '3D Assets', href: 'category.html?category=3d-assets', badge: 'Существующая' },
      { title: 'About', href: 'about.html', badge: 'Существующая' },
      { title: 'Contact', href: 'contact.html', badge: 'Существующая' }
    ];
    const managed = normalizePages(data?.sitePages).map(page => ({
      title: page.title,
      href: `page.html?page=${encodeURIComponent(page.id)}`,
      badge: page.type === 'categories' ? 'Категории' : 'Текст',
      id: page.id
    }));
    return [...fixed, ...managed];
  }

  function renderSitePagesSection(data) {
    const body = q('#header-page-create-overlay .header-page-create-body');
    if (!body) return;
    let section = q('#managed-editor-site-pages');
    if (!section) {
      section = document.createElement('section');
      section.id = 'managed-editor-site-pages';
      section.className = 'managed-editor-site-pages';
      section.innerHTML = '<div class="managed-editor-site-pages-head"><strong>Страницы сайта</strong><span>Переходи между страницами внутри Bibika.</span></div><div class="managed-editor-site-pages-list"></div>';
      body.appendChild(section);
    }
    const editingExistingPage = !!q('#header-page-id')?.disabled;
    section.hidden = !editingExistingPage;
    if (!editingExistingPage) return;
    const list = section.querySelector('.managed-editor-site-pages-list');
    list.replaceChildren();
    const currentId = pageId();
    sitePageItems(data).forEach(item => {
      const link = document.createElement('a');
      link.className = 'managed-editor-site-page';
      link.href = item.href;
      const isCurrent = item.id && item.id === currentId;
      if (isCurrent) {
        link.classList.add('current');
        link.setAttribute('aria-current', 'page');
      }
      const main = document.createElement('span');
      main.className = 'managed-editor-site-page-main';
      const strong = document.createElement('strong');
      strong.textContent = item.title;
      const path = document.createElement('span');
      path.textContent = item.href;
      main.append(strong, path);
      const badge = document.createElement('span');
      badge.className = 'managed-editor-site-page-badge';
      badge.textContent = isCurrent ? 'Текущая' : item.badge;
      link.append(main, badge);
      list.appendChild(link);
    });
  }

  async function refreshSitePagesSection() {
    if (!q('#header-page-create-overlay')?.classList.contains('open')) return;
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (response.ok) latestCatalog = await response.json();
    } catch {}
    if (latestCatalog) renderSitePagesSection(latestCatalog);
  }

  function bindPageEditorEnhancements() {
    const overlay = q('#header-page-create-overlay');
    if (!overlay) return;
    const observer = new MutationObserver(() => {
      if (overlay.classList.contains('open')) setTimeout(refreshSitePagesSection, 0);
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }

  q('#edit-managed-page')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openCurrentPageEditor();
  });
  window.addEventListener('DOMContentLoaded', bindPageEditorEnhancements, { once: true });

  fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      latestCatalog = data;
      const page = normalizePages(data?.sitePages).find(item => item.id === pageId());
      if (!page) renderNotFound();
      else renderPage(page);
    })
    .catch(renderNotFound);
})();
