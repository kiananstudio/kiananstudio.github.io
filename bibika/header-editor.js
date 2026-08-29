(() => {
  const API_URL = '/api/catalog';
  const REPO_CONTENTS_URL = 'https://api.github.com/repos/kiananstudio/kiananstudio.github.io/contents?ref=main';
  const DEFAULT_LINKS = [
    { label: 'Unity Tools', href: 'category.html?category=unity-tools' },
    { label: 'Games', href: 'category.html?category=games' },
    { label: '3D Assets', href: 'category.html?category=3d-assets' },
    { label: 'About', href: 'about.html' },
    { label: 'Contact', href: 'contact.html' }
  ];
  const FALLBACK_REPO_PAGES = [
    { title: 'Home', path: 'index.html', managed: false },
    { title: 'About', path: 'about.html', managed: false },
    { title: 'Contact', path: 'contact.html', managed: false }
  ];
  const HIDDEN_TEMPLATE_PAGES = new Set(['category.html', 'product.html', 'page.html', '404.html']);

  let workingLinks = [];
  let workingPages = [];
  let repositoryPages = [...FALLBACK_REPO_PAGES];
  let saving = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function showToast(message, duration = 3200) {
    const toast = q('#bibika-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function normalizeLinks(value) {
    if (!Array.isArray(value)) return DEFAULT_LINKS.map((item) => ({ ...item }));
    const result = value
      .map((item) => ({ label: String(item?.label || '').trim(), href: String(item?.href || '').trim() }))
      .filter((item) => item.label || item.href);
    return result.length ? result : DEFAULT_LINKS.map((item) => ({ ...item }));
  }

  function normalizePages(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => ({
        id: String(item?.id || '').trim().toLowerCase(),
        title: String(item?.title || '').trim(),
        description: String(item?.description || '').trim(),
        managed: true
      }))
      .filter((item) => /^[a-z0-9-]+$/.test(item.id) && item.title);
  }

  function slugify(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function validateHref(value) {
    const href = String(value || '').trim();
    if (!href) return 'У каждой кнопки должен быть указан адрес.';
    if (/^(javascript|data|vbscript):/i.test(href)) return 'Этот тип ссылки запрещён.';
    return '';
  }

  function publicHref(value) {
    const href = String(value || '').trim();
    if (!href) return '#';
    if (/^(https?:|mailto:|tel:)/i.test(href) || href.startsWith('#')) return href;
    try {
      return new URL(href, 'https://kiananstudio.com/').href;
    } catch {
      return '#';
    }
  }

  function managedPageHref(id) {
    return `page.html?page=${encodeURIComponent(id)}`;
  }

  function friendlyFileTitle(path) {
    const known = {
      'index.html': 'Home',
      'about.html': 'About',
      'contact.html': 'Contact'
    };
    if (known[path]) return known[path];
    return String(path || '')
      .replace(/\.html$/i, '')
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || path;
  }

  async function fetchRepositoryPages() {
    try {
      const response = await fetch(REPO_CONTENTS_URL, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
      const items = await response.json();
      const pages = Array.isArray(items)
        ? items
            .filter((item) => item?.type === 'file' && /\.html$/i.test(item.name || '') && !HIDDEN_TEMPLATE_PAGES.has(item.name))
            .map((item) => ({ title: friendlyFileTitle(item.name), path: item.path, managed: false }))
        : [];
      repositoryPages = pages.length ? pages : [...FALLBACK_REPO_PAGES];
    } catch {
      repositoryPages = [...FALLBACK_REPO_PAGES];
    }
  }

  function allPageOptions() {
    const managed = workingPages.map((page) => ({
      title: page.title,
      path: managedPageHref(page.id),
      managed: true,
      id: page.id
    }));
    const seen = new Set(managed.map((item) => item.path));
    const existing = repositoryPages.filter((item) => !seen.has(item.path));
    return [...managed, ...existing];
  }

  function renderBibikaHeader(links) {
    const nav = q('.site-header .nav-links');
    if (!nav) return;
    nav.innerHTML = '';
    links.forEach((item) => {
      const anchor = document.createElement('a');
      anchor.textContent = item.label;
      anchor.href = publicHref(item.href);
      if (!/^mailto:|^tel:|^#/i.test(item.href)) {
        anchor.target = '_blank';
        anchor.rel = 'noreferrer';
      }
      nav.appendChild(anchor);
    });
  }

  function isKnownPageHref(href) {
    return allPageOptions().some((page) => page.path === href);
  }

  function fillPageSelect(select, currentValue = '') {
    if (!select) return;
    select.innerHTML = '<option value="">Выбери страницу</option>';

    const managed = workingPages;
    if (managed.length) {
      const group = document.createElement('optgroup');
      group.label = 'Страницы Bibika';
      managed.forEach((page) => {
        const option = document.createElement('option');
        option.value = managedPageHref(page.id);
        option.textContent = `${page.title} — ${managedPageHref(page.id)}`;
        group.appendChild(option);
      });
      select.appendChild(group);
    }

    if (repositoryPages.length) {
      const group = document.createElement('optgroup');
      group.label = 'Существующие страницы сайта';
      repositoryPages.forEach((page) => {
        const option = document.createElement('option');
        option.value = page.path;
        option.textContent = `${page.title} — ${page.path}`;
        group.appendChild(option);
      });
      select.appendChild(group);
    }

    if (currentValue && !allPageOptions().some((page) => page.path === currentValue)) {
      const option = document.createElement('option');
      option.value = currentValue;
      option.textContent = currentValue;
      select.appendChild(option);
    }
    select.value = currentValue;
  }

  function syncRowDestination(row, preferredMode = null) {
    const mode = q('.header-link-mode', row);
    const pageSelect = q('.header-page-select', row);
    const hrefInput = q('.header-link-href', row);
    if (!mode || !pageSelect || !hrefInput) return;

    const href = row.dataset.href || '';
    const nextMode = preferredMode || (isKnownPageHref(href) ? 'page' : 'link');
    mode.value = nextMode;
    fillPageSelect(pageSelect, nextMode === 'page' ? href : '');
    hrefInput.value = nextMode === 'link' ? href : '';
    pageSelect.hidden = nextMode !== 'page';
    hrefInput.hidden = nextMode !== 'link';
  }

  function createRow(item = { label: '', href: '' }) {
    const row = document.createElement('div');
    row.className = 'header-link-row';
    row.dataset.href = String(item.href || '').trim();
    row.innerHTML = `
      <div class="header-link-row-number"></div>
      <label class="header-editor-field">
        <span>Название кнопки</span>
        <input class="header-link-label" type="text" autocomplete="off" placeholder="Например, Support">
      </label>
      <label class="header-editor-field header-editor-field-type">
        <span>Тип</span>
        <select class="header-link-mode">
          <option value="page">Страница сайта</option>
          <option value="link">Ссылка</option>
        </select>
      </label>
      <label class="header-editor-field header-editor-field-url">
        <span>Куда ведёт</span>
        <select class="header-page-select"></select>
        <input class="header-link-href" type="text" autocomplete="off" placeholder="Например, category.html?category=games или https://...">
      </label>
      <div class="header-link-actions">
        <button type="button" class="header-row-button header-row-up" title="Переместить выше">↑</button>
        <button type="button" class="header-row-button header-row-down" title="Переместить ниже">↓</button>
        <button type="button" class="header-row-button header-row-delete" title="Удалить кнопку">Удалить</button>
      </div>`;
    q('.header-link-label', row).value = item.label || '';
    syncRowDestination(row);
    return row;
  }

  function refreshPageSelectors() {
    qa('.header-link-row', q('#header-links-editor')).forEach((row) => {
      const mode = q('.header-link-mode', row)?.value || 'link';
      const current = mode === 'page' ? q('.header-page-select', row)?.value || row.dataset.href : row.dataset.href;
      if (mode === 'page') {
        fillPageSelect(q('.header-page-select', row), current);
      }
    });
  }

  function renumberRows() {
    const rows = qa('.header-link-row', q('#header-links-editor'));
    rows.forEach((row, index) => {
      q('.header-link-row-number', row).textContent = `Кнопка ${index + 1}`;
      q('.header-row-up', row).disabled = index === 0;
      q('.header-row-down', row).disabled = index === rows.length - 1;
    });
  }

  function renderRows(links) {
    const editor = q('#header-links-editor');
    if (!editor) return;
    editor.innerHTML = '';
    links.forEach((item) => editor.appendChild(createRow(item)));
    renumberRows();
  }

  function rowHref(row) {
    const mode = q('.header-link-mode', row)?.value || 'link';
    return mode === 'page'
      ? q('.header-page-select', row)?.value.trim() || ''
      : q('.header-link-href', row)?.value.trim() || '';
  }

  function collectRows() {
    return qa('.header-link-row', q('#header-links-editor')).map((row) => ({
      label: q('.header-link-label', row).value.trim(),
      href: rowHref(row)
    }));
  }

  async function fetchCatalog() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadHeaderFromGitHub({ updateRows = false } = {}) {
    try {
      const [catalog] = await Promise.all([fetchCatalog(), fetchRepositoryPages()]);
      workingLinks = normalizeLinks(catalog?.siteHeader?.links);
      workingPages = normalizePages(catalog?.sitePages);
      renderBibikaHeader(workingLinks);
      renderPagesManager();
      if (updateRows) renderRows(workingLinks);
      return workingLinks;
    } catch (error) {
      showToast(`Не удалось загрузить Header: ${error.message}`, 4500);
      return null;
    }
  }

  function setState(message, state = '') {
    const node = q('#header-editor-state');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function openEditor() {
    if (saving) return;
    renderRows(workingLinks.length ? workingLinks : DEFAULT_LINKS);
    renderPagesManager();
    setState('Изменения будут опубликованы на kiananstudio.com после сохранения.');
    const overlay = q('#header-editor-overlay');
    overlay?.classList.add('open');
    overlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('header-editor-open');
  }

  function closeEditor() {
    if (saving) return;
    const overlay = q('#header-editor-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('header-editor-open');
  }

  function renderPagesManager() {
    const list = q('#header-pages-list');
    if (!list) return;
    list.innerHTML = '';

    workingPages.forEach((page) => {
      const row = document.createElement('div');
      row.className = 'header-page-row header-page-row-managed';
      row.dataset.pageId = page.id;
      row.innerHTML = `
        <div class="header-page-row-main">
          <strong></strong>
          <span></span>
        </div>
        <span class="header-page-badge">Bibika</span>
        <button type="button" class="header-page-delete" title="Удалить страницу" aria-label="Удалить страницу">×</button>`;
      q('strong', row).textContent = page.title;
      q('.header-page-row-main span', row).textContent = managedPageHref(page.id);
      list.appendChild(row);
    });

    repositoryPages.forEach((page) => {
      const row = document.createElement('div');
      row.className = 'header-page-row';
      row.innerHTML = `
        <div class="header-page-row-main">
          <strong></strong>
          <span></span>
        </div>
        <span class="header-page-badge header-page-badge-existing">Существующая</span>
        <span class="header-page-lock" title="Эта страница не удаляется через Header">◆</span>`;
      q('strong', row).textContent = page.title;
      q('.header-page-row-main span', row).textContent = page.path;
      list.appendChild(row);
    });
  }

  function openCreatePage() {
    const overlay = q('#header-page-create-overlay');
    if (!overlay) return;
    q('#header-page-title').value = '';
    q('#header-page-id').value = '';
    q('#header-page-create-state').textContent = '';
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => q('#header-page-title')?.focus(), 0);
  }

  function closeCreatePage() {
    const overlay = q('#header-page-create-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
  }

  function createManagedPage() {
    const title = q('#header-page-title')?.value.trim() || '';
    const id = slugify(q('#header-page-id')?.value || title);
    const state = q('#header-page-create-state');
    if (!title) {
      if (state) state.textContent = 'Укажи название страницы.';
      return;
    }
    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      if (state) state.textContent = 'Адрес страницы должен содержать латинские буквы, цифры и дефисы.';
      return;
    }
    if (workingPages.some((page) => page.id === id)) {
      if (state) state.textContent = 'Страница с таким адресом уже существует в Bibika.';
      return;
    }

    const href = managedPageHref(id);
    workingPages.push({ id, title, description: '', managed: true });
    renderPagesManager();
    refreshPageSelectors();

    const editor = q('#header-links-editor');
    if (editor) {
      const row = createRow({ label: title, href });
      editor.appendChild(row);
      renumberRows();
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    closeCreatePage();
    setState(`Страница «${title}» подготовлена и добавлена в Header. Нажми «Сохранить».`);
  }

  function deleteManagedPage(id) {
    const page = workingPages.find((item) => item.id === id);
    if (!page) return;
    const href = managedPageHref(page.id);
    const linkedRows = qa('.header-link-row', q('#header-links-editor')).filter((row) => rowHref(row) === href);
    const suffix = linkedRows.length ? ' Связанные с ней кнопки Header тоже будут удалены.' : '';
    if (!window.confirm(`Удалить страницу «${page.title}»?${suffix}`)) return;

    workingPages = workingPages.filter((item) => item.id !== id);
    linkedRows.forEach((row) => row.remove());
    renumberRows();
    renderPagesManager();
    refreshPageSelectors();
    setState(`Страница «${page.title}» будет удалена после сохранения.`);
  }

  async function saveHeader() {
    if (saving) return;
    const links = collectRows();
    if (!links.length) {
      setState('Добавь хотя бы одну кнопку Header.', 'error');
      return;
    }

    for (let index = 0; index < links.length; index += 1) {
      if (!links[index].label) {
        setState(`Заполни название кнопки ${index + 1}.`, 'error');
        return;
      }
      const hrefError = validateHref(links[index].href);
      if (hrefError) {
        setState(`Кнопка ${index + 1}: ${hrefError}`, 'error');
        return;
      }
    }

    saving = true;
    const saveButton = q('#header-editor-save');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Сохранение…';
    }
    setState('Публикую Header и страницы в GitHub…', 'busy');

    try {
      const catalog = await fetchCatalog();
      catalog.siteHeader = { links };
      catalog.sitePages = workingPages.map(({ id, title, description }) => ({ id, title, description }));
      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: catalog, message: 'Bibika: update Header and site pages' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      workingLinks = links.map((item) => ({ ...item }));
      renderBibikaHeader(workingLinks);
      setState('Header и страницы сохранены и опубликованы.', 'ok');
      showToast('Header и страницы сохранены в GitHub.');
      setTimeout(() => {
        saving = false;
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = 'Сохранить';
        }
        closeEditor();
      }, 650);
      return;
    } catch (error) {
      setState(`Не удалось сохранить Header: ${error.message}`, 'error');
      showToast(`Ошибка сохранения Header: ${error.message}`, 4800);
    }

    saving = false;
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Сохранить';
    }
  }

  function ensureModal() {
    if (q('#header-editor-overlay')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="header-editor-overlay" id="header-editor-overlay" aria-hidden="true">
        <section class="header-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="header-editor-title">
          <div class="header-editor-head">
            <div>
              <span class="header-editor-eyebrow">Редактирование блока</span>
              <h2 id="header-editor-title">Header</h2>
              <p>Настраивай кнопки Header, выбирай существующие страницы, создавай новые страницы и удаляй страницы, созданные через Bibika.</p>
            </div>
            <button type="button" class="header-editor-close" id="header-editor-close" aria-label="Закрыть">×</button>
          </div>
          <div class="header-editor-body">
            <section class="header-editor-section">
              <div class="header-editor-section-head">
                <div><strong>Кнопки Header</strong><span>Название, назначение и порядок кнопок.</span></div>
              </div>
              <div id="header-links-editor" class="header-links-editor"></div>
              <button type="button" class="header-add-link" id="header-add-link">+ Добавить кнопку</button>
            </section>

            <section class="header-editor-section header-pages-section">
              <div class="header-editor-section-head">
                <div><strong>Страницы сайта</strong><span>Существующие страницы можно выбирать. Удалять можно только страницы, созданные через Bibika.</span></div>
                <button type="button" class="header-create-page" id="header-create-page">+ Создать страницу</button>
              </div>
              <div class="header-pages-list" id="header-pages-list"></div>
            </section>
          </div>
          <div class="header-editor-footer">
            <span id="header-editor-state" class="header-editor-state">Изменения будут опубликованы на kiananstudio.com после сохранения.</span>
            <div class="header-editor-footer-actions">
              <button type="button" class="button button-secondary" id="header-editor-cancel">Отмена</button>
              <button type="button" class="button button-primary" id="header-editor-save">Сохранить</button>
            </div>
          </div>
        </section>
      </div>

      <div class="header-page-create-overlay" id="header-page-create-overlay" aria-hidden="true">
        <section class="header-page-create-dialog" role="dialog" aria-modal="true" aria-labelledby="header-page-create-title">
          <div class="header-editor-head">
            <div>
              <span class="header-editor-eyebrow">Новая страница</span>
              <h2 id="header-page-create-title">Создать страницу</h2>
              <p>Страница сразу будет добавлена как новая кнопка Header. Содержимое страницы мы подключим к визуальному редактору следующим этапом.</p>
            </div>
            <button type="button" class="header-editor-close" id="header-page-create-close" aria-label="Закрыть">×</button>
          </div>
          <div class="header-page-create-body">
            <label class="header-editor-field">
              <span>Название страницы</span>
              <input id="header-page-title" type="text" autocomplete="off" placeholder="Например, Support">
            </label>
            <label class="header-editor-field">
              <span>Адрес страницы</span>
              <div class="header-page-address-row"><span>page.html?page=</span><input id="header-page-id" type="text" autocomplete="off" placeholder="support"></div>
              <small>Латинские буквы, цифры и дефисы. Можно оставить пустым — адрес создастся из названия.</small>
            </label>
            <div class="header-page-create-state" id="header-page-create-state"></div>
          </div>
          <div class="header-editor-footer">
            <span></span>
            <div class="header-editor-footer-actions">
              <button type="button" class="button button-secondary" id="header-page-create-cancel">Отмена</button>
              <button type="button" class="button button-primary" id="header-page-create-confirm">Создать</button>
            </div>
          </div>
        </section>
      </div>`;
    document.body.appendChild(wrapper);
  }

  function bind() {
    ensureModal();

    q('#edit-site-header')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditor();
    });
    q('#header-editor-close')?.addEventListener('click', closeEditor);
    q('#header-editor-cancel')?.addEventListener('click', closeEditor);
    q('#header-editor-save')?.addEventListener('click', saveHeader);
    q('#header-add-link')?.addEventListener('click', () => {
      const row = createRow({ label: '', href: '' });
      q('#header-links-editor')?.appendChild(row);
      q('.header-link-mode', row).value = 'page';
      syncRowDestination(row, 'page');
      renumberRows();
      q('.header-link-label', row)?.focus();
    });

    q('#header-links-editor')?.addEventListener('change', (event) => {
      const row = event.target.closest('.header-link-row');
      if (!row) return;
      if (event.target.matches('.header-link-mode')) {
        const mode = event.target.value;
        row.dataset.href = mode === 'page' ? q('.header-page-select', row)?.value || '' : q('.header-link-href', row)?.value || '';
        syncRowDestination(row, mode);
        return;
      }
      if (event.target.matches('.header-page-select')) row.dataset.href = event.target.value;
    });

    q('#header-links-editor')?.addEventListener('input', (event) => {
      const row = event.target.closest('.header-link-row');
      if (row && event.target.matches('.header-link-href')) row.dataset.href = event.target.value;
    });

    q('#header-links-editor')?.addEventListener('click', (event) => {
      const row = event.target.closest('.header-link-row');
      if (!row) return;
      if (event.target.closest('.header-row-delete')) {
        row.remove();
        renumberRows();
        return;
      }
      if (event.target.closest('.header-row-up') && row.previousElementSibling) {
        row.parentNode.insertBefore(row, row.previousElementSibling);
        renumberRows();
        return;
      }
      if (event.target.closest('.header-row-down') && row.nextElementSibling) {
        row.parentNode.insertBefore(row.nextElementSibling, row);
        renumberRows();
      }
    });

    q('#header-create-page')?.addEventListener('click', openCreatePage);
    q('#header-page-create-close')?.addEventListener('click', closeCreatePage);
    q('#header-page-create-cancel')?.addEventListener('click', closeCreatePage);
    q('#header-page-create-confirm')?.addEventListener('click', createManagedPage);
    q('#header-page-title')?.addEventListener('input', (event) => {
      const id = q('#header-page-id');
      if (id && !id.dataset.touched) id.value = slugify(event.target.value);
    });
    q('#header-page-id')?.addEventListener('input', (event) => {
      event.target.dataset.touched = event.target.value ? '1' : '';
      event.target.value = slugify(event.target.value);
    });

    q('#header-pages-list')?.addEventListener('click', (event) => {
      const button = event.target.closest('.header-page-delete');
      const row = button?.closest('.header-page-row-managed');
      if (button && row) deleteManagedPage(row.dataset.pageId);
    });

    q('#header-editor-overlay')?.addEventListener('click', (event) => {
      if (event.target === q('#header-editor-overlay')) closeEditor();
    });
    q('#header-page-create-overlay')?.addEventListener('click', (event) => {
      if (event.target === q('#header-page-create-overlay')) closeCreatePage();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (q('#header-page-create-overlay')?.classList.contains('open')) {
        event.preventDefault();
        closeCreatePage();
        return;
      }
      if (q('#header-editor-overlay')?.classList.contains('open')) {
        event.preventDefault();
        closeEditor();
      }
    });

    q('#bibika-refresh')?.addEventListener('click', () => {
      setTimeout(() => loadHeaderFromGitHub(), 100);
    });

    loadHeaderFromGitHub();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
