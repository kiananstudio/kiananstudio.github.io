(() => {
  const API_URL = '/api/catalog';
  const params = new URLSearchParams(location.search);
  const categoryId = String(params.get('category') || 'unity-tools').trim();

  let catalog = null;
  let category = null;
  let workingProducts = [];
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

  async function fetchCatalog() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setState(message, state = '') {
    const node = q('#category-page-editor-state');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function productMeta(product) {
    return [product.version ? `v${product.version}` : '', product.status || ''].filter(Boolean).join(' · ') || product.id;
  }

  function renderProductRows() {
    const host = q('#category-page-products-list');
    const empty = q('#category-page-products-empty');
    const count = q('#category-page-products-count');
    if (!host) return;
    host.innerHTML = '';
    if (count) count.textContent = `${workingProducts.length}`;

    workingProducts.forEach((product, index) => {
      const row = document.createElement('div');
      row.className = 'category-page-product-row';
      row.dataset.productId = product.id;
      row.innerHTML = `
        <div class="category-page-product-copy"><strong></strong><span></span></div>
        <div class="category-page-product-actions">
          <button type="button" class="category-page-product-action category-page-product-up" title="Переместить выше">↑</button>
          <button type="button" class="category-page-product-action category-page-product-down" title="Переместить ниже">↓</button>
        </div>
        <a class="category-page-product-open" href="product.html?id=${encodeURIComponent(product.id)}">Открыть продукт</a>`;
      q('strong', row).textContent = product.title || product.id;
      q('.category-page-product-copy span', row).textContent = productMeta(product);
      q('.category-page-product-up', row).disabled = index === 0;
      q('.category-page-product-down', row).disabled = index === workingProducts.length - 1;
      host.appendChild(row);
    });

    if (empty) empty.hidden = workingProducts.length > 0;
  }

  function ensureModal() {
    if (q('#category-page-editor-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'category-page-editor-overlay';
    overlay.className = 'category-page-editor-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="category-page-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="category-page-editor-title">
        <div class="category-page-editor-head">
          <div>
            <span class="category-page-editor-eyebrow">Редактирование блока</span>
            <h2 id="category-page-editor-title">Category</h2>
            <p>Настраивай описание страницы и порядок продуктов внутри этой категории.</p>
          </div>
          <button type="button" class="category-page-editor-close" id="category-page-editor-close" aria-label="Закрыть">×</button>
        </div>
        <div class="category-page-editor-body">
          <section class="category-page-editor-section">
            <label class="category-page-editor-field">
              <span>Название категории</span>
              <input id="category-page-title-input" type="text" disabled>
            </label>
            <label class="category-page-editor-field" style="margin-top:12px">
              <span>Описание</span>
              <textarea id="category-page-description-input" rows="5" maxlength="500"></textarea>
            </label>
          </section>
          <section class="category-page-editor-section">
            <div class="category-page-products-head">
              <div><strong>Продукты на странице</strong><span>Стрелками можно изменить их порядок. Сам продукт редактируется на его странице.</span></div>
              <span>Всего: <b id="category-page-products-count">0</b></span>
            </div>
            <div class="category-page-products-list" id="category-page-products-list"></div>
            <div class="category-page-products-empty" id="category-page-products-empty">В этой категории пока нет продуктов.</div>
          </section>
        </div>
        <div class="category-page-editor-footer">
          <span class="category-page-editor-state" id="category-page-editor-state"></span>
          <div class="category-page-editor-actions">
            <button type="button" class="button button-secondary" id="category-page-editor-cancel">Отмена</button>
            <button type="button" class="button button-primary" id="category-page-editor-save">Сохранить</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);
  }

  async function load({ announce = false } = {}) {
    try {
      catalog = await fetchCatalog();
      category = (catalog.categories || []).find(item => item.id === categoryId) || null;
      workingProducts = clone((catalog.products || []).filter(item => item.category === categoryId));
      if (announce) showToast('Страница категории обновлена из GitHub.');
    } catch (error) {
      showToast(`Не удалось загрузить категорию: ${error.message}`, 4500);
    }
  }

  async function openEditor() {
    if (saving) return;
    await load();
    if (!category) {
      showToast('Категория не найдена.', 3500);
      return;
    }
    q('#category-page-editor-title').textContent = category.title || 'Category';
    q('#category-page-title-input').value = category.title || '';
    q('#category-page-description-input').value = category.description || '';
    renderProductRows();
    setState('Изменения будут опубликованы на kiananstudio.com после сохранения.');
    const overlay = q('#category-page-editor-overlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeEditor() {
    if (saving) return;
    const overlay = q('#category-page-editor-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function moveProduct(id, direction) {
    const index = workingProducts.findIndex(item => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= workingProducts.length) return;
    [workingProducts[index], workingProducts[target]] = [workingProducts[target], workingProducts[index]];
    renderProductRows();
  }

  function reorderLatestProducts(latestProducts) {
    const preferredIds = workingProducts.map(item => item.id);
    const latestCategoryProducts = latestProducts.filter(item => item.category === categoryId);
    const byId = new Map(latestCategoryProducts.map(item => [item.id, item]));
    const ordered = [];
    preferredIds.forEach(id => {
      const item = byId.get(id);
      if (!item) return;
      ordered.push(item);
      byId.delete(id);
    });
    latestCategoryProducts.forEach(item => {
      if (byId.has(item.id)) {
        ordered.push(item);
        byId.delete(item.id);
      }
    });

    let cursor = 0;
    return latestProducts.map(item => item.category === categoryId ? ordered[cursor++] : item);
  }

  async function save() {
    if (saving || !category) return;
    saving = true;
    const saveButton = q('#category-page-editor-save');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Сохранение…';
    }
    setState('Публикую страницу категории в GitHub…', 'busy');

    try {
      const latest = await fetchCatalog();
      const latestCategory = (latest.categories || []).find(item => item.id === categoryId);
      if (!latestCategory) throw new Error('Категория больше не существует.');
      latestCategory.description = q('#category-page-description-input')?.value.trim() || '';
      latest.products = reorderLatestProducts(Array.isArray(latest.products) ? latest.products : []);

      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: latest, message: `Bibika: update category page ${categoryId}` })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      const visibleDescription = q('#category-description');
      if (visibleDescription) visibleDescription.textContent = latestCategory.description;
      setState('Страница категории сохранена и опубликована.', 'ok');
      showToast('Страница категории сохранена в GitHub.');
      setTimeout(() => {
        saving = false;
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = 'Сохранить';
        }
        closeEditor();
        location.reload();
      }, 650);
      return;
    } catch (error) {
      setState(`Не удалось сохранить страницу: ${error.message}`, 'error');
      showToast(`Ошибка сохранения: ${error.message}`, 4500);
    }

    saving = false;
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Сохранить';
    }
  }

  function bind() {
    ensureModal();
    q('#edit-category-page')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openEditor();
    });
    q('#category-page-editor-close')?.addEventListener('click', closeEditor);
    q('#category-page-editor-cancel')?.addEventListener('click', closeEditor);
    q('#category-page-editor-save')?.addEventListener('click', save);
    q('#category-page-products-list')?.addEventListener('click', event => {
      const row = event.target.closest('.category-page-product-row');
      if (!row) return;
      if (event.target.closest('.category-page-product-up')) {
        event.preventDefault();
        moveProduct(row.dataset.productId, -1);
      } else if (event.target.closest('.category-page-product-down')) {
        event.preventDefault();
        moveProduct(row.dataset.productId, 1);
      }
    });
    q('#category-page-editor-overlay')?.addEventListener('click', event => {
      if (event.target === q('#category-page-editor-overlay')) closeEditor();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && q('#category-page-editor-overlay')?.classList.contains('open')) {
        event.preventDefault();
        closeEditor();
      }
    });
    q('#bibika-refresh')?.addEventListener('click', () => setTimeout(() => load({ announce: true }), 100));
    load();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();