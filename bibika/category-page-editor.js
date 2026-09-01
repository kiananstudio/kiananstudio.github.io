(() => {
  const API_URL = '/api/catalog';
  const IMAGE_API_URL = '/api/image';
  const IMAGE_CLEANUP_URL = '/api/image/cleanup';
  const PUBLIC_ORIGIN = 'https://kiananstudio.com';
  const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
  const ICON_SIZE = 512;
  const WEBP_QUALITY = 0.85;
  const ALLOWED_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
  const ALLOWED_EXTENSIONS = /\.(webp|png|jpe?g)$/i;
  const MANAGED_PRODUCT_CATEGORIES = new Set(['unity-tools', '3d-assets']);
  const params = new URLSearchParams(location.search);
  const categoryId = String(params.get('category') || 'unity-tools').trim();

  let catalog = null;
  let category = null;
  let workingProducts = [];
  let saving = false;
  let activeHrefInput = null;
  let pendingIconRow = null;
  const sessionUploads = new Set();
  const removedProductImages = new Set();

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

  async function cleanupPaths(paths) {
    const unique = [...new Set((paths || []).filter(Boolean))];
    if (!unique.length) return;
    try {
      await fetch(IMAGE_CLEANUP_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: unique })
      });
    } catch (error) {
      console.warn('Bibika icon cleanup failed', error);
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function slugify(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70);
  }

  function assetUrl(value) {
    const path = String(value || '').trim();
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${PUBLIC_ORIGIN}/${path.replace(/^\/+/, '')}`;
  }

  function isImageIcon(value) {
    const path = String(value || '').trim();
    return /^https?:\/\//i.test(path) || /^(?:assets\/|\/assets\/)/i.test(path) || /\.(webp|png|jpe?g)(?:[?#].*)?$/i.test(path);
  }

  function defaultProductHref(product) {
    const explicit = String(product?.href || '').trim();
    if (explicit) return explicit;
    const id = String(product?.id || '').trim();
    return id ? `product.html?id=${encodeURIComponent(id)}` : '';
  }

  function normalizeProduct(product, isNew = false) {
    const copy = clone(product || {});
    return {
      ...copy,
      id: String(copy.id || '').trim().toLowerCase(),
      category: categoryId,
      title: String(copy.title || '').trim(),
      icon: String(copy.icon || '').trim(),
      shortDescription: String(copy.shortDescription || '').trim(),
      href: defaultProductHref(copy),
      __new: !!isNew,
      __key: copy.__key || crypto.randomUUID()
    };
  }

  function setState(message, state = '') {
    const node = q('#category-page-editor-state');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function validateHref(value) {
    const href = String(value || '').trim();
    if (!href) return 'Укажи, куда ведёт продукт.';
    if (/^(javascript|data|vbscript):/i.test(href)) return 'Этот тип ссылки запрещён.';
    return '';
  }

  function productIdFromHref(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, `${PUBLIC_ORIGIN}/`);
      if (url.hostname !== 'kiananstudio.com' && url.hostname !== 'www.kiananstudio.com') return '';
      if (!/\/product\.html$/i.test(url.pathname)) return '';
      return slugify(url.searchParams.get('id') || '');
    } catch {
      return '';
    }
  }

  function setIconPreview(row, value) {
    const host = q('.category-page-product-icon-value', row);
    if (!host) return;
    host.replaceChildren();
    const icon = String(value || '').trim();
    if (!icon) {
      host.classList.add('empty');
      host.textContent = 'Нет';
      return;
    }
    host.classList.remove('empty');
    if (isImageIcon(icon)) {
      const img = document.createElement('img');
      img.src = assetUrl(icon);
      img.alt = '';
      img.loading = 'lazy';
      host.appendChild(img);
    } else {
      host.textContent = icon;
    }
  }

  function createProductRow(product, index) {
    const row = document.createElement('div');
    row.className = 'category-page-product-row category-page-product-row-fields';
    if (product.__new) row.classList.add('category-page-product-row-new');
    row.dataset.productKey = product.__key;
    row.dataset.icon = product.icon || '';
    row.innerHTML = `
      <div class="category-page-product-number">${index + 1}</div>
      <label class="category-page-editor-field">
        <span>Название</span>
        <input class="category-page-product-title" type="text" autocomplete="off" placeholder="Например, 3D Collider">
      </label>
      <div class="category-page-editor-field category-page-product-icon-field">
        <span>Иконка</span>
        <div class="category-page-product-icon-control">
          <span class="category-page-product-icon-value empty">Нет</span>
          <button type="button" class="category-page-product-icon-pick" title="Выбрать изображение на компьютере">Выбрать</button>
          <button type="button" class="category-page-product-icon-clear" title="Удалить иконку" aria-label="Удалить иконку">×</button>
        </div>
      </div>
      <label class="category-page-editor-field">
        <span>Краткое описание</span>
        <input class="category-page-product-description" type="text" autocomplete="off" maxlength="220" placeholder="Короткое описание продукта">
      </label>
      <label class="category-page-editor-field category-page-product-href-field">
        <span>Куда ведёт</span>
        <input class="category-page-product-href" type="text" autocomplete="off" placeholder="Например, product.html?id=3d-collider">
      </label>
      <div class="category-page-product-actions">
        <button type="button" class="category-page-product-action category-page-product-up" title="Переместить выше">↑</button>
        <button type="button" class="category-page-product-action category-page-product-down" title="Переместить ниже">↓</button>
        <button type="button" class="category-page-product-action category-page-product-remove" title="Удалить продукт">Удалить</button>
      </div>`;

    q('.category-page-product-title', row).value = product.title || '';
    q('.category-page-product-description', row).value = product.shortDescription || '';
    q('.category-page-product-href', row).value = product.href || '';
    setIconPreview(row, product.icon);
    q('.category-page-product-up', row).disabled = index === 0;
    q('.category-page-product-down', row).disabled = index === workingProducts.length - 1;
    return row;
  }

  function renderProductRows() {
    const host = q('#category-page-products-list');
    const empty = q('#category-page-products-empty');
    const count = q('#category-page-products-count');
    if (!host) return;
    host.innerHTML = '';
    if (count) count.textContent = `${workingProducts.length}`;
    workingProducts.forEach((product, index) => host.appendChild(createProductRow(product, index)));
    if (empty) empty.hidden = workingProducts.length > 0;
  }

  function syncWorkingFromRows() {
    const byKey = new Map(workingProducts.map(product => [product.__key, product]));
    const next = [];
    qa('.category-page-product-row-fields', q('#category-page-products-list')).forEach(row => {
      const product = byKey.get(row.dataset.productKey);
      if (!product) return;
      product.title = q('.category-page-product-title', row)?.value.trim() || '';
      product.icon = String(row.dataset.icon || '').trim();
      product.shortDescription = q('.category-page-product-description', row)?.value.trim() || '';
      product.href = q('.category-page-product-href', row)?.value.trim() || '';
      next.push(product);
    });
    workingProducts = next;
  }

  function sitePageItems(data) {
    const fixed = [
      { title: 'Home', href: './', badge: 'Существующая', current: false },
      { title: 'Unity Tools', href: 'category.html?category=unity-tools', badge: 'Существующая', current: categoryId === 'unity-tools' },
      { title: 'Games', href: 'category.html?category=games', badge: 'Существующая', current: categoryId === 'games' },
      { title: '3D Assets', href: 'category.html?category=3d-assets', badge: 'Существующая', current: categoryId === '3d-assets' },
      { title: 'About', href: 'about.html', badge: 'Существующая', current: false },
      { title: 'Contact', href: 'contact.html', badge: 'Существующая', current: false }
    ];
    const managed = (Array.isArray(data?.sitePages) ? data.sitePages : []).map(page => ({
      title: String(page?.title || page?.id || '').trim(),
      href: `page.html?page=${encodeURIComponent(String(page?.id || '').trim())}`,
      badge: page?.type === 'categories' ? 'Категории' : 'Текст',
      current: false
    })).filter(item => item.title && item.href);
    const products = (Array.isArray(data?.products) ? data.products : []).map(product => ({
      title: String(product?.title || product?.id || '').trim(),
      href: defaultProductHref(product),
      badge: 'Продукт',
      current: false
    })).filter(item => item.title && item.href);
    return [...fixed, ...managed, ...products];
  }

  function renderSitePages() {
    const list = q('#category-page-site-pages-list');
    if (!list || !catalog) return;
    list.replaceChildren();
    sitePageItems(catalog).forEach(item => {
      const link = document.createElement('a');
      link.className = 'category-page-site-page';
      if (item.current) link.classList.add('current');
      link.href = item.href;

      const main = document.createElement('span');
      main.className = 'category-page-site-page-main';
      const strong = document.createElement('strong');
      strong.textContent = item.title;
      const path = document.createElement('span');
      path.textContent = item.href;
      main.append(strong, path);

      const badge = document.createElement('span');
      badge.className = 'category-page-site-page-badge';
      badge.textContent = item.current ? 'Текущая' : item.badge;
      link.append(main, badge);
      list.appendChild(link);
    });
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
            <p>Настраивай описание страницы и продукты внутри этой категории.</p>
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
              <div><strong>Продукты на странице</strong><span>Для каждого продукта укажи название, иконку, краткое описание и страницу назначения.</span></div>
              <div class="category-page-products-head-actions">
                <span>Всего: <b id="category-page-products-count">0</b></span>
                <button type="button" class="category-page-add-product" id="category-page-add-product">+ Добавить продукт</button>
              </div>
            </div>
            <div class="category-page-products-list" id="category-page-products-list"></div>
            <div class="category-page-products-empty" id="category-page-products-empty">В этой категории пока нет продуктов. Нажми «+ Добавить продукт».</div>
          </section>

          <section class="category-page-editor-section category-page-site-pages-section">
            <div class="category-page-site-pages-head"><strong>Страницы сайта</strong><span>Здесь можно посмотреть готовые адреса страниц. В том числе страницы продуктов.</span></div>
            <div class="category-page-site-pages-list" id="category-page-site-pages-list"></div>
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

    const fileInput = document.createElement('input');
    fileInput.id = 'category-product-icon-file';
    fileInput.type = 'file';
    fileInput.accept = 'image/webp,image/png,image/jpeg,.webp,.png,.jpg,.jpeg';
    fileInput.hidden = true;
    document.body.appendChild(fileInput);
  }

  async function load({ announce = false } = {}) {
    try {
      catalog = await fetchCatalog();
      category = (catalog.categories || []).find(item => item.id === categoryId) || null;
      workingProducts = clone((catalog.products || []).filter(item => item.category === categoryId)).map(item => normalizeProduct(item, false));
      removedProductImages.clear();
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
    renderSitePages();
    setState('Изменения будут опубликованы на kiananstudio.com после сохранения.');
    const overlay = q('#category-page-editor-overlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function discardSessionUploads() {
    const paths = [...sessionUploads];
    sessionUploads.clear();
    if (paths.length) cleanupPaths(paths);
  }

  function closeEditor() {
    if (saving) return;
    pendingIconRow = null;
    discardSessionUploads();
    const overlay = q('#category-page-editor-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function addProduct() {
    syncWorkingFromRows();
    workingProducts.unshift(normalizeProduct({
      id: '', category: categoryId, title: '', icon: '', shortDescription: '', href: '', status: '', version: '',
      description: '', cover: '', gallery: [], features: [], specs: [], links: { primaryLabel: '', primaryUrl: '' }
    }, true));
    renderProductRows();
    const first = q('.category-page-product-row-fields:first-child');
    first?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    q('.category-page-product-title', first)?.focus();
  }

  function moveProduct(key, direction) {
    syncWorkingFromRows();
    const index = workingProducts.findIndex(item => item.__key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= workingProducts.length) return;
    [workingProducts[index], workingProducts[target]] = [workingProducts[target], workingProducts[index]];
    renderProductRows();
  }

  function productImagePaths(product) {
    return [
      String(product?.icon || '').trim(),
      String(product?.cover || '').trim(),
      ...(Array.isArray(product?.gallery) ? product.gallery.map(item => String(item || '').trim()) : [])
    ].filter(Boolean);
  }

  function removeProduct(key) {
    syncWorkingFromRows();
    const product = workingProducts.find(item => item.__key === key);
    if (!product) return;

    const name = String(product.title || product.id || 'этот продукт');
    if (!product.__new && !confirm(`Удалить продукт «${name}» из этой категории и с сайта? Удаление произойдёт после нажатия «Сохранить».`)) return;

    const images = productImagePaths(product);
    if (product.__new) {
      const temporary = images.filter(path => sessionUploads.has(path));
      temporary.forEach(path => sessionUploads.delete(path));
      if (temporary.length) cleanupPaths(temporary);
    } else {
      images.forEach(path => removedProductImages.add(path));
    }

    workingProducts = workingProducts.filter(item => item.__key !== key);
    renderProductRows();
    setState(product.__new
      ? 'Новый продукт убран из списка.'
      : `Продукт «${name}» будет удалён после нажатия «Сохранить».`);
  }

  function validateSourceFile(file) {
    if (!file) return 'Файл не выбран.';
    if (!ALLOWED_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.test(file.name)) {
      return 'Разрешены только WEBP, PNG, JPG и JPEG.';
    }
    if (file.size > MAX_SOURCE_BYTES) return 'Исходное изображение слишком большое. Максимум 20 МБ.';
    return '';
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось прочитать изображение.'));
      };
      image.src = url;
    });
  }

  async function prepareIconBlob(file) {
    const image = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
    const scale = Math.max(ICON_SIZE / image.naturalWidth, ICON_SIZE / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, (ICON_SIZE - width) / 2, (ICON_SIZE - height) / 2, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось конвертировать изображение в WEBP.')), 'image/webp', WEBP_QUALITY);
    });
  }

  function uploadSlugForRow(row) {
    const existing = workingProducts.find(item => item.__key === row.dataset.productKey);
    if (existing?.id) return existing.id;
    const hrefId = productIdFromHref(q('.category-page-product-href', row)?.value || '');
    if (hrefId) return hrefId;
    return slugify(q('.category-page-product-title', row)?.value || '') || `${categoryId}-product`;
  }

  async function uploadIconForRow(row, file) {
    const error = validateSourceFile(file);
    if (error) {
      showToast(error, 4500);
      return;
    }

    const button = q('.category-page-product-icon-pick', row);
    const previous = String(row.dataset.icon || '').trim();
    if (button) {
      button.disabled = true;
      button.textContent = 'Загрузка…';
    }
    setState('Подготавливаю и загружаю иконку…', 'busy');

    try {
      const blob = await prepareIconBlob(file);
      const response = await fetch(IMAGE_API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'image/webp',
          'X-Bibika-Product': uploadSlugForRow(row),
          'X-Bibika-Target': 'icon'
        },
        body: blob
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      const path = String(result.path || '').trim();
      if (!path) throw new Error('Сервер не вернул путь к иконке.');
      row.dataset.icon = path;
      setIconPreview(row, path);
      sessionUploads.add(path);

      if (previous && previous !== path && sessionUploads.has(previous)) {
        sessionUploads.delete(previous);
        cleanupPaths([previous]);
      }
      setState('Иконка загружена. Нажми «Сохранить», чтобы привязать её к продукту.');
    } catch (uploadError) {
      setState(`Не удалось загрузить иконку: ${uploadError.message}`, 'error');
      showToast(`Ошибка иконки: ${uploadError.message}`, 4500);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Выбрать';
      }
    }
  }

  function clearIcon(row) {
    const current = String(row.dataset.icon || '').trim();
    row.dataset.icon = '';
    setIconPreview(row, '');
    if (current && sessionUploads.has(current)) {
      sessionUploads.delete(current);
      cleanupPaths([current]);
    }
    setState('Иконка удалена из продукта. После сохранения файл также будет удалён с сервера.');
  }

  function buildProductForSave(product, latestById, usedIds) {
    const title = String(product.title || '').trim();
    let href = String(product.href || '').trim();
    const managedPage = MANAGED_PRODUCT_CATEGORIES.has(categoryId);
    if (!href && managedPage) href = '__managed_product__';
    const hrefError = managedPage ? '' : validateHref(href);
    if (!title) throw new Error('У каждого продукта должно быть заполнено название.');
    if (hrefError) throw new Error(`«${title}»: ${hrefError}`);

    if (!product.__new) {
      const latest = latestById.get(product.id) || clone(product);
      latest.title = title;
      latest.icon = String(product.icon || '').trim();
      latest.shortDescription = String(product.shortDescription || '').trim();
      latest.href = managedPage ? `page.html?page=${encodeURIComponent(latest.id)}` : href;
      latest.category = categoryId;
      usedIds.add(latest.id);
      return latest;
    }

    const hrefId = productIdFromHref(href);
    let id = hrefId || slugify(title);
    if (!id) throw new Error(`Не удалось определить ID для продукта «${title}».`);
    const base = id;
    let suffix = 2;
    while (usedIds.has(id) || latestById.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);

    return {
      id, category: categoryId, title,
      icon: String(product.icon || '').trim(), status: '', version: '',
      shortDescription: String(product.shortDescription || '').trim(), description: '',
      href: managedPage ? `page.html?page=${encodeURIComponent(id)}` : href,
      cover: '', gallery: [], features: [], specs: [], links: { primaryLabel: '', primaryUrl: '' }
    };
  }

  function mergeWorkingProducts(latestProducts) {
    const existingOutside = latestProducts.filter(item => item.category !== categoryId);
    const latestById = new Map(latestProducts.map(item => [item.id, item]));
    const usedIds = new Set(existingOutside.map(item => item.id));
    const orderedCategory = workingProducts.map(product => buildProductForSave(product, latestById, usedIds));
    return [...existingOutside, ...orderedCategory];
  }


  function syncManagedProductPages(data, beforeProducts) {
    if (!MANAGED_PRODUCT_CATEGORIES.has(categoryId)) return;
    const previousIds = new Set((beforeProducts || [])
      .filter(item => String(item?.category || '') === categoryId)
      .map(item => String(item?.id || '').trim().toLowerCase())
      .filter(Boolean));
    const products = (Array.isArray(data?.products) ? data.products : [])
      .filter(item => String(item?.category || '') === categoryId);
    const currentIds = new Set(products.map(item => String(item?.id || '').trim().toLowerCase()).filter(Boolean));
    let pages = Array.isArray(data?.sitePages) ? data.sitePages : [];

    pages = pages.filter(page => {
      const id = String(page?.id || '').trim().toLowerCase();
      return !(previousIds.has(id) && !currentIds.has(id));
    });

    products.forEach(product => {
      const id = String(product?.id || '').trim().toLowerCase();
      if (!id) return;
      product.href = `page.html?page=${encodeURIComponent(id)}`;
      if (pages.some(page => String(page?.id || '').trim().toLowerCase() === id)) return;
      const storeUrl = String(product?.links?.primaryUrl || '').trim();
      pages.unshift({
        id,
        title: String(product?.title || id).trim(),
        type: 'text',
        heading: String(product?.title || id).trim(),
        content: String(product?.shortDescription || '').trim(),
        cards: [],
        blocks: [],
        files: [],
        buttonPosition: 'side',
        buttons: storeUrl ? [{ label: 'View on Unity Asset Store', href: storeUrl, style: 'primary' }] : []
      });
    });
    data.sitePages = pages;
  }

  async function save() {
    if (saving || !category) return;
    syncWorkingFromRows();
    saving = true;
    const saveButton = q('#category-page-editor-save');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Сохранение…';
    }
    setState('Публикую страницу категории и продукты в GitHub…', 'busy');

    try {
      const latest = await fetchCatalog();
      const latestCategory = (latest.categories || []).find(item => item.id === categoryId);
      if (!latestCategory) throw new Error('Категория больше не существует.');
      latestCategory.description = q('#category-page-description-input')?.value.trim() || '';
      const beforeProducts = Array.isArray(latest.products) ? latest.products.map(item => ({ ...item })) : [];
      latest.products = mergeWorkingProducts(Array.isArray(latest.products) ? latest.products : []);
      syncManagedProductPages(latest, beforeProducts);

      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: latest, message: `Bibika: update category page ${categoryId}` })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      sessionUploads.clear();
      const obsoleteImages = [...removedProductImages];
      removedProductImages.clear();
      if (obsoleteImages.length) cleanupPaths(obsoleteImages);
      const visibleDescription = q('#category-description');
      if (visibleDescription) visibleDescription.textContent = latestCategory.description;
      setState('Страница категории и продукты сохранены и опубликованы.', 'ok');
      showToast('Категория сохранена в GitHub.');
      setTimeout(() => {
        saving = false;
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = 'Сохранить';
        }
        const overlay = q('#category-page-editor-overlay');
        overlay?.classList.remove('open');
        overlay?.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
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
    q('#category-page-add-product')?.addEventListener('click', addProduct);

    q('#category-page-products-list')?.addEventListener('focusin', event => {
      if (event.target.matches('.category-page-product-href')) activeHrefInput = event.target;
    });

    q('#category-page-products-list')?.addEventListener('click', event => {
      const row = event.target.closest('.category-page-product-row-fields');
      if (!row) return;
      if (event.target.closest('.category-page-product-icon-pick')) {
        event.preventDefault();
        pendingIconRow = row;
        const input = q('#category-product-icon-file');
        input.value = '';
        input.click();
        return;
      }
      if (event.target.closest('.category-page-product-icon-clear')) {
        event.preventDefault();
        clearIcon(row);
        return;
      }
      if (event.target.closest('.category-page-product-up')) {
        event.preventDefault();
        moveProduct(row.dataset.productKey, -1);
        return;
      }
      if (event.target.closest('.category-page-product-down')) {
        event.preventDefault();
        moveProduct(row.dataset.productKey, 1);
        return;
      }
      if (event.target.closest('.category-page-product-remove')) {
        event.preventDefault();
        removeProduct(row.dataset.productKey);
      }
    });

    q('#category-product-icon-file')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      const row = pendingIconRow;
      pendingIconRow = null;
      if (file && row?.isConnected) uploadIconForRow(row, file);
    });

    q('#category-page-site-pages-list')?.addEventListener('click', event => {
      const link = event.target.closest('.category-page-site-page');
      if (!link || !activeHrefInput) return;
      if (!event.altKey && !event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      activeHrefInput.value = link.getAttribute('href') || '';
      activeHrefInput.focus();
      setState('Адрес страницы вставлен в поле «Куда ведёт».');
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