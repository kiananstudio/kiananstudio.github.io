(() => {
  const API_URL = '/api/catalog';
  const DEFAULT_LINKS = [
    { label: 'Unity Tools', href: 'category.html?category=unity-tools' },
    { label: 'Games', href: 'category.html?category=games' },
    { label: '3D Assets', href: 'category.html?category=3d-assets' },
    { label: 'About', href: 'about.html' },
    { label: 'Contact', href: 'contact.html' }
  ];

  let workingLinks = [];
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

  function createRow(item = { label: '', href: '' }) {
    const row = document.createElement('div');
    row.className = 'header-link-row';
    row.innerHTML = `
      <div class="header-link-row-number"></div>
      <label class="header-editor-field">
        <span>Название кнопки</span>
        <input class="header-link-label" type="text" autocomplete="off" placeholder="Например, Games">
      </label>
      <label class="header-editor-field header-editor-field-url">
        <span>Куда ведёт</span>
        <input class="header-link-href" type="text" autocomplete="off" placeholder="Например, category.html?category=games">
      </label>
      <div class="header-link-actions">
        <button type="button" class="header-row-button header-row-up" title="Переместить выше">↑</button>
        <button type="button" class="header-row-button header-row-down" title="Переместить ниже">↓</button>
        <button type="button" class="header-row-button header-row-delete" title="Удалить">Удалить</button>
      </div>`;
    q('.header-link-label', row).value = item.label || '';
    q('.header-link-href', row).value = item.href || '';
    return row;
  }

  function renumberRows() {
    qa('.header-link-row', q('#header-links-editor')).forEach((row, index) => {
      q('.header-link-row-number', row).textContent = `Кнопка ${index + 1}`;
      q('.header-row-up', row).disabled = index === 0;
      q('.header-row-down', row).disabled = index === qa('.header-link-row', q('#header-links-editor')).length - 1;
    });
  }

  function renderRows(links) {
    const editor = q('#header-links-editor');
    if (!editor) return;
    editor.innerHTML = '';
    links.forEach((item) => editor.appendChild(createRow(item)));
    renumberRows();
  }

  function collectRows() {
    return qa('.header-link-row', q('#header-links-editor')).map((row) => ({
      label: q('.header-link-label', row).value.trim(),
      href: q('.header-link-href', row).value.trim()
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
      const catalog = await fetchCatalog();
      const links = normalizeLinks(catalog?.siteHeader?.links);
      workingLinks = links.map((item) => ({ ...item }));
      renderBibikaHeader(workingLinks);
      if (updateRows) renderRows(workingLinks);
      return links;
    } catch (error) {
      showToast(`Не удалось загрузить Header: ${error.message}`, 4500);
      return null;
    }
  }

  function openEditor() {
    if (saving) return;
    const overlay = q('#header-editor-overlay');
    if (!overlay) return;
    renderRows(workingLinks.length ? workingLinks : DEFAULT_LINKS);
    q('#header-editor-state').textContent = 'Изменения будут опубликованы на kiananstudio.com после сохранения.';
    q('#header-editor-state').dataset.state = '';
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('header-editor-open');
  }

  function closeEditor() {
    if (saving) return;
    const overlay = q('#header-editor-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('header-editor-open');
  }

  function setState(message, state = '') {
    const node = q('#header-editor-state');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
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
    setState('Публикую Header в GitHub…', 'busy');

    try {
      const catalog = await fetchCatalog();
      catalog.siteHeader = { links };
      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: catalog,
          message: 'Bibika: update site Header navigation'
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      workingLinks = links.map((item) => ({ ...item }));
      renderBibikaHeader(workingLinks);
      setState('Header сохранён и опубликован.', 'ok');
      showToast('Header сохранён в GitHub.');
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
    const overlay = document.createElement('div');
    overlay.id = 'header-editor-overlay';
    overlay.className = 'header-editor-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="header-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="header-editor-title">
        <div class="header-editor-head">
          <div>
            <span class="header-editor-eyebrow">Редактирование блока</span>
            <h2 id="header-editor-title">Header</h2>
            <p>Меняй названия кнопок и ссылки, добавляй новые, удаляй ненужные и переставляй их местами.</p>
          </div>
          <button type="button" class="header-editor-close" id="header-editor-close" aria-label="Закрыть">×</button>
        </div>
        <div class="header-editor-body">
          <div id="header-links-editor" class="header-links-editor"></div>
          <button type="button" class="header-add-link" id="header-add-link">+ Добавить кнопку</button>
        </div>
        <div class="header-editor-footer">
          <span id="header-editor-state" class="header-editor-state">Изменения будут опубликованы на kiananstudio.com после сохранения.</span>
          <div class="header-editor-footer-actions">
            <button type="button" class="button button-secondary" id="header-editor-cancel">Отмена</button>
            <button type="button" class="button button-primary" id="header-editor-save">Сохранить</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);
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
      q('#header-links-editor')?.appendChild(createRow());
      renumberRows();
      q('#header-links-editor .header-link-row:last-child .header-link-label')?.focus();
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

    q('#header-editor-overlay')?.addEventListener('click', (event) => {
      if (event.target === q('#header-editor-overlay')) closeEditor();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && q('#header-editor-overlay')?.classList.contains('open')) {
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
