(() => {
  const API_URL = '/api/catalog';
  const DEFAULT_ICONS = {
    'unity-tools': '◇',
    games: '🎮',
    '3d-assets': '⬡'
  };
  const ICON_OPTIONS = [
    '◇', '◆', '⬡', '⬢', '◈', '◉', '◎', '✦', '✧', '★',
    '⚙️', '🛠️', '🔧', '🧰', '🎮', '🕹️', '🎲', '🧊', '📦', '🧱',
    '🧩', '🖥️', '💻', '📱', '🌐', '🚀', '✨', '🧪', '🔬', '🎨',
    '🧭', '🗂️', '📐', '🧰', '🔷', '🔹'
  ];

  let workingCategories = [];
  let saving = false;
  let activeIconRow = null;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const hasOwn = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);

  function showToast(message, duration = 3200) {
    const toast = q('#bibika-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function normalizeCategories(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const id = String(item?.id || '').trim();
      const icon = hasOwn(item, 'icon')
        ? String(item.icon ?? '').trim()
        : (DEFAULT_ICONS[id] || '◆');
      return {
        ...item,
        id,
        title: String(item?.title || '').trim(),
        description: String(item?.description || '').trim(),
        icon
      };
    }).filter((item) => item.id && item.title);
  }

  function publicHref(id) {
    return `https://kiananstudio.com/category.html?category=${encodeURIComponent(id)}`;
  }

  function renderBibikaCategories(categories) {
    const grid = q('.home-category-grid');
    if (!grid) return;
    grid.innerHTML = '';
    categories.forEach((category) => {
      const wrap = document.createElement('div');
      wrap.className = 'admin-category-wrap';
      wrap.dataset.categoryId = category.id;
      const link = document.createElement('a');
      link.className = 'category-card category-link';
      link.href = publicHref(category.id);
      link.target = '_blank';
      link.rel = 'noreferrer';

      const icon = document.createElement('span');
      icon.className = 'category-icon';
      icon.textContent = category.icon;

      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.dataset.categoryTitle = '';
      title.textContent = category.title;
      const description = document.createElement('small');
      description.dataset.categoryDescription = '';
      description.textContent = category.description;
      copy.append(title, description);

      const arrow = document.createElement('span');
      arrow.className = 'catalog-arrow';
      arrow.textContent = '→';
      link.append(icon, copy, arrow);
      wrap.appendChild(link);
      grid.appendChild(wrap);
    });
  }

  async function fetchCatalog() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadCategoriesFromGitHub({ updateRows = false } = {}) {
    try {
      const catalog = await fetchCatalog();
      workingCategories = normalizeCategories(catalog.categories);
      renderBibikaCategories(workingCategories);
      if (updateRows) renderRows(workingCategories);
    } catch (error) {
      showToast(`Не удалось загрузить Category: ${error.message}`, 4500);
    }
  }

  function updateRowIconPreview(row) {
    if (!row) return;
    const value = q('.category-row-icon', row)?.value || '';
    const preview = q('.category-icon-preview', row);
    if (!preview) return;
    preview.textContent = value || '—';
    preview.classList.toggle('empty', !value);
  }

  function createRow(category) {
    const row = document.createElement('div');
    row.className = 'category-editor-row';
    row.dataset.categoryId = category.id;
    row.innerHTML = `
      <div class="category-row-number"></div>
      <div class="category-row-title">
        <span>Категория</span>
        <strong></strong>
      </div>
      <div class="category-editor-field category-icon-field">
        <span>Иконка</span>
        <input class="category-row-icon" type="hidden">
        <div class="category-icon-control">
          <span class="category-icon-preview" aria-hidden="true"></span>
          <button type="button" class="category-icon-button category-icon-pick" title="Выбрать иконку" aria-label="Выбрать иконку">▦</button>
          <button type="button" class="category-icon-button category-icon-clear" title="Очистить иконку" aria-label="Очистить иконку">×</button>
        </div>
      </div>
      <label class="category-editor-field category-description-field">
        <span>Краткое описание</span>
        <input class="category-row-description" type="text" autocomplete="off" maxlength="180" aria-label="Краткое описание категории">
      </label>
      <div class="category-row-actions">
        <button type="button" class="category-row-button category-row-up" title="Переместить выше">↑</button>
        <button type="button" class="category-row-button category-row-down" title="Переместить ниже">↓</button>
      </div>`;
    q('.category-row-title strong', row).textContent = category.title;
    q('.category-row-icon', row).value = category.icon;
    q('.category-row-description', row).value = category.description;
    updateRowIconPreview(row);
    return row;
  }

  function renderRows(categories) {
    const editor = q('#category-list-editor');
    if (!editor) return;
    editor.innerHTML = '';
    categories.forEach((category) => editor.appendChild(createRow(category)));
    renumberRows();
  }

  function renumberRows() {
    const rows = qa('.category-editor-row', q('#category-list-editor'));
    rows.forEach((row, index) => {
      q('.category-row-number', row).textContent = `${index + 1}`;
      q('.category-row-up', row).disabled = index === 0;
      q('.category-row-down', row).disabled = index === rows.length - 1;
    });
  }

  function collectRows() {
    const source = new Map(workingCategories.map((category) => [category.id, category]));
    return qa('.category-editor-row', q('#category-list-editor')).map((row) => {
      const original = source.get(row.dataset.categoryId) || {};
      return {
        ...original,
        icon: q('.category-row-icon', row).value.trim(),
        description: q('.category-row-description', row).value.trim()
      };
    });
  }

  function setState(message, state = '') {
    const node = q('#category-editor-state');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function openEditor() {
    if (saving) return;
    renderRows(workingCategories);
    setState('Изменения будут опубликованы на kiananstudio.com после сохранения.');
    const overlay = q('#category-editor-overlay');
    overlay?.classList.add('open');
    overlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('category-editor-open');
  }

  function closeEditor() {
    if (saving) return;
    closeIconPicker();
    const overlay = q('#category-editor-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('category-editor-open');
  }

  function openIconPicker(row) {
    if (!row || saving) return;
    activeIconRow = row;
    const current = q('.category-row-icon', row)?.value || '';
    qa('.category-icon-option', q('#category-icon-picker-grid')).forEach((button) => {
      button.classList.toggle('selected', button.dataset.icon === current);
    });
    const picker = q('#category-icon-picker-overlay');
    picker?.classList.add('open');
    picker?.setAttribute('aria-hidden', 'false');
  }

  function closeIconPicker() {
    activeIconRow = null;
    const picker = q('#category-icon-picker-overlay');
    picker?.classList.remove('open');
    picker?.setAttribute('aria-hidden', 'true');
  }

  function chooseIcon(icon) {
    if (!activeIconRow) return;
    const input = q('.category-row-icon', activeIconRow);
    if (input) input.value = icon;
    updateRowIconPreview(activeIconRow);
    closeIconPicker();
  }

  function clearIcon(row) {
    const input = q('.category-row-icon', row);
    if (input) input.value = '';
    updateRowIconPreview(row);
  }

  async function saveCategories() {
    if (saving) return;
    const categories = collectRows();
    if (!categories.length) {
      setState('Список категорий пуст.', 'error');
      return;
    }
    for (let index = 0; index < categories.length; index += 1) {
      if (!categories[index].description) {
        setState(`Заполни краткое описание категории «${categories[index].title}».`, 'error');
        return;
      }
    }

    saving = true;
    const saveButton = q('#category-editor-save');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Сохранение…';
    }
    setState('Публикую Category в GitHub…', 'busy');

    try {
      const catalog = await fetchCatalog();
      catalog.categories = categories;
      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: catalog, message: 'Bibika: update home categories' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      workingCategories = normalizeCategories(categories);
      renderBibikaCategories(workingCategories);
      setState('Category сохранён и опубликован.', 'ok');
      showToast('Category сохранён в GitHub.');
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
      setState(`Не удалось сохранить Category: ${error.message}`, 'error');
      showToast(`Ошибка сохранения Category: ${error.message}`, 4800);
    }

    saving = false;
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Сохранить';
    }
  }

  function ensureModal() {
    if (q('#category-editor-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'category-editor-overlay';
    overlay.className = 'category-editor-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="category-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="category-editor-title">
        <div class="category-editor-head">
          <div>
            <span class="category-editor-eyebrow">Редактирование блока</span>
            <h2 id="category-editor-title">Category</h2>
            <p>Меняй иконку и краткое описание категории. Стрелками можно изменить порядок категорий на странице.</p>
          </div>
          <button type="button" class="category-editor-close" id="category-editor-close" aria-label="Закрыть">×</button>
        </div>
        <div class="category-editor-body">
          <div id="category-list-editor" class="category-list-editor"></div>
        </div>
        <div class="category-editor-footer">
          <span id="category-editor-state" class="category-editor-state"></span>
          <div class="category-editor-footer-actions">
            <button type="button" class="button button-secondary" id="category-editor-cancel">Отмена</button>
            <button type="button" class="button button-primary" id="category-editor-save">Сохранить</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    const picker = document.createElement('div');
    picker.id = 'category-icon-picker-overlay';
    picker.className = 'category-icon-picker-overlay';
    picker.setAttribute('aria-hidden', 'true');
    picker.innerHTML = `
      <section class="category-icon-picker" role="dialog" aria-modal="true" aria-labelledby="category-icon-picker-title">
        <div class="category-icon-picker-head">
          <div>
            <span class="category-editor-eyebrow">Иконка категории</span>
            <h3 id="category-icon-picker-title">Выбери иконку</h3>
          </div>
          <button type="button" class="category-editor-close" id="category-icon-picker-close" aria-label="Закрыть">×</button>
        </div>
        <div class="category-icon-picker-grid" id="category-icon-picker-grid"></div>
      </section>`;
    document.body.appendChild(picker);

    const grid = q('#category-icon-picker-grid');
    ICON_OPTIONS.forEach((icon) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'category-icon-option';
      button.dataset.icon = icon;
      button.textContent = icon;
      button.title = `Использовать ${icon}`;
      button.setAttribute('aria-label', `Использовать иконку ${icon}`);
      grid.appendChild(button);
    });
  }

  function bind() {
    ensureModal();
    q('#edit-site-category')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditor();
    });
    q('#category-editor-close')?.addEventListener('click', closeEditor);
    q('#category-editor-cancel')?.addEventListener('click', closeEditor);
    q('#category-editor-save')?.addEventListener('click', saveCategories);

    q('#category-list-editor')?.addEventListener('click', (event) => {
      const row = event.target.closest('.category-editor-row');
      if (!row) return;
      if (event.target.closest('.category-icon-pick')) {
        openIconPicker(row);
        return;
      }
      if (event.target.closest('.category-icon-clear')) {
        clearIcon(row);
        return;
      }
      if (event.target.closest('.category-row-up') && row.previousElementSibling) {
        row.parentNode.insertBefore(row, row.previousElementSibling);
        renumberRows();
        return;
      }
      if (event.target.closest('.category-row-down') && row.nextElementSibling) {
        row.parentNode.insertBefore(row.nextElementSibling, row);
        renumberRows();
      }
    });

    q('#category-icon-picker-grid')?.addEventListener('click', (event) => {
      const button = event.target.closest('.category-icon-option');
      if (button) chooseIcon(button.dataset.icon || '');
    });
    q('#category-icon-picker-close')?.addEventListener('click', closeIconPicker);
    q('#category-icon-picker-overlay')?.addEventListener('click', (event) => {
      if (event.target === q('#category-icon-picker-overlay')) closeIconPicker();
    });

    q('#category-editor-overlay')?.addEventListener('click', (event) => {
      if (event.target === q('#category-editor-overlay')) closeEditor();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (q('#category-icon-picker-overlay')?.classList.contains('open')) {
        event.preventDefault();
        closeIconPicker();
        return;
      }
      if (q('#category-editor-overlay')?.classList.contains('open')) {
        event.preventDefault();
        closeEditor();
      }
    });
    q('#bibika-refresh')?.addEventListener('click', () => setTimeout(() => loadCategoriesFromGitHub(), 100));
    loadCategoriesFromGitHub();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
