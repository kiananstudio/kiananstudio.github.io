(() => {
  const STYLE_ID = 'bibika-release-sync-style';
  const PANEL_ID = 'release-sync-panel';

  function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = '/release-sync.css?v=1';
    document.head.appendChild(link);
  }

  function escapeText(value) {
    return String(value ?? '').trim();
  }

  function validRepository(value) {
    const repo = escapeText(value);
    return /^kiananstudio\/[A-Za-z0-9_.-]+$/i.test(repo) ? repo : '';
  }

  function suggestTag(product) {
    const id = escapeText(product?.id || document.getElementById('f-id')?.value || 'app') || 'app';
    const version = escapeText(product?.version || document.getElementById('f-version')?.value || '1.0.0') || '1.0.0';
    return `${id}-v${version.replace(/^v/i, '')}`;
  }

  function releaseVersion(tag) {
    const value = escapeText(tag);
    const match = value.match(/(?:^|-)v?(\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?)$/i);
    return match ? match[1] : value.replace(/^v/i, '');
  }

  function inferPlatform(filename) {
    const name = String(filename || '').toLowerCase();
    if (name.endsWith('.apk') || /android/.test(name)) return 'android';
    if (name.endsWith('.dmg') || name.endsWith('.pkg') || /macos|mac-os|osx/.test(name)) return 'macos';
    if (name.endsWith('.exe') || name.endsWith('.msi') || /windows|win64|win32/.test(name)) return 'windows';
    if (name.endsWith('.appimage') || name.endsWith('.deb') || name.endsWith('.rpm') || /linux/.test(name)) return 'linux';
    return 'other';
  }

  function inferArchitecture(filename, platform) {
    const name = String(filename || '').toLowerCase();
    if (platform === 'macos' && /universal/.test(name)) return 'universal';
    if (/arm64|aarch64|apple[-_ ]?silicon/.test(name)) return 'arm64';
    if (/x86[_-]?64|amd64|x64/.test(name)) return 'x64';
    if (/x86|win32|i386|i686/.test(name)) return 'x86';
    return '';
  }

  function setStatus(message, state = '') {
    const node = document.getElementById('release-sync-status');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function updateReleaseLinks() {
    const repo = validRepository(document.getElementById('f-release-repository')?.value);
    const tag = escapeText(document.getElementById('f-release-tag')?.value);
    const open = document.getElementById('release-open-github');
    if (!open) return;

    if (!repo) {
      open.removeAttribute('href');
      open.classList.add('button-disabled');
      return;
    }

    const title = escapeText(document.getElementById('f-title')?.value);
    const params = new URLSearchParams();
    if (tag) params.set('tag', tag);
    if (title) params.set('title', `${title}${document.getElementById('f-version')?.value ? ` v${document.getElementById('f-version').value.replace(/^v/i, '')}` : ''}`);
    open.href = `https://github.com/${repo}/releases/new${params.size ? `?${params.toString()}` : ''}`;
    open.classList.remove('button-disabled');
  }

  function currentRowsByUrl() {
    const map = new Map();
    document.querySelectorAll('#downloads-editor .download-row').forEach((row) => {
      const url = escapeText(row.querySelector('.download-url')?.value);
      if (!url) return;
      map.set(url, {
        requirements: escapeText(row.querySelector('.download-requirement')?.value),
        label: escapeText(row.querySelector('.download-label')?.value),
        architecture: escapeText(row.querySelector('.download-architecture')?.value),
        version: escapeText(row.querySelector('.download-version')?.value),
        platform: escapeText(row.querySelector('.download-platform')?.value)
      });
    });
    return map;
  }

  function populateRowsFromAssets(assets, tag) {
    const editor = document.getElementById('downloads-editor');
    const addButton = document.getElementById('add-download');
    if (!editor || !addButton) throw new Error('Редактор файлов Bibika не найден.');

    const previous = currentRowsByUrl();
    editor.innerHTML = '';
    const version = releaseVersion(tag);

    for (const asset of assets) {
      addButton.click();
      const row = editor.lastElementChild;
      if (!row) continue;

      const old = previous.get(asset.browser_download_url) || {};
      const platform = old.platform || inferPlatform(asset.name);
      const platformSelect = row.querySelector('.download-platform');
      if (platformSelect) {
        platformSelect.value = platform;
        platformSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const architecture = old.architecture || inferArchitecture(asset.name, platform);
      const architectureSelect = row.querySelector('.download-architecture');
      if (architectureSelect && architecture) {
        const hasOption = [...architectureSelect.options].some(option => option.value === architecture);
        if (hasOption) architectureSelect.value = architecture;
      }

      const requirementInput = row.querySelector('.download-requirement');
      const versionInput = row.querySelector('.download-version');
      const labelInput = row.querySelector('.download-label');
      const urlInput = row.querySelector('.download-url');
      if (requirementInput) requirementInput.value = old.requirements || '';
      if (versionInput) versionInput.value = old.version || version;
      if (labelInput) labelInput.value = old.label || '';
      if (urlInput) urlInput.value = asset.browser_download_url || '';
    }
  }

  async function syncRelease() {
    const repo = validRepository(document.getElementById('f-release-repository')?.value);
    const tag = escapeText(document.getElementById('f-release-tag')?.value);
    const button = document.getElementById('release-sync-assets');

    if (!repo) {
      setStatus('Укажи репозиторий в формате kiananstudio/repository.', 'error');
      return;
    }
    if (!tag) {
      setStatus('Укажи тег GitHub Release.', 'error');
      return;
    }

    if (button) button.disabled = true;
    setStatus('Получаю файлы из GitHub Release…', 'busy');
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      });

      if (response.status === 404) {
        throw new Error('Release с таким тегом не найден. Черновик нужно сначала опубликовать на GitHub.');
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || `GitHub HTTP ${response.status}`);
      }

      const release = await response.json();
      const assets = Array.isArray(release.assets) ? release.assets.filter(asset => asset?.browser_download_url) : [];
      if (!assets.length) {
        setStatus('Release найден, но в нём пока нет загруженных файлов.', 'error');
        return;
      }

      populateRowsFromAssets(assets, release.tag_name || tag);
      setStatus(`Готово: получено файлов — ${assets.length}. Проверь платформы и системные требования, затем нажми «Сохранить изменения».`, 'ok');
    } catch (error) {
      setStatus(error.message || String(error), 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function installPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const repoInput = document.getElementById('f-release-repository');
    const repoField = repoInput?.closest('.field');
    if (!repoField) return;

    repoField.insertAdjacentHTML('afterend', `
      <div id="${PANEL_ID}" class="release-sync-panel">
        <div class="release-sync-head">
          <div>
            <h4>GitHub Release</h4>
            <p>Большие .exe, .dmg и .apk загружаются прямо на GitHub. Bibika затем сама получает ссылки на файлы.</p>
          </div>
        </div>
        <label class="field release-tag-field">
          <span>Тег Release</span>
          <input id="f-release-tag" placeholder="my-game-v1.0.0">
          <small>Для общего репозитория лучше использовать уникальный тег: ID продукта + версия.</small>
        </label>
        <div class="release-sync-actions">
          <a id="release-open-github" class="btn btn-secondary button-disabled" target="_blank" rel="noreferrer">Открыть GitHub и создать Release ↗</a>
          <button id="release-sync-assets" class="btn btn-secondary" type="button">Получить файлы из Release</button>
        </div>
        <p id="release-sync-status" class="release-sync-status">Сначала создай и опубликуй Release на GitHub, загрузив туда готовые файлы. Затем нажми «Получить файлы из Release».</p>
      </div>`);

    const tagInput = document.getElementById('f-release-tag');
    repoInput.addEventListener('input', updateReleaseLinks);
    tagInput.addEventListener('input', () => {
      tagInput.dataset.touched = '1';
      updateReleaseLinks();
    });
    document.getElementById('f-title')?.addEventListener('input', updateReleaseLinks);
    document.getElementById('f-version')?.addEventListener('input', () => {
      if (!tagInput.dataset.touched) tagInput.value = suggestTag();
      updateReleaseLinks();
    });
    document.getElementById('f-id')?.addEventListener('input', () => {
      if (!tagInput.dataset.touched) tagInput.value = suggestTag();
      updateReleaseLinks();
    });
    document.getElementById('release-sync-assets')?.addEventListener('click', syncRelease);
  }

  function installAppPatches() {
    if (typeof openEditor !== 'function' || typeof collectForm !== 'function') return;

    const originalOpenEditor = openEditor;
    openEditor = function patchedReleaseOpenEditor(index = null) {
      originalOpenEditor(index);
      const editing = Number.isInteger(index);
      const product = editing ? state.products[index] : null;
      const distribution = product?.distribution || {};
      const tagInput = document.getElementById('f-release-tag');
      if (tagInput) {
        tagInput.value = distribution.releaseTag || suggestTag(product);
        tagInput.dataset.touched = distribution.releaseTag ? '1' : '';
      }
      setStatus('Сначала создай и опубликуй Release на GitHub, загрузив туда готовые файлы. Затем нажми «Получить файлы из Release».');
      updateReleaseLinks();
    };

    const originalCollectForm = collectForm;
    collectForm = function patchedReleaseCollectForm() {
      const product = originalCollectForm();
      if (product.distribution?.type === 'github-releases') {
        product.distribution.releaseTag = escapeText(document.getElementById('f-release-tag')?.value);
      } else if (product.distribution) {
        product.distribution.releaseTag = '';
      }
      return product;
    };
  }

  function init() {
    ensureStylesheet();
    installPanel();
    installAppPatches();
    updateReleaseLinks();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
