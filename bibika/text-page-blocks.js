(() => {
  const API_URL = '/api/catalog';
  const IMAGE_API_URL = '/api/image';
  const IMAGE_CLEANUP_URL = '/api/image/cleanup';
  const PUBLIC_ORIGIN = 'https://kiananstudio.com';
  const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
  const MAX_IMAGE_DIMENSION = 1600;
  const WEBP_QUALITY = 0.85;
  const ALLOWED_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
  const ALLOWED_EXTENSIONS = /\.(webp|png|jpe?g)$/i;

  let catalogCache = null;
  const known = new Map();
  const drafts = new Map();
  const sessionUploads = new Set();
  const currentDialogUploads = new Set();
  let activeImageBlock = null;
  let keepCurrentDialogUploads = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeButton(button) {
    return {
      label: String(button?.label || '').trim(),
      href: String(button?.href || '').trim(),
      style: button?.style === 'secondary' ? 'secondary' : 'primary'
    };
  }

  function normalizeBlock(block) {
    if (block?.type === 'image') {
      return {
        type: 'image',
        image: String(block?.image || '').trim(),
        alt: String(block?.alt || '').trim(),
        __key: block?.__key || crypto.randomUUID()
      };
    }
    return {
      type: 'text',
      heading: String(block?.heading || '').trim(),
      content: String(block?.content || '').trim(),
      buttonPosition: block?.buttonPosition === 'bottom' ? 'bottom' : 'side',
      buttons: Array.isArray(block?.buttons) ? block.buttons.map(normalizeButton).filter(item => item.label || item.href) : [],
      __key: block?.__key || crypto.randomUUID()
    };
  }

  function normalizeBlocks(page) {
    return Array.isArray(page?.blocks) ? page.blocks.map(normalizeBlock) : [];
  }

  function slugify(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function currentId() {
    return slugify(q('#header-page-id')?.value || q('#header-page-title')?.value || '');
  }

  function isCatalogUrl(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return new URL(raw, location.href).pathname === '/api/catalog';
    } catch {
      return false;
    }
  }

  function ensureScript(src, token) {
    if (document.querySelector(`script[src*="${token}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function ensureStyle(href, token) {
    if (document.querySelector(`link[href*="${token}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
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
      console.warn('Bibika page image cleanup failed', error);
    }
  }

  function cleanupCurrentDialogUploads() {
    const paths = [...currentDialogUploads];
    currentDialogUploads.clear();
    paths.forEach(path => sessionUploads.delete(path));
    if (paths.length) cleanupPaths(paths);
  }

  function cleanupAllPendingUploads() {
    const paths = [...sessionUploads];
    sessionUploads.clear();
    currentDialogUploads.clear();
    if (paths.length) cleanupPaths(paths);
  }

  async function preload(previousFetch) {
    try {
      const response = await previousFetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      catalogCache = await response.json();
      (Array.isArray(catalogCache?.sitePages) ? catalogCache.sitePages : []).forEach(page => {
        if (page?.type !== 'categories' && page?.id) known.set(String(page.id).toLowerCase(), normalizeBlocks(page));
      });
    } catch {}
  }

  function installFetchPatch() {
    const previousFetch = window.fetch.bind(window);
    window.fetch = async function patchedTextPageBlocksFetch(input, init = {}) {
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
              const blocks = drafts.get(id) || known.get(id) || normalizeBlocks(page);
              return {
                ...page,
                blocks: blocks.map(block => {
                  const clean = normalizeBlock(block);
                  delete clean.__key;
                  return clean;
                })
              };
            });
            injectedPages = payload.data.sitePages;
            nextInit = { ...init, body: JSON.stringify(payload) };
          }
        } catch {}
      }

      const response = await previousFetch(input, nextInit);
      if (response.ok && injectedPages) {
        injectedPages.forEach(page => {
          if (page?.type === 'categories' || !page?.id) return;
          const id = String(page.id).toLowerCase();
          known.set(id, normalizeBlocks(page));
          drafts.delete(id);
        });
        sessionUploads.clear();
        currentDialogUploads.clear();
      }
      return response;
    };
    return previousFetch;
  }

  function createButtonRow(button = {}) {
    const item = normalizeButton(button);
    const row = document.createElement('div');
    row.className = 'text-block-button-row';
    row.innerHTML = `
      <div class="text-block-button-number"></div>
      <label class="header-editor-field"><span>Название кнопки</span><input class="text-block-button-label" type="text" autocomplete="off" placeholder="Например, Contact"></label>
      <label class="header-editor-field"><span>Куда ведёт</span><input class="text-block-button-href" type="text" autocomplete="off" placeholder="contact.html или https://..."></label>
      <label class="header-editor-field"><span>Цвет кнопки</span><select class="text-page-button-style text-block-button-style"><option value="primary">Синяя</option><option value="secondary">Тёмная</option></select></label>
      <div class="text-block-button-actions"><button type="button" class="text-block-button-up" title="Переместить выше">↑</button><button type="button" class="text-block-button-down" title="Переместить ниже">↓</button><button type="button" class="text-block-button-delete" title="Удалить кнопку">×</button></div>`;
    q('.text-block-button-label', row).value = item.label;
    q('.text-block-button-href', row).value = item.href;
    q('.text-block-button-style', row).value = item.style;
    return row;
  }

  function renumberBlockButtons(block) {
    const rows = qa('.text-block-button-row', block);
    rows.forEach((row, index) => {
      q('.text-block-button-number', row).textContent = `${index + 1}`;
      q('.text-block-button-up', row).disabled = index === 0;
      q('.text-block-button-down', row).disabled = index === rows.length - 1;
    });
    const empty = q('.text-block-buttons-empty', block);
    if (empty) empty.hidden = rows.length > 0;
  }

  function blockHeader(type) {
    return `<div class="text-page-extra-block-head"><div><strong>${type === 'image' ? 'Изображение' : 'Текстовый блок'}</strong><span>${type === 'image' ? 'Изображение на странице.' : 'Заголовок, текст и собственные кнопки.'}</span></div><div class="text-page-extra-block-actions"><button type="button" class="text-page-extra-block-up" title="Переместить выше">↑</button><button type="button" class="text-page-extra-block-down" title="Переместить ниже">↓</button><button type="button" class="text-page-extra-block-delete" title="Удалить блок">×</button></div></div>`;
  }

  function createTextBlock(block = {}) {
    const item = normalizeBlock({ type: 'text', ...block });
    const node = document.createElement('section');
    node.className = 'text-page-extra-block text-page-extra-text-block';
    node.dataset.blockKey = item.__key;
    node.innerHTML = `${blockHeader('text')}
      <label class="header-editor-field"><span>Заголовок на странице</span><input class="text-block-heading" type="text" autocomplete="off" placeholder="Заголовок блока"></label>
      <label class="header-editor-field"><span>Текст</span><textarea class="text-block-content" rows="7" placeholder="Текст блока..."></textarea></label>
      <label class="header-editor-field"><span>Расположение кнопок</span><select class="text-block-button-position"><option value="side">Сбоку текста</option><option value="bottom">Внизу текста</option></select></label>
      <div class="text-block-buttons-head"><div><strong>Кнопки</strong><span>Стандартные кнопки сайта.</span></div><button type="button" class="text-block-add-button">+ Добавить кнопку</button></div>
      <div class="text-block-buttons-list"></div>
      <div class="text-block-buttons-empty">Кнопок пока нет.</div>`;
    q('.text-block-heading', node).value = item.heading;
    q('.text-block-content', node).value = item.content;
    q('.text-block-button-position', node).value = item.buttonPosition;
    const list = q('.text-block-buttons-list', node);
    item.buttons.forEach(button => list.appendChild(createButtonRow(button)));
    renumberBlockButtons(node);
    return node;
  }

  function imagePreviewUrl(path) {
    const value = String(path || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return `${PUBLIC_ORIGIN}/${value.replace(/^\/+/, '')}`;
  }

  function createImageBlock(block = {}) {
    const item = normalizeBlock({ type: 'image', ...block });
    const node = document.createElement('section');
    node.className = 'text-page-extra-block text-page-extra-image-block';
    node.dataset.blockKey = item.__key;
    node.dataset.image = item.image;
    node.innerHTML = `${blockHeader('image')}
      <div class="text-page-image-editor">
        <div class="text-page-image-preview"><span>Изображение не выбрано</span></div>
        <div class="text-page-image-controls">
          <button type="button" class="button button-secondary text-page-image-choose">Выбрать изображение</button>
          <button type="button" class="text-page-image-clear">Удалить изображение</button>
          <small>WEBP / PNG / JPG / JPEG · до 20 МБ · на сервер сохраняется WEBP.</small>
        </div>
      </div>
      <label class="header-editor-field"><span>Описание изображения</span><input class="text-page-image-alt" type="text" autocomplete="off" maxlength="220" placeholder="Краткое описание для alt"></label>
      <div class="text-page-image-state"></div>`;
    q('.text-page-image-alt', node).value = item.alt;
    updateImagePreview(node);
    return node;
  }

  function updateImagePreview(block) {
    const host = q('.text-page-image-preview', block);
    if (!host) return;
    host.replaceChildren();
    const path = String(block.dataset.image || '').trim();
    if (!path) {
      const span = document.createElement('span');
      span.textContent = 'Изображение не выбрано';
      host.appendChild(span);
      return;
    }
    const img = document.createElement('img');
    img.src = imagePreviewUrl(path);
    img.alt = '';
    host.appendChild(img);
  }

  function renumberBlocks() {
    const host = q('#text-page-extra-blocks');
    if (!host) return;
    const blocks = qa('.text-page-extra-block', host);
    blocks.forEach((block, index) => {
      q('.text-page-extra-block-up', block).disabled = index === 0;
      q('.text-page-extra-block-down', block).disabled = index === blocks.length - 1;
    });
    const empty = q('#text-page-extra-blocks-empty');
    if (empty) empty.hidden = blocks.length > 0;
  }

  function collectExtraBlocks() {
    const host = q('#text-page-extra-blocks');
    if (!host) return [];
    return qa('.text-page-extra-block', host).map(block => {
      if (block.classList.contains('text-page-extra-image-block')) {
        return {
          type: 'image',
          image: String(block.dataset.image || '').trim(),
          alt: q('.text-page-image-alt', block)?.value.trim() || ''
        };
      }
      return {
        type: 'text',
        heading: q('.text-block-heading', block)?.value.trim() || '',
        content: q('.text-block-content', block)?.value.trim() || '',
        buttonPosition: q('.text-block-button-position', block)?.value === 'bottom' ? 'bottom' : 'side',
        buttons: qa('.text-block-button-row', block).map(row => ({
          label: q('.text-block-button-label', row)?.value.trim() || '',
          href: q('.text-block-button-href', row)?.value.trim() || '',
          style: q('.text-block-button-style', row)?.value === 'secondary' ? 'secondary' : 'primary'
        })).filter(item => item.label || item.href)
      };
    });
  }

  function renderExtraBlocks(blocks) {
    const host = q('#text-page-extra-blocks');
    if (!host) return;
    host.replaceChildren();
    (blocks || []).forEach(block => host.appendChild(block.type === 'image' ? createImageBlock(block) : createTextBlock(block)));
    renumberBlocks();
  }

  function ensureEditorUi() {
    const textFields = q('#header-page-text-fields');
    const firstButtons = q('#text-page-buttons-editor');
    if (!textFields || !firstButtons) return false;
    if (q('#text-page-block-actions')) return true;

    const sitePages = q('.text-page-site-pages', firstButtons);
    const actions = document.createElement('div');
    actions.id = 'text-page-block-actions';
    actions.className = 'text-page-block-actions';
    actions.innerHTML = '<button type="button" id="text-page-add-text-block">+ Добавить текст</button><button type="button" id="text-page-add-image-block">+ Добавить картинку</button>';

    const extra = document.createElement('div');
    extra.id = 'text-page-extra-blocks';
    extra.className = 'text-page-extra-blocks';
    const empty = document.createElement('div');
    empty.id = 'text-page-extra-blocks-empty';
    empty.className = 'text-page-extra-blocks-empty';
    empty.textContent = 'Дополнительных блоков пока нет.';

    firstButtons.insertAdjacentElement('afterend', actions);
    actions.insertAdjacentElement('afterend', extra);
    extra.insertAdjacentElement('afterend', empty);
    if (sitePages) empty.insertAdjacentElement('afterend', sitePages);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'text-page-image-file';
    fileInput.accept = 'image/webp,image/png,image/jpeg,.webp,.png,.jpg,.jpeg';
    fileInput.hidden = true;
    document.body.appendChild(fileInput);

    q('#text-page-add-text-block')?.addEventListener('click', () => {
      const block = createTextBlock();
      extra.appendChild(block);
      renumberBlocks();
      q('.text-block-heading', block)?.focus();
      block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    q('#text-page-add-image-block')?.addEventListener('click', () => {
      const block = createImageBlock();
      extra.appendChild(block);
      renumberBlocks();
      block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    extra.addEventListener('click', event => {
      const block = event.target.closest('.text-page-extra-block');
      if (!block) return;
      if (event.target.closest('.text-page-extra-block-delete')) {
        const path = String(block.dataset.image || '').trim();
        if (path && sessionUploads.has(path)) {
          sessionUploads.delete(path);
          currentDialogUploads.delete(path);
          cleanupPaths([path]);
        }
        block.remove();
        renumberBlocks();
        return;
      }
      if (event.target.closest('.text-page-extra-block-up') && block.previousElementSibling?.classList.contains('text-page-extra-block')) {
        block.parentNode.insertBefore(block, block.previousElementSibling);
        renumberBlocks();
        return;
      }
      if (event.target.closest('.text-page-extra-block-down') && block.nextElementSibling?.classList.contains('text-page-extra-block')) {
        block.parentNode.insertBefore(block.nextElementSibling, block);
        renumberBlocks();
        return;
      }
      if (event.target.closest('.text-block-add-button')) {
        const list = q('.text-block-buttons-list', block);
        const row = createButtonRow();
        list.appendChild(row);
        renumberBlockButtons(block);
        q('.text-block-button-label', row)?.focus();
        return;
      }
      const buttonRow = event.target.closest('.text-block-button-row');
      if (buttonRow) {
        if (event.target.closest('.text-block-button-delete')) buttonRow.remove();
        else if (event.target.closest('.text-block-button-up') && buttonRow.previousElementSibling) buttonRow.parentNode.insertBefore(buttonRow, buttonRow.previousElementSibling);
        else if (event.target.closest('.text-block-button-down') && buttonRow.nextElementSibling) buttonRow.parentNode.insertBefore(buttonRow.nextElementSibling, buttonRow);
        renumberBlockButtons(block);
        return;
      }
      if (event.target.closest('.text-page-image-choose')) {
        activeImageBlock = block;
        fileInput.value = '';
        fileInput.click();
        return;
      }
      if (event.target.closest('.text-page-image-clear')) {
        const path = String(block.dataset.image || '').trim();
        if (path && sessionUploads.has(path)) {
          sessionUploads.delete(path);
          currentDialogUploads.delete(path);
          cleanupPaths([path]);
        }
        block.dataset.image = '';
        updateImagePreview(block);
        q('.text-page-image-state', block).textContent = path ? 'Изображение будет удалено с сервера после сохранения.' : '';
      }
    });

    fileInput.addEventListener('change', () => handleImageFile(fileInput.files?.[0]));
    return true;
  }

  function validateSourceFile(file) {
    if (!file) return 'Файл не выбран.';
    if (!ALLOWED_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.test(file.name)) return 'Разрешены только WEBP, PNG, JPG и JPEG.';
    if (file.size > MAX_SOURCE_BYTES) return 'Исходное изображение слишком большое. Максимум 20 МБ.';
    return '';
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение.')); };
      image.src = url;
    });
  }

  async function prepareImageBlob(file) {
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
    if (!blob) throw new Error('Не удалось подготовить WEBP.');
    return blob;
  }

  async function handleImageFile(file) {
    const block = activeImageBlock;
    activeImageBlock = null;
    if (!block) return;
    const state = q('.text-page-image-state', block);
    const error = validateSourceFile(file);
    if (error) { state.textContent = error; return; }

    state.textContent = 'Подготавливаю WEBP…';
    try {
      const blob = await prepareImageBlob(file);
      if (blob.size > 4 * 1024 * 1024) throw new Error('Готовый WEBP превышает 4 МБ. Выбери изображение меньшего размера.');
      state.textContent = 'Загружаю изображение…';
      const id = currentId() || 'page';
      const response = await fetch(IMAGE_API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'image/webp',
          'X-Bibika-Product': id,
          'X-Bibika-Target': 'page'
        },
        body: blob
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      const oldPath = String(block.dataset.image || '').trim();
      if (oldPath && sessionUploads.has(oldPath)) {
        sessionUploads.delete(oldPath);
        currentDialogUploads.delete(oldPath);
        cleanupPaths([oldPath]);
      }
      block.dataset.image = result.path;
      sessionUploads.add(result.path);
      currentDialogUploads.add(result.path);
      updateImagePreview(block);
      state.textContent = `Готово · WEBP · ${Math.max(1, Math.round(blob.size / 1024))} КБ`;
    } catch (uploadError) {
      state.textContent = uploadError.message;
    }
  }

  function validateBlocks(blocks) {
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (block.type === 'image') {
        if (!block.image) return `Блок ${i + 2}: выбери изображение или удали блок.`;
        continue;
      }
      if (!block.heading && !block.content && !block.buttons.length) return `Блок ${i + 2}: заполни текстовый блок или удали его.`;
      for (let j = 0; j < block.buttons.length; j += 1) {
        const button = block.buttons[j];
        if (!button.label || !button.href) return `Блок ${i + 2}, кнопка ${j + 1}: заполни название и адрес.`;
        if (/^(javascript|data|vbscript):/i.test(button.href)) return `Блок ${i + 2}, кнопка ${j + 1}: этот тип ссылки запрещён.`;
      }
    }
    return '';
  }

  function collectFirstButtons() {
    return {
      buttonPosition: q('#text-page-button-position')?.value === 'bottom' ? 'bottom' : 'side',
      buttons: qa('.text-page-button-row', q('#text-page-buttons-list')).map(row => ({
        label: q('.text-page-button-label', row)?.value.trim() || '',
        href: q('.text-page-button-href', row)?.value.trim() || '',
        style: q('.text-page-button-style', row)?.value === 'secondary' ? 'secondary' : 'primary'
      })).filter(item => item.label || item.href)
    };
  }

  function directPageSnapshot(id, blocks) {
    const first = collectFirstButtons();
    const previous = (Array.isArray(catalogCache?.sitePages) ? catalogCache.sitePages : []).find(page => String(page?.id || '').toLowerCase() === id) || {};
    return {
      ...previous,
      id,
      title: q('#header-page-title')?.value.trim() || previous.title || id,
      type: 'text',
      heading: q('#header-page-heading')?.value.trim() || q('#header-page-title')?.value.trim() || previous.heading || id,
      content: q('#header-page-text')?.value.trim() || '',
      cards: [],
      buttonPosition: first.buttonPosition,
      buttons: first.buttons,
      blocks
    };
  }

  async function saveDirectPage(snapshot) {
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const latest = await response.json();
      const pages = Array.isArray(latest.sitePages) ? latest.sitePages : [];
      const index = pages.findIndex(page => String(page?.id || '').toLowerCase() === snapshot.id);
      if (index < 0) return;
      pages[index] = snapshot;
      latest.sitePages = pages;
      const saved = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: latest, message: `Bibika: update ${snapshot.title} page blocks` })
      });
      const result = await saved.json().catch(() => ({}));
      if (!saved.ok) throw new Error(result.error || `HTTP ${saved.status}`);
      catalogCache = latest;
      const toast = q('#bibika-toast');
      if (toast) {
        toast.textContent = 'Страница сохранена в GitHub.';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
      }
      setTimeout(() => location.reload(), 500);
    } catch (error) {
      const toast = q('#bibika-toast');
      if (toast) {
        toast.textContent = `Не удалось сохранить страницу: ${error.message}`;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4500);
      }
    }
  }

  function populateDialog() {
    if (!ensureEditorUi()) return;
    const overlay = q('#header-page-create-overlay');
    if (!overlay?.classList.contains('open')) return;
    const type = q('#header-page-content-type')?.value || 'text';
    if (type !== 'text') return;
    const host = q('#text-page-extra-blocks');
    const id = currentId();
    const token = id || '__new__';
    if (host.dataset.loadedId === token) return;
    host.dataset.loadedId = token;
    currentDialogUploads.clear();
    keepCurrentDialogUploads = false;
    renderExtraBlocks(drafts.get(id) || known.get(id) || []);
  }

  function captureDraft(event) {
    if ((q('#header-page-content-type')?.value || 'text') !== 'text') return;
    const id = currentId();
    if (!id) return;
    const blocks = collectExtraBlocks();
    const validation = validateBlocks(blocks);
    if (validation) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const state = q('#header-page-create-state');
      if (state) state.textContent = validation;
      return;
    }
    drafts.set(id, blocks.map(normalizeBlock));
    keepCurrentDialogUploads = true;
    currentDialogUploads.clear();

    const directMode = !q('#header-editor-overlay')?.classList.contains('open') && !!q('#header-page-id')?.disabled;
    if (directMode) {
      const snapshot = directPageSnapshot(id, blocks);
      setTimeout(() => saveDirectPage(snapshot), 0);
    }
  }

  function bindEditor() {
    const overlay = q('#header-page-create-overlay');
    if (!overlay) return;

    const observer = new MutationObserver(() => {
      if (overlay.classList.contains('open')) {
        setTimeout(populateDialog, 0);
      } else {
        const host = q('#text-page-extra-blocks');
        if (host) host.dataset.loadedId = '';
        if (!keepCurrentDialogUploads) cleanupCurrentDialogUploads();
        keepCurrentDialogUploads = false;
      }
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });

    q('#header-page-content-type')?.addEventListener('change', () => {
      const host = q('#text-page-extra-blocks');
      if (host) host.dataset.loadedId = '';
      setTimeout(populateDialog, 0);
    });
    q('#header-page-create-confirm')?.addEventListener('click', captureDraft, true);
    q('#header-editor-cancel')?.addEventListener('click', cleanupAllPendingUploads, true);
    q('#header-editor-close')?.addEventListener('click', cleanupAllPendingUploads, true);
  }

  function renderExtraTextBlock(block) {
    const panel = document.createElement('section');
    panel.className = `contact-panel standalone-contact managed-text-panel managed-extra-block ${block.buttonPosition === 'bottom' ? 'buttons-bottom' : 'buttons-side'}`;
    const copy = document.createElement('div');
    copy.className = 'managed-text-copy';
    if (block.heading) {
      const heading = document.createElement('h2');
      heading.className = 'managed-extra-heading';
      heading.textContent = block.heading;
      copy.appendChild(heading);
    }
    const body = document.createElement('div');
    body.className = 'managed-page-text-body';
    String(block.content || '').split(/\n{2,}/).map(part => part.trim()).filter(Boolean).forEach(part => {
      const p = document.createElement('p');
      p.textContent = part;
      body.appendChild(p);
    });
    copy.appendChild(body);
    const actions = document.createElement('div');
    actions.className = 'contact-actions managed-text-actions';
    block.buttons.forEach(button => {
      const href = String(button.href || '').trim();
      if (!href || /^(javascript|data|vbscript):/i.test(href)) return;
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
    return panel;
  }

  function renderExtraImageBlock(block) {
    const figure = document.createElement('figure');
    figure.className = 'managed-page-image-block managed-extra-block';
    const img = document.createElement('img');
    img.src = imagePreviewUrl(block.image);
    img.alt = block.alt || '';
    figure.appendChild(img);
    return figure;
  }

  async function renderBibikaPreviewBlocks() {
    if (!q('#managed-page-content')) return;
    const id = String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase();
    if (!id) return;
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      const page = (Array.isArray(data?.sitePages) ? data.sitePages : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (!page || page.type === 'categories') return;
      const blocks = normalizeBlocks(page);
      if (!blocks.length) return;

      let attempts = 0;
      const wait = setInterval(() => {
        attempts += 1;
        const host = q('#managed-page-content');
        const firstPanel = q('.managed-text-panel', host);
        if (!firstPanel && attempts < 40) return;
        clearInterval(wait);
        qa('.managed-extra-block', host).forEach(node => node.remove());
        blocks.forEach(block => host.appendChild(block.type === 'image' ? renderExtraImageBlock(block) : renderExtraTextBlock(block)));
      }, 50);
    } catch {}
  }

  ensureStyle('/text-page-blocks.css?v=1', 'text-page-blocks.css');

  Promise.all([
    ensureScript('/text-page-buttons.js?v=1', 'text-page-buttons.js').catch(() => {}),
    ensureScript('/button-color-swatches.js?v=1', 'button-color-swatches.js').catch(() => {})
  ]).finally(() => {
    const previousFetch = installFetchPatch();
    preload(previousFetch).finally(() => {
      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => { bindEditor(); renderBibikaPreviewBlocks(); }, { once: true });
      } else {
        bindEditor();
        renderBibikaPreviewBlocks();
      }
    });
  });
})();
