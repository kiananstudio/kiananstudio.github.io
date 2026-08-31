(() => {
  const API_URL = '/api/catalog';
  const params = new URLSearchParams(location.search);
  const productId = String(params.get('id') || '').trim();

  let currentCatalog = null;
  let currentProduct = null;
  let saving = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function showToast(message, duration = 4200) {
    const node = q('#toast') || q('#bibika-toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => node.classList.remove('show'), duration);
  }

  function ensureUi() {
    if (q('#editor-modal')) return;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'edit-product';
    trigger.className = 'product-edit-trigger';
    trigger.setAttribute('aria-label', 'Редактировать продукт');
    trigger.title = 'Редактировать продукт';
    trigger.innerHTML = '<span class="mirrored-pencil" aria-hidden="true">✎</span>';
    q('.product-page')?.appendChild(trigger);

    const backdrop = document.createElement('div');
    backdrop.id = 'editor-modal';
    backdrop.className = 'modal-backdrop product-editor-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = `
      <section class="modal product-editor-modal" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
        <div class="modal-head product-editor-head">
          <div>
            <p class="eyebrow">Продукт</p>
            <h2 id="product-editor-title">Редактирование продукта</h2>
          </div>
          <button type="button" class="icon-btn" id="close-editor" aria-label="Закрыть">×</button>
        </div>

        <div class="product-editor-body">
          <div class="product-editor-grid product-editor-grid-3">
            <label class="field"><span>ID / slug</span><input id="f-id" type="text" readonly></label>
            <label class="field"><span>Категория</span><select id="f-category"></select></label>
            <label class="field"><span>Версия</span><input id="f-version" type="text" maxlength="40" autocomplete="off" placeholder="Например, 1.0.0"></label>
          </div>

          <div class="product-editor-grid product-editor-grid-2">
            <label class="field"><span>Название</span><input id="f-title" type="text" maxlength="120" autocomplete="off"></label>
            <label class="field"><span>Статус</span><input id="f-status" type="text" maxlength="80" autocomplete="off" placeholder="Например, Unity Asset Store"></label>
          </div>

          <label class="field"><span>Краткое описание</span><textarea id="f-short-description" rows="3" maxlength="360"></textarea></label>
          <label class="field"><span>Полное описание</span><textarea id="f-description" rows="6" maxlength="4000"></textarea></label>

          <section class="product-editor-section">
            <div class="section-line">
              <div><strong>Обложка</strong><small>1200 × 900 · WEBP после подготовки</small></div>
            </div>
            <label class="field"><span>Путь к изображению</span><input id="f-cover" type="text" autocomplete="off" placeholder="assets/images/example.webp"><small>Можно указать путь вручную или загрузить изображение.</small></label>
          </section>

          <section class="product-editor-section">
            <div class="section-line">
              <div><strong>Галерея</strong><small>Изображения можно загружать, удалять и менять местами.</small></div>
              <button type="button" class="btn btn-small btn-secondary" id="add-gallery">+ Указать путь</button>
            </div>
            <div id="gallery-editor" class="repeat-list"></div>
          </section>

          <section class="product-editor-section">
            <div class="section-line">
              <div><strong>Особенности</strong><small>Каждый пункт выводится отдельной строкой.</small></div>
              <button type="button" class="btn btn-small btn-secondary" id="add-feature">+ Добавить пункт</button>
            </div>
            <div id="features-editor" class="repeat-list"></div>
          </section>

          <section class="product-editor-section">
            <div class="section-line">
              <div><strong>Характеристики</strong><small>Пара «название — значение».</small></div>
              <button type="button" class="btn btn-small btn-secondary" id="add-spec">+ Добавить характеристику</button>
            </div>
            <div id="specs-editor" class="repeat-list"></div>
          </section>

          <section class="product-editor-section">
            <div class="section-line"><div><strong>Основная кнопка продукта</strong><small>Например, ссылка на Unity Asset Store.</small></div></div>
            <div class="product-editor-grid product-editor-grid-2">
              <label class="field"><span>Текст кнопки</span><input id="f-primary-label" type="text" maxlength="100" autocomplete="off"></label>
              <label class="field"><span>Ссылка</span><input id="f-primary-url" type="url" maxlength="500" autocomplete="off" placeholder="https://..."></label>
            </div>
          </section>

          <p class="product-editor-state" id="product-editor-state"></p>
        </div>

        <footer class="modal-actions product-editor-actions">
          <button type="button" class="btn btn-danger" id="delete-product">Удалить продукт</button>
          <button type="button" class="btn btn-ghost" id="cancel-editor">Отмена</button>
          <button type="button" class="btn btn-primary" id="save-editor">Сохранить изменения</button>
        </footer>
      </section>`;
    document.body.appendChild(backdrop);

    if (!q('#toast')) {
      const toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'bibika-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
  }

  function addSimpleRow(host, value = '') {
    const row = document.createElement('div');
    row.className = 'repeat-item product-editor-repeat-row';
    const input = document.createElement('input');
    input.className = 'repeat-value';
    input.type = 'text';
    input.value = String(value || '');
    input.autocomplete = 'off';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-row';
    remove.textContent = '×';
    remove.title = 'Удалить пункт';
    row.append(input, remove);
    host.appendChild(row);
    return row;
  }

  function addGalleryRow(value = '') {
    const row = addSimpleRow(q('#gallery-editor'), value);
    q('.repeat-value', row).placeholder = 'assets/images/example.webp';
    return row;
  }

  function addFeatureRow(value = '') {
    const row = addSimpleRow(q('#features-editor'), value);
    q('.repeat-value', row).placeholder = 'Особенность продукта';
    return row;
  }

  function addSpecRow(name = '', value = '') {
    const row = document.createElement('div');
    row.className = 'product-editor-spec-row';
    const nameInput = document.createElement('input');
    nameInput.className = 'spec-name';
    nameInput.type = 'text';
    nameInput.value = String(name || '');
    nameInput.placeholder = 'Название';
    nameInput.autocomplete = 'off';
    const valueInput = document.createElement('input');
    valueInput.className = 'spec-value';
    valueInput.type = 'text';
    valueInput.value = String(value || '');
    valueInput.placeholder = 'Значение';
    valueInput.autocomplete = 'off';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-spec';
    remove.textContent = '×';
    remove.title = 'Удалить характеристику';
    row.append(nameInput, valueInput, remove);
    q('#specs-editor').appendChild(row);
    return row;
  }

  function safeExternalUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
      return null;
    }
  }

  async function fetchCatalog() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function fillCategories(data, selected) {
    const select = q('#f-category');
    select.replaceChildren();
    (Array.isArray(data?.categories) ? data.categories : []).forEach(category => {
      const option = document.createElement('option');
      option.value = String(category?.id || '');
      option.textContent = String(category?.title || category?.id || '');
      if (option.value === selected) option.selected = true;
      select.appendChild(option);
    });
  }

  function fillEditor(product, data) {
    q('#f-id').value = String(product.id || '');
    q('#f-title').value = String(product.title || '');
    q('#f-status').value = String(product.status || '');
    q('#f-version').value = String(product.version || '');
    q('#f-short-description').value = String(product.shortDescription || '');
    q('#f-description').value = String(product.description || '');
    q('#f-cover').value = String(product.cover || '');
    q('#f-primary-label').value = String(product.links?.primaryLabel || '');
    q('#f-primary-url').value = String(product.links?.primaryUrl || '');
    fillCategories(data, String(product.category || ''));

    const gallery = q('#gallery-editor');
    gallery.replaceChildren();
    (Array.isArray(product.gallery) ? product.gallery : []).forEach(addGalleryRow);

    const features = q('#features-editor');
    features.replaceChildren();
    (Array.isArray(product.features) ? product.features : []).forEach(addFeatureRow);

    const specs = q('#specs-editor');
    specs.replaceChildren();
    (Array.isArray(product.specs) ? product.specs : []).forEach(pair => {
      if (Array.isArray(pair)) addSpecRow(pair[0], pair[1]);
    });

    q('#product-editor-title').textContent = `Редактирование — ${product.title || product.id}`;
    q('#product-editor-state').textContent = '';
  }

  function openModal() {
    const modal = q('#editor-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (saving) return;
    const modal = q('#editor-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!q('#image-modal')?.classList.contains('open')) document.body.style.overflow = '';
  }

  async function openEditor() {
    if (!productId) {
      showToast('Не удалось определить ID продукта.');
      return;
    }
    const trigger = q('#edit-product');
    trigger.disabled = true;
    try {
      const data = await fetchCatalog();
      const product = (Array.isArray(data.products) ? data.products : []).find(item => String(item?.id || '') === productId);
      if (!product) throw new Error('Продукт не найден в каталоге.');
      currentCatalog = data;
      currentProduct = product;
      fillEditor(product, data);
      openModal();
    } catch (error) {
      showToast(`Не удалось открыть редактор: ${error.message}`, 5200);
    } finally {
      trigger.disabled = false;
    }
  }

  function collectSimpleValues(selector) {
    return qa(`${selector} .repeat-value`)
      .map(input => String(input.value || '').trim())
      .filter(Boolean);
  }

  function collectSpecs() {
    return qa('#specs-editor .product-editor-spec-row').map(row => {
      const name = String(q('.spec-name', row)?.value || '').trim();
      const value = String(q('.spec-value', row)?.value || '').trim();
      return [name, value];
    }).filter(pair => pair[0] && pair[1]);
  }

  function collectProduct(base) {
    const title = String(q('#f-title').value || '').trim();
    const category = String(q('#f-category').value || '').trim();
    const primaryUrlRaw = String(q('#f-primary-url').value || '').trim();
    const primaryUrl = safeExternalUrl(primaryUrlRaw);

    if (!title) throw new Error('Название продукта не может быть пустым.');
    if (!category) throw new Error('Выбери категорию продукта.');
    if (primaryUrlRaw && primaryUrl === null) throw new Error('Основная ссылка должна начинаться с http:// или https://.');

    return {
      ...base,
      category,
      title,
      status: String(q('#f-status').value || '').trim(),
      version: String(q('#f-version').value || '').trim(),
      shortDescription: String(q('#f-short-description').value || '').trim(),
      description: String(q('#f-description').value || '').trim(),
      cover: String(q('#f-cover').value || '').trim(),
      gallery: collectSimpleValues('#gallery-editor'),
      features: collectSimpleValues('#features-editor'),
      specs: collectSpecs(),
      links: {
        ...(base.links || {}),
        primaryLabel: String(q('#f-primary-label').value || '').trim(),
        primaryUrl: primaryUrl || ''
      }
    };
  }

  async function saveEditor() {
    if (saving || !currentProduct) return;
    const save = q('#save-editor');
    const cancel = q('#cancel-editor');
    const close = q('#close-editor');
    const state = q('#product-editor-state');

    saving = true;
    save.disabled = true;
    cancel.disabled = true;
    close.disabled = true;
    save.textContent = 'Сохранение…';
    state.textContent = 'Загружаю актуальный каталог и сохраняю изменения…';

    try {
      const latest = await fetchCatalog();
      const index = (Array.isArray(latest.products) ? latest.products : []).findIndex(item => String(item?.id || '') === productId);
      if (index < 0) throw new Error('Продукт больше не найден в каталоге.');

      const updated = collectProduct(latest.products[index]);
      latest.products[index] = updated;

      const response = await fetch(API_URL, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: latest,
          message: `Bibika: update product ${productId}`
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      currentCatalog = latest;
      currentProduct = updated;
      state.textContent = 'Изменения сохранены.';
      showToast('Продукт сохранён в GitHub.');
      saving = false;
      closeModal();
      setTimeout(() => {
        const url = new URL(location.href);
        url.searchParams.set('t', String(Date.now()));
        location.replace(url.href);
      }, 700);
    } catch (error) {
      state.textContent = `Ошибка: ${error.message}`;
      showToast(`Не удалось сохранить продукт: ${error.message}`, 6200);
    } finally {
      saving = false;
      save.disabled = false;
      cancel.disabled = false;
      close.disabled = false;
      save.textContent = 'Сохранить изменения';
    }
  }

  async function deleteProduct() {
    if (saving || !currentProduct) return;
    const name = String(currentProduct.title || currentProduct.id || 'этот продукт');
    if (!confirm(`Удалить продукт «${name}»? Продукт исчезнет с сайта. Это действие нельзя отменить.`)) return;

    const save = q('#save-editor');
    const cancel = q('#cancel-editor');
    const close = q('#close-editor');
    const remove = q('#delete-product');
    const state = q('#product-editor-state');
    saving = true;
    [save, cancel, close, remove].forEach(button => { if (button) button.disabled = true; });
    if (remove) remove.textContent = 'Удаление…';
    if (state) state.textContent = 'Удаляю продукт из каталога…';

    try {
      const latest = await fetchCatalog();
      const index = (Array.isArray(latest.products) ? latest.products : []).findIndex(item => String(item?.id || '') === productId);
      if (index < 0) throw new Error('Продукт уже отсутствует в каталоге.');
      const category = String(latest.products[index]?.category || currentProduct.category || 'unity-tools');
      latest.products.splice(index, 1);

      const response = await fetch(API_URL, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: latest, message: `Bibika: delete product ${productId}` })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      showToast('Продукт удалён из каталога.');
      location.href = `category.html?category=${encodeURIComponent(category)}&t=${Date.now()}`;
      return;
    } catch (error) {
      if (state) state.textContent = `Ошибка: ${error.message}`;
      showToast(`Не удалось удалить продукт: ${error.message}`, 6200);
    } finally {
      saving = false;
      [save, cancel, close, remove].forEach(button => { if (button) button.disabled = false; });
      if (remove) remove.textContent = 'Удалить продукт';
    }
  }

  function removeRow(target) {
    target.closest('.repeat-item, .product-editor-spec-row')?.remove();
  }

  function bind() {
    q('#edit-product')?.addEventListener('click', openEditor);
    q('#save-editor')?.addEventListener('click', saveEditor);
    q('#delete-product')?.addEventListener('click', deleteProduct);
    q('#cancel-editor')?.addEventListener('click', closeModal);
    q('#close-editor')?.addEventListener('click', closeModal);
    q('#editor-modal')?.addEventListener('click', event => {
      if (event.target === q('#editor-modal')) closeModal();
    });

    q('#add-gallery')?.addEventListener('click', () => addGalleryRow());
    q('#add-feature')?.addEventListener('click', () => addFeatureRow());
    q('#add-spec')?.addEventListener('click', () => addSpecRow());

    q('#editor-modal')?.addEventListener('click', event => {
      if (event.target.closest('.remove-row, .remove-spec')) removeRow(event.target);
    });

    q('#bibika-refresh')?.addEventListener('click', () => location.reload());

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!q('#editor-modal')?.classList.contains('open')) return;
      if (q('#image-modal')?.classList.contains('open')) return;
      event.preventDefault();
      closeModal();
    });
  }

  ensureUi();
  bind();
})();
