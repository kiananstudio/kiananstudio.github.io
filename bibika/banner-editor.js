(() => {
  const API_URL = '/api/catalog';
  const DEFAULT_BANNER = {
    image: 'assets/images/kianan-banner.webp',
    alt: 'Kianan Studio — tools, 3D assets and games'
  };

  let workingBanner = { ...DEFAULT_BANNER };
  let saving = false;

  const q = (selector, root = document) => root.querySelector(selector);

  function showToast(message, duration = 3200) {
    const toast = q('#bibika-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function normalizeBanner(value) {
    return {
      image: String(value?.image || DEFAULT_BANNER.image).trim() || DEFAULT_BANNER.image,
      alt: String(value?.alt || DEFAULT_BANNER.alt).trim() || DEFAULT_BANNER.alt
    };
  }

  function safeImage(value) {
    const src = String(value || '').trim();
    if (!src || /^(javascript|data|vbscript):/i.test(src)) return '';
    return src;
  }

  function bibikaSrc(value) {
    const src = safeImage(value);
    if (!src) return '';
    if (/^https?:\/\//i.test(src)) return src;
    return `https://kiananstudio.com/${src.replace(/^\/+/, '')}`;
  }

  function renderBanner(value) {
    const banner = normalizeBanner(value);
    const image = q('.home-banner');
    if (!image) return;
    image.src = bibikaSrc(banner.image);
    image.alt = banner.alt;
    image.style.display = '';
    image.parentElement?.classList.remove('banner-placeholder');
  }

  async function fetchCatalog() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadBannerFromGitHub({ updateFields = false } = {}) {
    try {
      const catalog = await fetchCatalog();
      workingBanner = normalizeBanner(catalog?.siteBanner);
      renderBanner(workingBanner);
      if (updateFields) fillFields(workingBanner);
    } catch (error) {
      showToast(`Не удалось загрузить Banner: ${error.message}`, 4500);
    }
  }

  function fillFields(banner) {
    q('#banner-field-image').value = banner.image;
    q('#banner-field-alt').value = banner.alt;
    updatePreview();
  }

  function collectFields() {
    return {
      image: q('#banner-field-image').value.trim(),
      alt: q('#banner-field-alt').value.trim()
    };
  }

  function updatePreview() {
    const banner = collectFields();
    const preview = q('#banner-editor-preview-image');
    if (!preview) return;
    const src = bibikaSrc(banner.image);
    if (!src) {
      preview.removeAttribute('src');
      preview.alt = '';
      return;
    }
    preview.src = src;
    preview.alt = banner.alt || DEFAULT_BANNER.alt;
  }

  function setState(message, state = '') {
    const node = q('#banner-editor-state');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function openEditor() {
    if (saving) return;
    fillFields(workingBanner);
    setState('Изменения будут опубликованы на kiananstudio.com после сохранения.');
    const overlay = q('#banner-editor-overlay');
    overlay?.classList.add('open');
    overlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('banner-editor-open');
    q('#banner-field-image')?.focus();
  }

  function closeEditor() {
    if (saving) return;
    const overlay = q('#banner-editor-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('banner-editor-open');
  }

  async function saveBanner() {
    if (saving) return;
    const banner = collectFields();
    if (!safeImage(banner.image)) {
      setState('Укажи изображение баннера.', 'error');
      return;
    }
    if (!banner.alt) banner.alt = DEFAULT_BANNER.alt;

    saving = true;
    const saveButton = q('#banner-editor-save');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Сохранение…';
    }
    setState('Публикую Banner в GitHub…', 'busy');

    try {
      const catalog = await fetchCatalog();
      catalog.siteBanner = banner;
      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: catalog, message: 'Bibika: update home Banner' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      workingBanner = { ...banner };
      renderBanner(workingBanner);
      setState('Banner сохранён и опубликован.', 'ok');
      showToast('Banner сохранён в GitHub.');
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
      setState(`Не удалось сохранить Banner: ${error.message}`, 'error');
      showToast(`Ошибка сохранения Banner: ${error.message}`, 4800);
    }

    saving = false;
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Сохранить';
    }
  }

  function ensureModal() {
    if (q('#banner-editor-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'banner-editor-overlay';
    overlay.className = 'banner-editor-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="banner-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="banner-editor-title">
        <div class="banner-editor-head">
          <div>
            <span class="banner-editor-eyebrow">Редактирование блока</span>
            <h2 id="banner-editor-title">Banner</h2>
            <p>Меняй изображение главного баннера и его описание. Ниже сразу виден предпросмотр.</p>
          </div>
          <button type="button" class="banner-editor-close" id="banner-editor-close" aria-label="Закрыть">×</button>
        </div>
        <div class="banner-editor-body" id="banner-editor-body">
          <div class="banner-editor-preview"><img id="banner-editor-preview-image" alt=""></div>
          <label class="banner-editor-field">
            <span>Изображение</span>
            <input id="banner-field-image" type="text" autocomplete="off" placeholder="assets/images/kianan-banner.webp">
            <small class="banner-editor-hint">Можно указать путь внутри сайта или полный https:// адрес.</small>
          </label>
          <label class="banner-editor-field">
            <span>Описание изображения</span>
            <input id="banner-field-alt" type="text" autocomplete="off" placeholder="Kianan Studio — tools, 3D assets and games">
          </label>
        </div>
        <div class="banner-editor-footer">
          <span id="banner-editor-state" class="banner-editor-state"></span>
          <div class="banner-editor-footer-actions">
            <button type="button" class="button button-secondary" id="banner-editor-cancel">Отмена</button>
            <button type="button" class="button button-primary" id="banner-editor-save">Сохранить</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);
  }

  function bind() {
    ensureModal();
    q('#edit-site-banner')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditor();
    });
    q('#banner-editor-close')?.addEventListener('click', closeEditor);
    q('#banner-editor-cancel')?.addEventListener('click', closeEditor);
    q('#banner-editor-save')?.addEventListener('click', saveBanner);
    q('#banner-editor-body')?.addEventListener('input', updatePreview);
    q('#banner-editor-overlay')?.addEventListener('click', (event) => {
      if (event.target === q('#banner-editor-overlay')) closeEditor();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && q('#banner-editor-overlay')?.classList.contains('open')) {
        event.preventDefault();
        closeEditor();
      }
    });
    q('#bibika-refresh')?.addEventListener('click', () => setTimeout(() => loadBannerFromGitHub(), 100));
    loadBannerFromGitHub();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
