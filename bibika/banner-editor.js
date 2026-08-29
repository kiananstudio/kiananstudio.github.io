(() => {
  const API_URL = '/api/catalog';
  const IMAGE_API_URL = '/api/image';
  const CLEANUP_API_URL = '/api/image/cleanup';
  const DEFAULT_BANNER = {
    image: 'assets/images/kianan-banner.webp',
    alt: 'Kianan Studio — tools, 3D assets and games'
  };
  const ALLOWED_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);
  const ALLOWED_EXTENSIONS = /\.(webp|png|jpe?g)$/i;
  const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
  const WEBP_QUALITY = 0.85;
  const OUTPUT_WIDTH = 1500;

  let workingBanner = { ...DEFAULT_BANNER };
  let draftBanner = { ...DEFAULT_BANNER };
  let saving = false;
  let uploading = false;
  let sourceFile = null;
  let sourceUrl = '';
  let sourceImage = null;
  let scale = 1;
  let fillScale = 1;
  let fitScale = 1;
  let centerX = 0;
  let centerY = 0;
  let dragging = false;
  let pointerId = null;
  let lastClientX = 0;
  let lastClientY = 0;
  let outputHeight = 500;
  let openedWithImage = '';
  const newUploads = new Set();

  const q = (selector, root = document) => root.querySelector(selector);

  function showToast(message, duration = 3200) {
    const toast = q('#bibika-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function hasOwn(object, key) {
    return !!object && Object.prototype.hasOwnProperty.call(object, key);
  }

  function normalizeBanner(value) {
    const image = hasOwn(value, 'image') ? String(value.image ?? '').trim() : DEFAULT_BANNER.image;
    const alt = hasOwn(value, 'alt') ? String(value.alt ?? '').trim() : DEFAULT_BANNER.alt;
    return { image, alt: alt || DEFAULT_BANNER.alt };
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
    const clean = src.replace(/^\/+/, '');
    if (/^assets\/images\/site-banner-cover-\d{14}-[a-f0-9]{8}\.webp$/i.test(clean)) {
      return `https://raw.githubusercontent.com/kiananstudio/kiananstudio.github.io/main/${clean}?t=${Date.now()}`;
    }
    return `https://kiananstudio.com/${clean}?t=${Date.now()}`;
  }

  function renderBanner(value) {
    const banner = normalizeBanner(value);
    const image = q('.home-banner');
    const wrap = image?.parentElement;
    if (!image || !wrap) return;
    const src = safeImage(banner.image);
    if (!src) {
      image.removeAttribute('src');
      image.style.display = 'none';
      wrap.classList.add('banner-placeholder');
      return;
    }
    image.src = bibikaSrc(src);
    image.alt = banner.alt;
    image.style.display = '';
    wrap.classList.remove('banner-placeholder');
  }

  async function fetchCatalog() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadBannerFromGitHub() {
    try {
      const catalog = await fetchCatalog();
      workingBanner = normalizeBanner(catalog?.siteBanner);
      renderBanner(workingBanner);
    } catch (error) {
      showToast(`Не удалось загрузить Banner: ${error.message}`, 4500);
    }
  }

  function setState(message, state = '') {
    const node = q('#banner-editor-state');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function updateImageActions() {
    const remove = q('#banner-remove-image');
    if (remove) remove.disabled = !safeImage(draftBanner.image) || saving || uploading;
    const upload = q('#banner-upload-image');
    if (upload) upload.disabled = saving || uploading;
  }

  function updateEditorPreview() {
    const preview = q('#banner-editor-preview-image');
    const empty = q('#banner-editor-preview-empty');
    const src = bibikaSrc(draftBanner.image);
    if (preview) {
      if (src) {
        preview.src = src;
        preview.alt = draftBanner.alt || DEFAULT_BANNER.alt;
        preview.style.display = '';
      } else {
        preview.removeAttribute('src');
        preview.alt = '';
        preview.style.display = 'none';
      }
    }
    if (empty) empty.hidden = !!src;
    const alt = q('#banner-field-alt');
    if (alt && alt.value !== draftBanner.alt) alt.value = draftBanner.alt;
    updateImageActions();
  }

  function openEditor() {
    if (saving || uploading) return;
    draftBanner = { ...workingBanner };
    openedWithImage = workingBanner.image;
    newUploads.clear();
    q('#banner-field-alt').value = draftBanner.alt;
    updateEditorPreview();
    setState('Изменения будут опубликованы на kiananstudio.com после сохранения.');
    const overlay = q('#banner-editor-overlay');
    overlay?.classList.add('open');
    overlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('banner-editor-open');
  }

  async function cleanupUploaded(paths) {
    const list = [...new Set(paths)].filter(Boolean);
    if (!list.length) return;
    try {
      await fetch(CLEANUP_API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: list })
      });
    } catch {
      // A later catalog save will sweep any remaining orphaned Bibika images.
    }
  }

  function closeEditor({ cleanup = true } = {}) {
    if (saving || uploading) return;
    const overlay = q('#banner-editor-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('banner-editor-open');
    if (cleanup) cleanupUploaded([...newUploads]);
    newUploads.clear();
    draftBanner = { ...workingBanner };
  }

  function removeImage() {
    if (saving || uploading) return;
    draftBanner.image = '';
    updateEditorPreview();
    setState('Изображение будет удалено с баннера после сохранения.');
  }

  function validateFile(file) {
    if (!file) return 'Файл не выбран.';
    if (!ALLOWED_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.test(file.name)) {
      return 'Разрешены только WEBP, PNG, JPG и JPEG. SVG не поддерживается.';
    }
    if (file.size > MAX_SOURCE_BYTES) return 'Исходное изображение слишком большое. Максимум 20 МБ.';
    return '';
  }

  function cleanupSource() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = '';
    sourceFile = null;
    sourceImage = null;
    dragging = false;
    pointerId = null;
  }

  function currentBannerRatio() {
    const banner = q('.home-banner');
    if (banner?.naturalWidth && banner?.naturalHeight) {
      const ratio = banner.naturalWidth / banner.naturalHeight;
      if (Number.isFinite(ratio) && ratio >= 1.5 && ratio <= 6) return ratio;
    }
    return 3;
  }

  function setupCanvas() {
    const canvas = q('#banner-crop-canvas');
    outputHeight = Math.max(260, Math.min(1000, Math.round(OUTPUT_WIDTH / currentBannerRatio())));
    canvas.width = OUTPUT_WIDTH;
    canvas.height = outputHeight;
    q('#banner-output-size').textContent = `${OUTPUT_WIDTH} × ${outputHeight} px`;
  }

  function syncScaleSlider() {
    const slider = q('#banner-image-scale');
    if (!slider || !fillScale) return;
    const ratio = Math.round((scale / fillScale) * 100);
    slider.value = String(Math.max(Number(slider.min), Math.min(Number(slider.max), ratio)));
    q('#banner-image-scale-value').textContent = `${ratio}%`;
  }

  function clampCenter() {
    if (!sourceImage) return;
    const canvas = q('#banner-crop-canvas');
    const drawWidth = sourceImage.naturalWidth * scale;
    const drawHeight = sourceImage.naturalHeight * scale;
    if (drawWidth >= canvas.width) centerX = Math.min(drawWidth / 2, Math.max(canvas.width - drawWidth / 2, centerX));
    else centerX = canvas.width / 2;
    if (drawHeight >= canvas.height) centerY = Math.min(drawHeight / 2, Math.max(canvas.height - drawHeight / 2, centerY));
    else centerY = canvas.height / 2;
  }

  function drawCrop() {
    const canvas = q('#banner-crop-canvas');
    if (!canvas || !sourceImage) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = sourceImage.naturalWidth * scale;
    const height = sourceImage.naturalHeight * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceImage, centerX - width / 2, centerY - height / 2, width, height);
  }

  function resetTransform(mode = 'fill') {
    if (!sourceImage) return;
    const canvas = q('#banner-crop-canvas');
    fillScale = Math.max(canvas.width / sourceImage.naturalWidth, canvas.height / sourceImage.naturalHeight);
    fitScale = Math.min(canvas.width / sourceImage.naturalWidth, canvas.height / sourceImage.naturalHeight);
    scale = mode === 'fit' ? fitScale : fillScale;
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
    syncScaleSlider();
    drawCrop();
  }

  function openCropper(file) {
    const error = validateFile(file);
    if (error) {
      showToast(error, 4800);
      return;
    }
    sourceFile = file;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    sourceImage = new Image();
    sourceImage.onload = () => {
      setupCanvas();
      q('#banner-source-name').textContent = file.name;
      q('#banner-source-size').textContent = `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight} px · ${(file.size / 1024 / 1024).toFixed(2)} МБ`;
      resetTransform('fill');
      const overlay = q('#banner-crop-overlay');
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
    };
    sourceImage.onerror = () => {
      cleanupSource();
      showToast('Не удалось прочитать выбранное изображение.');
    };
    sourceImage.src = sourceUrl;
  }

  function closeCropper() {
    if (uploading) return;
    const overlay = q('#banner-crop-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    cleanupSource();
  }

  function setUploading(value) {
    uploading = value;
    const confirm = q('#banner-use-image');
    if (confirm) {
      confirm.disabled = value;
      confirm.textContent = value ? 'Загрузка…' : 'Использовать изображение';
    }
    ['#banner-crop-close', '#banner-crop-cancel', '#banner-fit', '#banner-fill', '#banner-reset', '#banner-image-scale'].forEach((selector) => {
      const node = q(selector);
      if (node) node.disabled = value;
    });
    updateImageActions();
  }

  function canvasToWebp(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.type !== 'image/webp') {
          reject(new Error('Браузер не смог создать WEBP.'));
          return;
        }
        resolve(blob);
      }, 'image/webp', WEBP_QUALITY);
    });
  }

  async function uploadBannerBlob(blob) {
    const response = await fetch(IMAGE_API_URL, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'image/webp',
        'X-Bibika-Product': 'site-banner',
        'X-Bibika-Target': 'cover'
      },
      body: blob
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    if (!payload.path) throw new Error('GitHub не вернул путь к изображению.');
    return payload.path;
  }

  async function useCroppedImage() {
    if (!sourceImage || uploading) return;
    setUploading(true);
    try {
      const blob = await canvasToWebp(q('#banner-crop-canvas'));
      const path = await uploadBannerBlob(blob);
      newUploads.add(path);
      draftBanner.image = path;
      updateEditorPreview();
      setState('Изображение подготовлено и загружено. Нажми «Сохранить», чтобы применить его к сайту.');
      setUploading(false);
      closeCropper();
    } catch (error) {
      setUploading(false);
      showToast(`Ошибка загрузки изображения: ${error.message}`, 6000);
    }
  }

  function beginDrag(event) {
    if (!sourceImage || uploading) return;
    dragging = true;
    pointerId = event.pointerId;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    q('#banner-crop-canvas').setPointerCapture?.(pointerId);
    event.preventDefault();
  }

  function drag(event) {
    if (!dragging || event.pointerId !== pointerId || !sourceImage) return;
    const canvas = q('#banner-crop-canvas');
    const rect = canvas.getBoundingClientRect();
    centerX += (event.clientX - lastClientX) * (canvas.width / rect.width);
    centerY += (event.clientY - lastClientY) * (canvas.height / rect.height);
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    clampCenter();
    drawCrop();
    event.preventDefault();
  }

  function endDrag(event) {
    if (event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
  }

  function setScaleFromRatio(ratioPercent) {
    if (!sourceImage) return;
    scale = fillScale * (ratioPercent / 100);
    clampCenter();
    syncScaleSlider();
    drawCrop();
  }

  function wheelZoom(event) {
    if (!sourceImage || uploading) return;
    event.preventDefault();
    const slider = q('#banner-image-scale');
    const current = Number(slider.value);
    const next = Math.max(Number(slider.min), Math.min(Number(slider.max), current + (event.deltaY < 0 ? 5 : -5)));
    setScaleFromRatio(next);
  }

  async function saveBanner() {
    if (saving || uploading) return;
    draftBanner.alt = q('#banner-field-alt').value.trim() || DEFAULT_BANNER.alt;
    saving = true;
    const saveButton = q('#banner-editor-save');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'Сохранение…';
    }
    updateImageActions();
    setState('Публикую Banner в GitHub…', 'busy');

    try {
      const catalog = await fetchCatalog();
      catalog.siteBanner = { ...draftBanner };
      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: catalog, message: 'Bibika: update home Banner' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      workingBanner = { ...draftBanner };
      renderBanner(workingBanner);
      newUploads.clear();
      setState('Banner сохранён и опубликован.', 'ok');
      showToast('Banner сохранён в GitHub.');
      setTimeout(() => {
        saving = false;
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = 'Сохранить';
        }
        updateImageActions();
        closeEditor({ cleanup: false });
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
    updateImageActions();
  }

  function ensureModal() {
    if (q('#banner-editor-overlay')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="banner-editor-overlay" id="banner-editor-overlay" aria-hidden="true">
        <section class="banner-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="banner-editor-title">
          <div class="banner-editor-head">
            <div>
              <span class="banner-editor-eyebrow">Редактирование блока</span>
              <h2 id="banner-editor-title">Banner</h2>
              <p>Загрузи изображение, настрой кадр и масштаб, а затем сохрани результат.</p>
            </div>
            <button type="button" class="banner-editor-close" id="banner-editor-close" aria-label="Закрыть">×</button>
          </div>
          <div class="banner-editor-body">
            <div class="banner-editor-preview">
              <img id="banner-editor-preview-image" alt="">
              <div class="banner-editor-preview-empty" id="banner-editor-preview-empty" hidden>Изображение баннера не выбрано</div>
            </div>
            <div class="banner-image-actions">
              <button type="button" class="button button-primary" id="banner-upload-image">Загрузить изображение</button>
              <button type="button" class="button banner-delete-image" id="banner-remove-image">Удалить изображение</button>
            </div>
            <p class="banner-editor-hint">WEBP, PNG, JPG/JPEG. После выбора откроется редактор: изображение можно перемещать и менять его масштаб.</p>
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
        </section>
      </div>
      <input id="banner-file-input" type="file" accept="image/webp,image/png,image/jpeg,.webp,.png,.jpg,.jpeg" hidden>
      <div class="banner-crop-overlay" id="banner-crop-overlay" aria-hidden="true">
        <section class="banner-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="banner-crop-title">
          <div class="banner-editor-head">
            <div>
              <span class="banner-editor-eyebrow">Редактор изображения</span>
              <h2 id="banner-crop-title">Подготовка баннера</h2>
              <p>Перемещай изображение мышью и меняй масштаб ползунком или колесом мыши.</p>
            </div>
            <button type="button" class="banner-editor-close" id="banner-crop-close" aria-label="Закрыть">×</button>
          </div>
          <div class="banner-crop-body">
            <div class="banner-crop-workspace">
              <div class="banner-crop-canvas-wrap"><canvas id="banner-crop-canvas" width="1500" height="500"></canvas></div>
              <p class="banner-editor-hint">Рамка показывает точный кадр, который будет сохранён.</p>
            </div>
            <aside class="banner-crop-controls">
              <div class="banner-source-card"><strong id="banner-source-name">—</strong><span id="banner-source-size">—</span></div>
              <div class="banner-scale-row">
                <div><span>Масштаб</span><strong id="banner-image-scale-value">100%</strong></div>
                <input id="banner-image-scale" type="range" min="10" max="400" step="1" value="100">
              </div>
              <div class="banner-crop-buttons">
                <button type="button" class="button button-secondary" id="banner-fit">Вписать</button>
                <button type="button" class="button button-secondary" id="banner-fill">Заполнить</button>
                <button type="button" class="button button-secondary" id="banner-reset">Сбросить</button>
              </div>
              <div class="banner-output-card"><span>Результат</span><strong id="banner-output-size">1500 × 500 px</strong><small>WEBP · качество 85%</small></div>
            </aside>
          </div>
          <div class="banner-editor-footer">
            <span class="banner-editor-state">Исходный файл не загружается — в GitHub попадёт только готовый WEBP.</span>
            <div class="banner-editor-footer-actions">
              <button type="button" class="button button-secondary" id="banner-crop-cancel">Отмена</button>
              <button type="button" class="button button-primary" id="banner-use-image">Использовать изображение</button>
            </div>
          </div>
        </section>
      </div>`;
    while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);
  }

  function bind() {
    ensureModal();

    q('#edit-site-banner')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditor();
    });
    q('#banner-editor-close')?.addEventListener('click', () => closeEditor());
    q('#banner-editor-cancel')?.addEventListener('click', () => closeEditor());
    q('#banner-editor-save')?.addEventListener('click', saveBanner);
    q('#banner-field-alt')?.addEventListener('input', (event) => {
      draftBanner.alt = event.target.value;
      const preview = q('#banner-editor-preview-image');
      if (preview) preview.alt = draftBanner.alt;
    });
    q('#banner-upload-image')?.addEventListener('click', () => {
      const input = q('#banner-file-input');
      input.value = '';
      input.click();
    });
    q('#banner-remove-image')?.addEventListener('click', removeImage);
    q('#banner-file-input')?.addEventListener('change', (event) => openCropper(event.target.files?.[0]));

    q('#banner-crop-close')?.addEventListener('click', closeCropper);
    q('#banner-crop-cancel')?.addEventListener('click', closeCropper);
    q('#banner-use-image')?.addEventListener('click', useCroppedImage);
    q('#banner-fit')?.addEventListener('click', () => resetTransform('fit'));
    q('#banner-fill')?.addEventListener('click', () => resetTransform('fill'));
    q('#banner-reset')?.addEventListener('click', () => resetTransform('fill'));
    q('#banner-image-scale')?.addEventListener('input', (event) => setScaleFromRatio(Number(event.target.value)));

    const canvas = q('#banner-crop-canvas');
    canvas?.addEventListener('pointerdown', beginDrag);
    canvas?.addEventListener('pointermove', drag);
    canvas?.addEventListener('pointerup', endDrag);
    canvas?.addEventListener('pointercancel', endDrag);
    canvas?.addEventListener('wheel', wheelZoom, { passive: false });

    q('#banner-editor-overlay')?.addEventListener('click', (event) => {
      if (event.target === q('#banner-editor-overlay')) closeEditor();
    });
    q('#banner-crop-overlay')?.addEventListener('click', (event) => {
      if (event.target === q('#banner-crop-overlay')) closeCropper();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (q('#banner-crop-overlay')?.classList.contains('open')) {
        event.preventDefault();
        closeCropper();
        return;
      }
      if (q('#banner-editor-overlay')?.classList.contains('open')) {
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
