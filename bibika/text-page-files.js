(() => {
  const API_URL = '/api/catalog';
  const RELEASE_UPLOAD_URL = '/api/release/upload';
  const RELEASE_DELETE_URL = '/api/release/asset/delete';
  const MAX_FILE_BYTES = 90 * 1024 * 1024;

  const PLATFORM_CONFIG = {
    android: {
      label: 'Android',
      accept: '.apk,.aab,application/vnd.android.package-archive,application/octet-stream',
      extensions: /\.(apk|aab)$/i,
      minimumLabel: 'Минимальная версия Android',
      minimumPlaceholder: 'Например, Android 8.0',
      architectures: ['Universal', 'ARM64', 'ARMv7', 'x86_64'],
      downloadLabel: 'Download APK'
    },
    windows: {
      label: 'Windows',
      accept: '.exe,.msi,.zip,application/zip,application/octet-stream',
      extensions: /\.(exe|msi|zip)$/i,
      minimumLabel: 'Минимальная версия Windows',
      minimumPlaceholder: 'Например, Windows 10',
      architectures: ['x64', 'ARM64', 'x86', 'Universal'],
      downloadLabel: 'Download for Windows'
    },
    macos: {
      label: 'macOS',
      accept: '.dmg,.pkg,.zip,application/zip,application/octet-stream',
      extensions: /\.(dmg|pkg|zip)$/i,
      minimumLabel: 'Минимальная версия macOS',
      minimumPlaceholder: 'Например, macOS 13',
      architectures: ['Universal', 'Apple Silicon', 'Intel'],
      downloadLabel: 'Download for macOS'
    },
    linux: {
      label: 'Linux',
      accept: '.AppImage,.appimage,.deb,.rpm,.zip,.tar.gz,application/zip,application/octet-stream',
      extensions: /\.(appimage|deb|rpm|zip|tar\.gz)$/i,
      minimumLabel: 'Минимальные требования Linux',
      minimumPlaceholder: 'Например, Ubuntu 22.04',
      architectures: ['x64', 'ARM64', 'x86', 'Universal'],
      downloadLabel: 'Download for Linux'
    },
    ios: {
      label: 'iOS',
      accept: '.ipa,application/octet-stream',
      extensions: /\.ipa$/i,
      minimumLabel: 'Минимальная версия iOS',
      minimumPlaceholder: 'Например, iOS 16',
      architectures: ['Universal'],
      downloadLabel: 'Download for iOS'
    },
    other: {
      label: 'Другой файл',
      accept: '*/*',
      extensions: /.+/,
      minimumLabel: 'Минимальные требования',
      minimumPlaceholder: 'Необязательно',
      architectures: ['Не указано'],
      downloadLabel: 'Download file'
    }
  };

  let catalogCache = null;
  const known = new Map();
  const drafts = new Map();
  const sessionAssets = new Map();
  const currentDialogAssets = new Set();
  const pendingExistingDeletes = new Set();
  const currentDialogPendingDeletes = new Set();
  let activeFileBlock = null;
  let keepCurrentDialogChanges = false;

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function ensureStyle(href, token) {
    if (document.querySelector(`link[href*="${token}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function slugify(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function currentId() {
    return slugify(q('#header-page-id')?.value || q('#header-page-title')?.value || '');
  }

  function currentTitle() {
    return q('#header-page-title')?.value.trim() || currentId() || 'Application';
  }

  function normalizePlatform(value) {
    const key = String(value || '').trim().toLowerCase();
    return PLATFORM_CONFIG[key] ? key : 'android';
  }

  function normalizeFile(item) {
    const platform = normalizePlatform(item?.platform);
    return {
      platform,
      version: String(item?.version || '').trim(),
      minimum: String(item?.minimum || '').trim(),
      architecture: String(item?.architecture || '').trim(),
      requirements: String(item?.requirements || '').trim(),
      label: String(item?.label || PLATFORM_CONFIG[platform].downloadLabel).trim() || PLATFORM_CONFIG[platform].downloadLabel,
      fileName: String(item?.fileName || '').trim(),
      fileSize: Number(item?.fileSize || 0) || 0,
      contentType: String(item?.contentType || '').trim(),
      url: String(item?.url || '').trim(),
      releaseTag: String(item?.releaseTag || '').trim(),
      releaseId: Number(item?.releaseId || 0) || 0,
      assetId: Number(item?.assetId || 0) || 0,
      uploadedAt: String(item?.uploadedAt || '').trim(),
      uploadedPlatform: normalizePlatform(item?.uploadedPlatform || platform),
      uploadedVersion: String(item?.uploadedVersion || item?.version || '').trim()
    };
  }

  function normalizeFiles(page) {
    return Array.isArray(page?.files) ? page.files.map(normalizeFile).filter(item => item.assetId && item.url) : [];
  }

  function isCatalogUrl(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return new URL(raw, location.href).pathname === '/api/catalog';
    } catch {
      return false;
    }
  }

  async function cleanupAssets(ids) {
    const assetIds = [...new Set((ids || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
    if (!assetIds.length) return;
    try {
      const response = await fetch(RELEASE_DELETE_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn('Bibika release asset cleanup failed', error);
    }
  }

  function rollbackCurrentDialog() {
    const freshIds = [...currentDialogAssets];
    currentDialogAssets.clear();
    freshIds.forEach(id => sessionAssets.delete(id));
    if (freshIds.length) cleanupAssets(freshIds);

    currentDialogPendingDeletes.forEach(id => pendingExistingDeletes.delete(id));
    currentDialogPendingDeletes.clear();
  }

  function cancelAllUnsavedReleaseChanges() {
    const ids = [...sessionAssets.keys()];
    sessionAssets.clear();
    currentDialogAssets.clear();
    pendingExistingDeletes.clear();
    currentDialogPendingDeletes.clear();
    drafts.clear();
    if (ids.length) cleanupAssets(ids);
  }

  async function preload(previousFetch) {
    try {
      const response = await previousFetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      catalogCache = await response.json();
      (Array.isArray(catalogCache?.sitePages) ? catalogCache.sitePages : []).forEach(page => {
        if (page?.type !== 'categories' && page?.id) known.set(String(page.id).toLowerCase(), normalizeFiles(page));
      });
    } catch {}
  }

  function installFetchPatch() {
    const previousFetch = window.fetch.bind(window);
    window.fetch = async function patchedTextPageFilesFetch(input, init = {}) {
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
              const files = drafts.get(id) || known.get(id) || normalizeFiles(page);
              return { ...page, files: files.map(normalizeFile) };
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
          known.set(id, normalizeFiles(page));
          drafts.delete(id);
        });
        const toDelete = [...pendingExistingDeletes];
        pendingExistingDeletes.clear();
        currentDialogPendingDeletes.clear();
        sessionAssets.clear();
        currentDialogAssets.clear();
        if (toDelete.length) await cleanupAssets(toDelete);
      }
      return response;
    };
    return previousFetch;
  }

  function platformOptions() {
    return Object.entries(PLATFORM_CONFIG).map(([value, cfg]) => `<option value="${value}">${cfg.label}</option>`).join('');
  }

  function architectureOptions(platform, current = '') {
    const values = PLATFORM_CONFIG[platform]?.architectures || ['Не указано'];
    const selected = current && values.includes(current) ? current : values[0];
    return values.map(value => `<option value="${value.replace(/"/g, '&quot;')}"${value === selected ? ' selected' : ''}>${value}</option>`).join('');
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!value) return '';
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
    if (value >= 1024) return `${Math.round(value / 1024)} КБ`;
    return `${value} Б`;
  }

  function fileMetaFromBlock(block) {
    try {
      return normalizeFile(JSON.parse(block.dataset.fileMeta || '{}'));
    } catch {
      return normalizeFile({});
    }
  }

  function setFileMeta(block, meta) {
    block.dataset.fileMeta = JSON.stringify(normalizeFile(meta));
    updateFileResult(block);
  }

  function updateFileResult(block) {
    const meta = fileMetaFromBlock(block);
    const result = q('.text-page-file-result', block);
    if (!result) return;
    const name = q('.text-page-file-result-main strong', result);
    const details = q('.text-page-file-result-main span', result);
    const link = q('a', result);
    if (!meta.assetId || !meta.url) {
      result.classList.remove('visible');
      if (name) name.textContent = '';
      if (details) details.textContent = '';
      if (link) link.removeAttribute('href');
      return;
    }
    result.classList.add('visible');
    if (name) name.textContent = meta.fileName || 'GitHub Release asset';
    if (details) details.textContent = [meta.releaseTag, formatBytes(meta.fileSize)].filter(Boolean).join(' · ');
    if (link) {
      link.href = meta.url;
      link.dataset.bibikaPublic = 'true';
      link.target = '_blank';
      link.rel = 'noopener';
    }
  }

  function syncPlatformFields(block, preserveArchitecture = true) {
    const platform = normalizePlatform(q('.text-page-file-platform', block)?.value);
    const cfg = PLATFORM_CONFIG[platform];
    const minLabel = q('.text-page-file-minimum-label', block);
    const minInput = q('.text-page-file-minimum', block);
    const arch = q('.text-page-file-architecture', block);
    if (minLabel) minLabel.textContent = cfg.minimumLabel;
    if (minInput) minInput.placeholder = cfg.minimumPlaceholder;
    if (arch) {
      const current = preserveArchitecture ? arch.value : '';
      arch.innerHTML = architectureOptions(platform, current);
    }
    const input = q('#text-page-release-file-input');
    if (input && activeFileBlock === block) input.accept = cfg.accept;
    refreshUploadButton(block);
  }

  function refreshUploadButton(block) {
    const upload = q('.text-page-file-upload-button', block);
    const version = q('.text-page-file-version', block)?.value.trim() || '';
    if (upload) upload.disabled = !block._selectedFile || !version || !currentId();
  }

  function createFileBlock(file = {}) {
    const item = normalizeFile(file);
    const node = document.createElement('section');
    node.className = 'text-page-file-block';
    node.dataset.fileMeta = JSON.stringify(item);
    node.innerHTML = `
      <div class="text-page-file-head">
        <div><strong>Файл приложения</strong><span>Файл будет храниться в GitHub Releases, а ссылка появится на странице автоматически.</span></div>
        <button type="button" class="text-page-file-delete" title="Удалить файл с этой страницы">×</button>
      </div>
      <div class="text-page-file-fields">
        <label class="header-editor-field"><span>Платформа</span><select class="text-page-file-platform">${platformOptions()}</select></label>
        <label class="header-editor-field"><span>Версия</span><input class="text-page-file-version" type="text" maxlength="40" autocomplete="off" placeholder="Например, 1.0.0"></label>
        <label class="header-editor-field"><span class="text-page-file-minimum-label">Минимальные требования</span><input class="text-page-file-minimum" type="text" maxlength="120" autocomplete="off"></label>
        <label class="header-editor-field"><span>Архитектура</span><select class="text-page-file-architecture"></select></label>
        <label class="header-editor-field header-editor-field-wide"><span>Дополнительные требования</span><input class="text-page-file-requirements" type="text" maxlength="220" autocomplete="off" placeholder="Необязательно"></label>
      </div>
      <div class="text-page-file-upload">
        <div class="text-page-file-picker">
          <button type="button" class="button button-secondary text-page-file-choose">Выбрать файл</button>
          <span class="text-page-file-selected">Файл не выбран</span>
        </div>
        <button type="button" class="text-page-file-upload-button" disabled>Загрузить в GitHub Releases</button>
        <span class="text-page-file-hint">Файл загружается в Releases репозитория Kianan Studio. Максимум через Bibika — 90 МБ.</span>
        <div class="text-page-file-state"></div>
        <div class="text-page-file-result"><div class="text-page-file-result-main"><strong></strong><span></span></div><a href="#">Открыть ↗</a></div>
      </div>`;

    q('.text-page-file-platform', node).value = item.platform;
    q('.text-page-file-version', node).value = item.version;
    q('.text-page-file-minimum', node).value = item.minimum;
    q('.text-page-file-requirements', node).value = item.requirements;
    syncPlatformFields(node, false);
    q('.text-page-file-architecture', node).innerHTML = architectureOptions(item.platform, item.architecture);
    if (item.fileName) q('.text-page-file-selected', node).textContent = item.fileName;
    updateFileResult(node);
    return node;
  }

  function collectFiles() {
    const host = q('#text-page-file-blocks');
    if (!host) return [];
    return qa('.text-page-file-block', host).map(block => {
      const meta = fileMetaFromBlock(block);
      const platform = normalizePlatform(q('.text-page-file-platform', block)?.value);
      return normalizeFile({
        ...meta,
        platform,
        version: q('.text-page-file-version', block)?.value.trim() || '',
        minimum: q('.text-page-file-minimum', block)?.value.trim() || '',
        architecture: q('.text-page-file-architecture', block)?.value || '',
        requirements: q('.text-page-file-requirements', block)?.value.trim() || '',
        label: PLATFORM_CONFIG[platform].downloadLabel
      });
    });
  }

  function validateFiles(files) {
    for (let index = 0; index < files.length; index += 1) {
      const item = files[index];
      if (!item.version) return `Файл ${index + 1}: укажи версию.`;
      if (!item.assetId || !item.url) return `Файл ${index + 1}: сначала загрузи файл в GitHub Releases.`;
      if (item.uploadedPlatform !== item.platform || item.uploadedVersion !== item.version) {
        return `Файл ${index + 1}: после изменения платформы или версии загрузи файл заново.`;
      }
    }
    return '';
  }

  function renderFiles(files) {
    const host = q('#text-page-file-blocks');
    if (!host) return;
    host.replaceChildren();
    (files || []).forEach(file => host.appendChild(createFileBlock(file)));
    const empty = q('#text-page-file-blocks-empty');
    if (empty) empty.hidden = host.children.length > 0;
  }

  function ensureUi() {
    const actions = q('#text-page-block-actions');
    const extraEmpty = q('#text-page-extra-blocks-empty');
    if (!actions || !extraEmpty) return false;

    if (!q('#text-page-add-file-block')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'text-page-add-file-block';
      button.textContent = '+ Добавить файл';
      actions.appendChild(button);
      button.addEventListener('click', () => {
        const host = q('#text-page-file-blocks');
        if (!host) return;
        const block = createFileBlock();
        host.appendChild(block);
        q('#text-page-file-blocks-empty').hidden = true;
        block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }

    if (!q('#text-page-file-blocks')) {
      const host = document.createElement('div');
      host.id = 'text-page-file-blocks';
      host.className = 'text-page-file-blocks';
      const empty = document.createElement('div');
      empty.id = 'text-page-file-blocks-empty';
      empty.className = 'text-page-file-blocks-empty';
      empty.textContent = 'Файлов приложения пока нет.';
      extraEmpty.insertAdjacentElement('afterend', host);
      host.insertAdjacentElement('afterend', empty);

      host.addEventListener('change', event => {
        const block = event.target.closest('.text-page-file-block');
        if (!block) return;
        if (event.target.matches('.text-page-file-platform')) syncPlatformFields(block, false);
        if (event.target.matches('.text-page-file-version')) refreshUploadButton(block);
      });
      host.addEventListener('input', event => {
        const block = event.target.closest('.text-page-file-block');
        if (block && event.target.matches('.text-page-file-version')) refreshUploadButton(block);
      });
      host.addEventListener('click', event => handleFileBlockClick(event));
    }

    if (!q('#text-page-release-file-input')) {
      const input = document.createElement('input');
      input.id = 'text-page-release-file-input';
      input.type = 'file';
      input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener('change', () => selectLocalFile(input.files?.[0]));
    }
    return true;
  }

  function validateSelectedFile(block, file) {
    if (!file) return 'Файл не выбран.';
    if (file.size > MAX_FILE_BYTES) return 'Файл слишком большой для загрузки через Bibika. Максимум 90 МБ.';
    const platform = normalizePlatform(q('.text-page-file-platform', block)?.value);
    if (!PLATFORM_CONFIG[platform].extensions.test(file.name)) {
      return `Для платформы «${PLATFORM_CONFIG[platform].label}» выбран неподходящий формат файла.`;
    }
    return '';
  }

  function selectLocalFile(file) {
    const block = activeFileBlock;
    activeFileBlock = null;
    if (!block) return;
    const state = q('.text-page-file-state', block);
    const error = validateSelectedFile(block, file);
    if (error) {
      block._selectedFile = null;
      q('.text-page-file-selected', block).textContent = 'Файл не выбран';
      state.textContent = error;
      refreshUploadButton(block);
      return;
    }
    block._selectedFile = file;
    q('.text-page-file-selected', block).textContent = `${file.name} · ${formatBytes(file.size)}`;
    state.textContent = 'Файл готов к загрузке.';
    refreshUploadButton(block);
  }

  function markAssetForDeletion(assetId) {
    const id = Number(assetId || 0);
    if (!id) return;
    if (currentDialogAssets.has(id)) {
      currentDialogAssets.delete(id);
      sessionAssets.delete(id);
      cleanupAssets([id]);
      return;
    }
    pendingExistingDeletes.add(id);
    currentDialogPendingDeletes.add(id);
  }

  async function uploadSelectedFile(block) {
    const file = block._selectedFile;
    const state = q('.text-page-file-state', block);
    const sourceError = validateSelectedFile(block, file);
    if (sourceError) { state.textContent = sourceError; return; }
    const pageId = currentId();
    const title = currentTitle();
    const platform = normalizePlatform(q('.text-page-file-platform', block)?.value);
    const version = q('.text-page-file-version', block)?.value.trim() || '';
    if (!pageId) { state.textContent = 'Сначала укажи адрес страницы.'; return; }
    if (!version) { state.textContent = 'Сначала укажи версию.'; return; }

    const uploadButton = q('.text-page-file-upload-button', block);
    uploadButton.disabled = true;
    uploadButton.textContent = 'Загрузка…';
    state.textContent = 'Создаю или открываю GitHub Release и загружаю файл…';

    try {
      const response = await fetch(RELEASE_UPLOAD_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Bibika-Page': pageId,
          'X-Bibika-Title': encodeURIComponent(title),
          'X-Bibika-Platform': platform,
          'X-Bibika-Version': encodeURIComponent(version),
          'X-Bibika-File-Name': encodeURIComponent(file.name)
        },
        body: file
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);

      const oldMeta = fileMetaFromBlock(block);
      if (oldMeta.assetId) markAssetForDeletion(oldMeta.assetId);

      const next = normalizeFile({
        platform,
        version,
        minimum: q('.text-page-file-minimum', block)?.value.trim() || '',
        architecture: q('.text-page-file-architecture', block)?.value || '',
        requirements: q('.text-page-file-requirements', block)?.value.trim() || '',
        label: PLATFORM_CONFIG[platform].downloadLabel,
        fileName: result.fileName,
        fileSize: result.fileSize || file.size,
        contentType: result.contentType || file.type,
        url: result.url,
        releaseTag: result.releaseTag,
        releaseId: result.releaseId,
        assetId: result.assetId,
        uploadedAt: new Date().toISOString(),
        uploadedPlatform: platform,
        uploadedVersion: version
      });
      setFileMeta(block, next);
      sessionAssets.set(next.assetId, next);
      currentDialogAssets.add(next.assetId);
      block._selectedFile = null;
      q('.text-page-file-selected', block).textContent = next.fileName;
      state.textContent = `Загружено в GitHub Releases · ${formatBytes(next.fileSize)}`;
    } catch (error) {
      state.textContent = `Не удалось загрузить: ${error.message}`;
    }

    uploadButton.textContent = 'Загрузить в GitHub Releases';
    refreshUploadButton(block);
  }

  function handleFileBlockClick(event) {
    const block = event.target.closest('.text-page-file-block');
    if (!block) return;
    if (event.target.closest('.text-page-file-delete')) {
      const meta = fileMetaFromBlock(block);
      if (meta.assetId) markAssetForDeletion(meta.assetId);
      block.remove();
      const host = q('#text-page-file-blocks');
      q('#text-page-file-blocks-empty').hidden = !!host?.children.length;
      return;
    }
    if (event.target.closest('.text-page-file-choose')) {
      activeFileBlock = block;
      const input = q('#text-page-release-file-input');
      input.accept = PLATFORM_CONFIG[normalizePlatform(q('.text-page-file-platform', block)?.value)].accept;
      input.value = '';
      input.click();
      return;
    }
    if (event.target.closest('.text-page-file-upload-button')) uploadSelectedFile(block);
  }

  function populateDialog() {
    if (!ensureUi()) return;
    const overlay = q('#header-page-create-overlay');
    if (!overlay?.classList.contains('open')) return;
    if ((q('#header-page-content-type')?.value || 'text') !== 'text') return;
    const host = q('#text-page-file-blocks');
    const id = currentId();
    const token = id || '__new__';
    if (host.dataset.loadedId === token) return;
    host.dataset.loadedId = token;
    currentDialogAssets.clear();
    currentDialogPendingDeletes.clear();
    keepCurrentDialogChanges = false;
    renderFiles(drafts.get(id) || known.get(id) || []);
  }

  function captureDraft(event) {
    if ((q('#header-page-content-type')?.value || 'text') !== 'text') return;
    const id = currentId();
    if (!id) return;
    const files = collectFiles();
    const validation = validateFiles(files);
    if (validation) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const state = q('#header-page-create-state');
      if (state) state.textContent = validation;
      return;
    }
    drafts.set(id, files.map(normalizeFile));
    keepCurrentDialogChanges = true;
    currentDialogAssets.clear();
    currentDialogPendingDeletes.clear();
  }

  function platformDisplay(item) {
    return PLATFORM_CONFIG[normalizePlatform(item.platform)].label;
  }

  function renderPreviewFile(item) {
    const file = normalizeFile(item);
    if (!file.url) return null;
    const section = document.createElement('section');
    section.className = 'managed-page-file-block managed-page-file-preview-block';
    const copy = document.createElement('div');
    copy.className = 'managed-page-file-copy';
    const heading = document.createElement('h3');
    heading.textContent = `${platformDisplay(file)}${file.version ? ` · v${file.version.replace(/^v/i, '')}` : ''}`;
    const meta = document.createElement('div');
    meta.className = 'managed-page-file-meta';
    [file.minimum, file.architecture && file.architecture !== 'Не указано' ? file.architecture : '', file.requirements].filter(Boolean).forEach(value => {
      const span = document.createElement('span');
      span.textContent = value;
      meta.appendChild(span);
    });
    const name = document.createElement('div');
    name.className = 'managed-page-file-name';
    name.textContent = [file.fileName, formatBytes(file.fileSize)].filter(Boolean).join(' · ');
    copy.append(heading, meta, name);
    const link = document.createElement('a');
    link.className = 'button button-primary';
    link.href = file.url;
    link.textContent = file.label || PLATFORM_CONFIG[file.platform].downloadLabel;
    link.dataset.bibikaPublic = 'true';
    section.append(copy, link);
    return section;
  }

  async function renderBibikaPreviewFiles() {
    if (!q('#managed-page-content')) return;
    const id = String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase();
    if (!id) return;
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      const page = (Array.isArray(data?.sitePages) ? data.sitePages : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (!page || page.type === 'categories') return;
      const files = normalizeFiles(page);
      if (!files.length) return;
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        const host = q('#managed-page-content');
        const firstPanel = q('.managed-text-panel', host);
        if (!firstPanel && attempts < 40) return;
        clearInterval(timer);
        qa('.managed-page-file-preview-block', host).forEach(node => node.remove());
        files.forEach(file => {
          const node = renderPreviewFile(file);
          if (node) host.appendChild(node);
        });
      }, 60);
    } catch {}
  }

  function bind() {
    const overlay = q('#header-page-create-overlay');
    if (!overlay) return;

    q('#header-page-create-confirm')?.addEventListener('click', captureDraft, true);
    q('#header-editor-cancel')?.addEventListener('click', cancelAllUnsavedReleaseChanges, true);
    q('#header-editor-close')?.addEventListener('click', cancelAllUnsavedReleaseChanges, true);

    const overlayObserver = new MutationObserver(() => {
      if (overlay.classList.contains('open')) {
        setTimeout(populateDialog, 0);
      } else {
        const host = q('#text-page-file-blocks');
        if (host) host.dataset.loadedId = '';
        if (!keepCurrentDialogChanges) rollbackCurrentDialog();
        currentDialogAssets.clear();
        currentDialogPendingDeletes.clear();
        keepCurrentDialogChanges = false;
      }
    });
    overlayObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });

    q('#header-page-content-type')?.addEventListener('change', () => {
      const host = q('#text-page-file-blocks');
      if (host) host.dataset.loadedId = '';
      setTimeout(populateDialog, 0);
    });

    const domObserver = new MutationObserver(() => {
      if (ensureUi() && overlay.classList.contains('open')) setTimeout(populateDialog, 0);
    });
    domObserver.observe(document.body, { childList: true, subtree: true });
    ensureUi();
  }

  ensureStyle('/text-page-files.css?v=1', 'text-page-files.css');
  const previousFetch = installFetchPatch();
  preload(previousFetch).finally(() => {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => { bind(); renderBibikaPreviewFiles(); }, { once: true });
    } else {
      bind();
      renderBibikaPreviewFiles();
    }
  });
})();
