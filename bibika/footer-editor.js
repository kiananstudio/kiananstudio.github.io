(() => {
  const API_URL = '/api/catalog';
  const DEFAULT_FOOTER = {
    brand: 'Kianan Studio',
    tagline: 'Unity tools, 3D assets and games.',
    copyright: 'Kianan Studio. All rights reserved.'
  };

  let workingFooter = { ...DEFAULT_FOOTER };
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

  function normalizeFooter(value) {
    return {
      brand: String(value?.brand || DEFAULT_FOOTER.brand).trim(),
      tagline: String(value?.tagline ?? DEFAULT_FOOTER.tagline).trim(),
      copyright: String(value?.copyright || DEFAULT_FOOTER.copyright).trim()
    };
  }

  function renderFooter(value) {
    const footer = normalizeFooter(value);
    const brand = q('.site-footer .footer-brand strong');
    const tagline = q('.site-footer .footer-brand span');
    const copyright = q('.site-footer .footer-inner > p');
    if (brand) brand.textContent = footer.brand;
    if (tagline) tagline.textContent = footer.tagline;
    if (copyright) copyright.textContent = `© ${new Date().getFullYear()} ${footer.copyright}`;
  }

  async function fetchCatalog() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadFooterFromGitHub({ updateFields = false } = {}) {
    try {
      const catalog = await fetchCatalog();
      workingFooter = normalizeFooter(catalog?.siteFooter);
      renderFooter(workingFooter);
      if (updateFields) fillFields(workingFooter);
    } catch (error) {
      showToast(`Не удалось загрузить Footer: ${error.message}`, 4500);
    }
  }

  function fillFields(footer) {
    q('#footer-field-brand').value = footer.brand;
    q('#footer-field-tagline').value = footer.tagline;
    q('#footer-field-copyright').value = footer.copyright;
    updatePreview();
  }

  function collectFields() {
    return {
      brand: q('#footer-field-brand').value.trim(),
      tagline: q('#footer-field-tagline').value.trim(),
      copyright: q('#footer-field-copyright').value.trim()
    };
  }

  function updatePreview() {
    const value = collectFields();
    const previewBrand = q('#footer-preview-brand');
    const previewTagline = q('#footer-preview-tagline');
    const previewCopyright = q('#footer-preview-copyright');
    if (previewBrand) previewBrand.textContent = value.brand || '—';
    if (previewTagline) previewTagline.textContent = value.tagline || '—';
    if (previewCopyright) previewCopyright.textContent = `© ${new Date().getFullYear()} ${value.copyright || '—'}`;
  }

  function setState(message, state = '') {
    const node = q('#footer-editor-state');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function openEditor() {
    if (saving) return;
    fillFields(workingFooter);
    setState('Изменения будут опубликованы на kiananstudio.com после сохранения.');
    const overlay = q('#footer-editor-overlay');
    overlay?.classList.add('open');
    overlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('footer-editor-open');
    q('#footer-field-brand')?.focus();
  }

  function closeEditor() {
    if (saving) return;
    const overlay = q('#footer-editor-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('footer-editor-open');
  }

  async function saveFooter() {
    if (saving) return;
    const footer = collectFields();
    if (!footer.brand) {
      setState('Заполни название слева.', 'error');
      return;
    }
    if (!footer.copyright) {
      setState('Заполни текст справа.', 'error');
      return;
    }

    saving = true;
    const saveButton = q('#footer-editor-save');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Сохранение…';
    }
    setState('Публикую Footer в GitHub…', 'busy');

    try {
      const catalog = await fetchCatalog();
      catalog.siteFooter = footer;
      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: catalog, message: 'Bibika: update site Footer' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      workingFooter = { ...footer };
      renderFooter(workingFooter);
      setState('Footer сохранён и опубликован.', 'ok');
      showToast('Footer сохранён в GitHub.');
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
      setState(`Не удалось сохранить Footer: ${error.message}`, 'error');
      showToast(`Ошибка сохранения Footer: ${error.message}`, 4800);
    }

    saving = false;
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = 'Сохранить';
    }
  }

  function ensureModal() {
    if (q('#footer-editor-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'footer-editor-overlay';
    overlay.className = 'footer-editor-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="footer-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="footer-editor-title">
        <div class="footer-editor-head">
          <div>
            <span class="footer-editor-eyebrow">Редактирование блока</span>
            <h2 id="footer-editor-title">Footer</h2>
            <p>Редактируй текст нижней части сайта. Год подставляется автоматически.</p>
          </div>
          <button type="button" class="footer-editor-close" id="footer-editor-close" aria-label="Закрыть">×</button>
        </div>
        <div class="footer-editor-body">
          <label class="footer-editor-field">
            <span>Название слева</span>
            <input id="footer-field-brand" type="text" autocomplete="off" placeholder="Kianan Studio">
          </label>
          <label class="footer-editor-field">
            <span>Описание слева</span>
            <input id="footer-field-tagline" type="text" autocomplete="off" placeholder="Unity tools, 3D assets and games.">
          </label>
          <label class="footer-editor-field">
            <span>Текст справа после года</span>
            <input id="footer-field-copyright" type="text" autocomplete="off" placeholder="Kianan Studio. All rights reserved.">
          </label>
          <div class="footer-editor-preview" aria-label="Предпросмотр Footer">
            <div><strong id="footer-preview-brand"></strong><span id="footer-preview-tagline"></span></div>
            <p id="footer-preview-copyright"></p>
          </div>
        </div>
        <div class="footer-editor-footer">
          <span id="footer-editor-state" class="footer-editor-state"></span>
          <div class="footer-editor-footer-actions">
            <button type="button" class="button button-secondary" id="footer-editor-cancel">Отмена</button>
            <button type="button" class="button button-primary" id="footer-editor-save">Сохранить</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(overlay);
  }

  function bind() {
    ensureModal();
    q('#edit-site-footer')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditor();
    });
    q('#footer-editor-close')?.addEventListener('click', closeEditor);
    q('#footer-editor-cancel')?.addEventListener('click', closeEditor);
    q('#footer-editor-save')?.addEventListener('click', saveFooter);
    q('.footer-editor-body')?.addEventListener('input', updatePreview);
    q('#footer-editor-overlay')?.addEventListener('click', (event) => {
      if (event.target === q('#footer-editor-overlay')) closeEditor();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && q('#footer-editor-overlay')?.classList.contains('open')) {
        event.preventDefault();
        closeEditor();
      }
    });
    q('#bibika-refresh')?.addEventListener('click', () => setTimeout(() => loadFooterFromGitHub(), 100));
    loadFooterFromGitHub();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
