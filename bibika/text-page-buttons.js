(() => {
  const API_URL = '/api/catalog';
  const originalFetch = window.fetch.bind(window);
  const known = new Map();
  const drafts = new Map();
  let catalogCache = null;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function normalizeButton(button) {
    return {
      label: String(button?.label || '').trim(),
      href: String(button?.href || '').trim(),
      style: button?.style === 'secondary' ? 'secondary' : 'primary'
    };
  }

  function normalizeConfig(page) {
    return {
      buttonPosition: page?.buttonPosition === 'bottom' ? 'bottom' : 'side',
      buttons: Array.isArray(page?.buttons) ? page.buttons.map(normalizeButton).filter(item => item.label || item.href) : []
    };
  }

  function slugify(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function isCatalogUrl(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return new URL(raw, location.href).pathname === '/api/catalog';
    } catch {
      return false;
    }
  }

  async function preload() {
    try {
      const response = await originalFetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      catalogCache = data;
      (Array.isArray(data?.sitePages) ? data.sitePages : []).forEach(page => {
        if (page?.type !== 'categories' && page?.id) known.set(String(page.id).toLowerCase(), normalizeConfig(page));
      });
    } catch {}
  }

  window.fetch = async function patchedFetch(input, init = {}) {
    let nextInit = init;
    let injectedPages = null;
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();

    if (isCatalogUrl(input) && (method === 'POST' || method === 'PUT') && typeof init?.body === 'string') {
      try {
        const payload = JSON.parse(init.body);
        if (payload?.data && Array.isArray(payload.data.sitePages)) {
          payload.data.sitePages = payload.data.sitePages.map(page => {
            if (page?.type === 'categories') return page;
            const id = String(page?.id || '').trim().toLowerCase();
            const cfg = drafts.get(id) || known.get(id) || normalizeConfig(page);
            return {
              ...page,
              buttonPosition: cfg.buttonPosition,
              buttons: cfg.buttons.map(normalizeButton)
            };
          });
          injectedPages = payload.data.sitePages;
          nextInit = { ...init, body: JSON.stringify(payload) };
        }
      } catch {}
    }

    const response = await originalFetch(input, nextInit);
    if (response.ok && injectedPages) {
      injectedPages.forEach(page => {
        if (page?.type === 'categories' || !page?.id) return;
        const id = String(page.id).toLowerCase();
        const cfg = normalizeConfig(page);
        known.set(id, cfg);
        drafts.delete(id);
      });
    }
    return response;
  };

  function createButtonRow(button = {}) {
    const item = normalizeButton(button);
    const row = document.createElement('div');
    row.className = 'text-page-button-row';
    row.innerHTML = `
      <div class="text-page-button-number"></div>
      <label class="header-editor-field"><span>Название кнопки</span><input class="text-page-button-label" type="text" autocomplete="off" placeholder="Например, Contact"></label>
      <label class="header-editor-field"><span>Куда ведёт</span><input class="text-page-button-href" type="text" autocomplete="off" placeholder="contact.html или https://..."></label>
      <label class="header-editor-field"><span>Цвет кнопки</span><select class="text-page-button-style"><option value="primary">Синяя</option><option value="secondary">Тёмная</option></select></label>
      <div class="text-page-button-actions"><button type="button" class="text-page-button-up" title="Переместить выше">↑</button><button type="button" class="text-page-button-down" title="Переместить ниже">↓</button><button type="button" class="text-page-button-delete" title="Удалить кнопку">×</button></div>`;
    q('.text-page-button-label', row).value = item.label;
    q('.text-page-button-href', row).value = item.href;
    q('.text-page-button-style', row).value = item.style;
    return row;
  }

  function renumberButtons() {
    const rows = qa('.text-page-button-row', q('#text-page-buttons-list'));
    rows.forEach((row, index) => {
      q('.text-page-button-number', row).textContent = `${index + 1}`;
      q('.text-page-button-up', row).disabled = index === 0;
      q('.text-page-button-down', row).disabled = index === rows.length - 1;
    });
    const empty = q('#text-page-buttons-empty');
    if (empty) empty.hidden = rows.length > 0;
  }

  function renderButtons(config) {
    const list = q('#text-page-buttons-list');
    if (!list) return;
    list.replaceChildren();
    (config?.buttons || []).forEach(button => list.appendChild(createButtonRow(button)));
    const position = q('#text-page-button-position');
    if (position) position.value = config?.buttonPosition === 'bottom' ? 'bottom' : 'side';
    renumberButtons();
  }

  function collectButtons() {
    return {
      buttonPosition: q('#text-page-button-position')?.value === 'bottom' ? 'bottom' : 'side',
      buttons: qa('.text-page-button-row', q('#text-page-buttons-list')).map(row => ({
        label: q('.text-page-button-label', row)?.value.trim() || '',
        href: q('.text-page-button-href', row)?.value.trim() || '',
        style: q('.text-page-button-style', row)?.value === 'secondary' ? 'secondary' : 'primary'
      })).filter(item => item.label || item.href)
    };
  }

  function siteItems() {
    const fixed = [
      ['Home', './', 'Существующая'],
      ['Unity Tools', 'category.html?category=unity-tools', 'Существующая'],
      ['Games', 'category.html?category=games', 'Существующая'],
      ['3D Assets', 'category.html?category=3d-assets', 'Существующая'],
      ['About', 'about.html', 'Существующая'],
      ['Contact', 'contact.html', 'Существующая']
    ].map(([title, href, badge]) => ({ title, href, badge }));
    const managed = (Array.isArray(catalogCache?.sitePages) ? catalogCache.sitePages : []).map(page => ({
      title: String(page?.title || page?.id || '').trim(), href: `page.html?page=${encodeURIComponent(String(page?.id || '').trim())}`, badge: page?.type === 'categories' ? 'Категории' : 'Текст'
    })).filter(item => item.title);
    const products = (Array.isArray(catalogCache?.products) ? catalogCache.products : []).map(product => ({
      title: String(product?.title || product?.id || '').trim(), href: String(product?.href || `product.html?id=${encodeURIComponent(product?.id || '')}`).trim(), badge: 'Продукт'
    })).filter(item => item.title && item.href);
    return [...fixed, ...managed, ...products];
  }

  function renderSitePages() {
    const list = q('#text-page-site-pages-list');
    if (!list) return;
    list.replaceChildren();
    siteItems().forEach(item => {
      const link = document.createElement('a');
      link.className = 'text-page-site-link';
      link.href = item.href;
      const main = document.createElement('span');
      main.innerHTML = `<strong></strong><span></span>`;
      q('strong', main).textContent = item.title;
      q('span span', main).textContent = item.href;
      const badge = document.createElement('em');
      badge.textContent = item.badge;
      link.append(main, badge);
      list.appendChild(link);
    });
  }

  function ensureUi() {
    const textFields = q('#header-page-text-fields');
    if (!textFields || q('#text-page-buttons-editor')) return;
    const wrap = document.createElement('div');
    wrap.id = 'text-page-buttons-editor';
    wrap.className = 'text-page-buttons-editor';
    wrap.innerHTML = `
      <label class="header-editor-field"><span>Расположение кнопок</span><select id="text-page-button-position"><option value="side">Сбоку текста</option><option value="bottom">Внизу текста</option></select></label>
      <div class="text-page-buttons-head"><div><strong>Кнопки</strong><span>Используются стандартные кнопки сайта. Для каждой выбери название, адрес и один из двух цветов.</span></div><button type="button" id="text-page-add-button">+ Добавить кнопку</button></div>
      <div id="text-page-buttons-list" class="text-page-buttons-list"></div>
      <div id="text-page-buttons-empty" class="text-page-buttons-empty">Кнопок пока нет.</div>
      <section class="text-page-site-pages"><div class="text-page-site-pages-head"><strong>Страницы сайта</strong><span>Готовые адреса страниц, которые можно использовать в поле «Куда ведёт».</span></div><div id="text-page-site-pages-list" class="text-page-site-pages-list"></div></section>`;
    textFields.appendChild(wrap);

    q('#text-page-add-button')?.addEventListener('click', () => {
      const row = createButtonRow();
      q('#text-page-buttons-list')?.appendChild(row);
      renumberButtons();
      q('.text-page-button-label', row)?.focus();
    });

    q('#text-page-buttons-list')?.addEventListener('click', event => {
      const row = event.target.closest('.text-page-button-row');
      if (!row) return;
      if (event.target.closest('.text-page-button-delete')) row.remove();
      else if (event.target.closest('.text-page-button-up') && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      else if (event.target.closest('.text-page-button-down') && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
      renumberButtons();
    });
  }

  function currentId() {
    return slugify(q('#header-page-id')?.value || q('#header-page-title')?.value || '');
  }

  function populateForDialog() {
    ensureUi();
    const overlay = q('#header-page-create-overlay');
    if (!overlay?.classList.contains('open')) return;
    const type = q('#header-page-content-type')?.value || 'text';
    document.body.classList.toggle('text-page-buttons-active', type === 'text');
    if (type !== 'text') return;
    const editor = q('#text-page-buttons-editor');
    if (!editor) return;
    const id = currentId();
    const token = id || '__new__';
    if (editor.dataset.loadedId === token) return;
    editor.dataset.loadedId = token;
    renderButtons(drafts.get(id) || known.get(id) || { buttonPosition: 'side', buttons: [] });
    renderSitePages();
  }

  function captureDraft() {
    if ((q('#header-page-content-type')?.value || 'text') !== 'text') return;
    const id = currentId();
    if (!id) return;
    const cfg = collectButtons();
    for (let i = 0; i < cfg.buttons.length; i += 1) {
      if (!cfg.buttons[i].label || !cfg.buttons[i].href) return;
      if (/^(javascript|data|vbscript):/i.test(cfg.buttons[i].href)) return;
    }
    drafts.set(id, cfg);
  }

  function bind() {
    ensureUi();
    const overlay = q('#header-page-create-overlay');
    if (!overlay) return;
    const observer = new MutationObserver(() => {
      if (overlay.classList.contains('open')) setTimeout(populateForDialog, 0);
      else {
        document.body.classList.remove('text-page-buttons-active');
        const editor = q('#text-page-buttons-editor');
        if (editor) editor.dataset.loadedId = '';
      }
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });

    q('#header-page-content-type')?.addEventListener('change', () => {
      const editor = q('#text-page-buttons-editor');
      if (editor) editor.dataset.loadedId = '';
      setTimeout(populateForDialog, 0);
    });
    q('#header-page-create-confirm')?.addEventListener('click', captureDraft, true);
    q('#header-page-id')?.addEventListener('input', () => {
      const editor = q('#text-page-buttons-editor');
      if (editor && !q('#header-page-id')?.disabled) editor.dataset.loadedId = '';
    });
  }

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = '/text-page-buttons.css?v=1';
  document.head.appendChild(style);

  preload().finally(() => {
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
  });
})();
