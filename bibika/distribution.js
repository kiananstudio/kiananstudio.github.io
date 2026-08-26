(() => {
  const STYLE_ID = 'bibika-distribution-style';
  const SECTION_ID = 'distribution-section';

  const platformNames = {
    windows: 'Windows',
    macos: 'macOS',
    android: 'Android',
    linux: 'Linux',
    other: 'Другая платформа'
  };

  const platformConfigs = {
    windows: {
      showArchitecture: true,
      architectures: [
        ['', 'Не указана'],
        ['x64', 'x64'],
        ['arm64', 'ARM64'],
        ['x86', 'x86']
      ],
      requirementLabel: 'Минимальная Windows',
      requirementPlaceholder: 'Windows 10',
      requirementHint: 'Минимальная поддерживаемая версия Windows.',
      buttonPlaceholder: 'Скачать для Windows'
    },
    macos: {
      showArchitecture: true,
      architectures: [
        ['universal', 'Universal'],
        ['arm64', 'Apple Silicon (ARM64)'],
        ['x64', 'Intel (x64)']
      ],
      requirementLabel: 'Минимальная macOS',
      requirementPlaceholder: 'macOS 12',
      requirementHint: 'Минимальная поддерживаемая версия macOS.',
      buttonPlaceholder: 'Скачать для macOS'
    },
    android: {
      showArchitecture: false,
      architectures: [['', 'Не используется']],
      requirementLabel: 'Минимальная версия Android',
      requirementPlaceholder: 'Android 8.0',
      requirementHint: 'Обычно достаточно одного APK: укажи минимальную версию Android, с которой работает сборка.',
      buttonPlaceholder: 'Скачать APK для Android'
    },
    linux: {
      showArchitecture: true,
      architectures: [
        ['', 'Не указана'],
        ['x64', 'x64'],
        ['arm64', 'ARM64']
      ],
      requirementLabel: 'Системные требования',
      requirementPlaceholder: 'Ubuntu 22.04+ / compatible',
      requirementHint: 'Для Linux лучше указывать дистрибутив или минимальные системные требования.',
      buttonPlaceholder: 'Скачать для Linux'
    },
    other: {
      showArchitecture: false,
      architectures: [['', 'Не используется']],
      requirementLabel: 'Системные требования',
      requirementPlaceholder: 'Укажи требования к системе',
      requirementHint: 'Необязательное поле.',
      buttonPlaceholder: 'Скачать'
    }
  };

  function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = '/distribution.css?v=2';
    document.head.appendChild(link);
  }

  function escapeAttr(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function architectureOptions(platform, selectedValue = '') {
    const config = platformConfigs[platform] || platformConfigs.other;
    const values = new Set(config.architectures.map(([value]) => value));
    const options = [...config.architectures];
    if (selectedValue && !values.has(selectedValue)) options.push([selectedValue, selectedValue]);
    return options
      .map(([value, label]) => `<option value="${escapeAttr(value)}"${selectedValue === value ? ' selected' : ''}>${escapeAttr(label)}</option>`)
      .join('');
  }

  function updateDownloadRowForPlatform(row, { preserveArchitecture = true } = {}) {
    if (!row) return;
    const platform = row.querySelector('.download-platform')?.value || 'other';
    const config = platformConfigs[platform] || platformConfigs.other;
    const architectureField = row.querySelector('.download-architecture-field');
    const architectureSelect = row.querySelector('.download-architecture');
    const oldArchitecture = preserveArchitecture ? (architectureSelect?.value || '') : '';

    if (architectureSelect) {
      architectureSelect.innerHTML = architectureOptions(platform, oldArchitecture);
      if (!config.showArchitecture) architectureSelect.value = '';
    }
    if (architectureField) architectureField.hidden = !config.showArchitecture;

    const requirementLabel = row.querySelector('.download-requirement-label');
    const requirementInput = row.querySelector('.download-requirement');
    const requirementHint = row.querySelector('.download-requirement-hint');
    const labelInput = row.querySelector('.download-label');

    if (requirementLabel) requirementLabel.textContent = config.requirementLabel;
    if (requirementInput) requirementInput.placeholder = config.requirementPlaceholder;
    if (requirementHint) requirementHint.textContent = config.requirementHint;
    if (labelInput) labelInput.placeholder = `${config.buttonPlaceholder} — необязательно`;
  }

  function addDownloadRow(download = {}) {
    const list = document.getElementById('downloads-editor');
    if (!list) return;

    const platform = platformNames[download.platform] ? download.platform : 'windows';
    const row = document.createElement('div');
    row.className = 'download-row';
    row.innerHTML = `
      <div class="download-row-main">
        <label class="field download-field">
          <span>Платформа</span>
          <select class="download-platform">
            ${Object.entries(platformNames).map(([value, label]) => `<option value="${value}"${platform === value ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
        <label class="field download-field download-architecture-field">
          <span>Архитектура</span>
          <select class="download-architecture"></select>
        </label>
        <label class="field download-field download-requirement-field">
          <span class="download-requirement-label">Системные требования</span>
          <input class="download-requirement" value="${escapeAttr(download.requirements || download.minOs || '')}">
          <small class="download-requirement-hint"></small>
        </label>
        <label class="field download-field">
          <span>Версия приложения</span>
          <input class="download-version" placeholder="1.0.0" value="${escapeAttr(download.version || '')}">
        </label>
      </div>
      <label class="field">
        <span>Название кнопки <small class="inline-optional">необязательно</small></span>
        <input class="download-label" value="${escapeAttr(download.label || '')}">
        <small>Если оставить пустым, сайт сам сформирует название кнопки по выбранной платформе.</small>
      </label>
      <label class="field">
        <span>Ссылка на файл в GitHub Releases</span>
        <input class="download-url" type="url" placeholder="https://github.com/owner/repo/releases/download/v1.0.0/file.exe" value="${escapeAttr(download.url || '')}">
        <small>Разрешены только прямые ссылки вида github.com/.../releases/download/...</small>
      </label>
      <div class="download-row-actions">
        <button type="button" class="btn btn-small btn-ghost move-download-up" title="Переместить выше">↑ Выше</button>
        <button type="button" class="btn btn-small btn-ghost move-download-down" title="Переместить ниже">↓ Ниже</button>
        <button type="button" class="btn btn-small btn-danger remove-download">Удалить</button>
      </div>`;

    list.appendChild(row);
    const architectureSelect = row.querySelector('.download-architecture');
    if (architectureSelect) architectureSelect.dataset.initialValue = download.architecture || '';
    updateDownloadRowForPlatform(row, { preserveArchitecture: false });
    if (architectureSelect && (platformConfigs[platform] || platformConfigs.other).showArchitecture) {
      architectureSelect.innerHTML = architectureOptions(platform, download.architecture || '');
      architectureSelect.value = download.architecture || architectureSelect.options[0]?.value || '';
    }
  }

  function fillDownloads(downloads = []) {
    const list = document.getElementById('downloads-editor');
    if (!list) return;
    list.innerHTML = '';
    downloads.forEach(addDownloadRow);
  }

  function setDistributionMode(mode) {
    const value = ['external', 'github-releases', 'none'].includes(mode) ? mode : 'external';
    const modeSelect = document.getElementById('f-distribution-type');
    const external = document.getElementById('distribution-external-fields');
    const externalTitle = document.getElementById('distribution-external-title');
    const github = document.getElementById('distribution-github-fields');
    if (modeSelect) modeSelect.value = value;
    if (external) external.hidden = value !== 'external';
    if (externalTitle) externalTitle.hidden = value !== 'external';
    if (github) github.hidden = value !== 'github-releases';
  }

  function installSection() {
    if (document.getElementById(SECTION_ID)) return;

    const primaryLabel = document.getElementById('f-primary-label');
    const originalSection = primaryLabel?.closest('.form-section');
    if (!originalSection) return;

    originalSection.id = SECTION_ID;
    const heading = originalSection.querySelector('h3');
    if (heading) heading.textContent = 'Дистрибуция';

    const originalGrid = primaryLabel.closest('.field-grid');
    if (!originalGrid) return;
    originalGrid.id = 'distribution-external-fields';
    originalGrid.insertAdjacentHTML('beforebegin', `
      <label class="field">
        <span>Способ распространения</span>
        <select id="f-distribution-type">
          <option value="external">Магазин / внешняя площадка</option>
          <option value="github-releases">Прямое скачивание — GitHub Releases</option>
          <option value="none">Без кнопки скачивания</option>
        </select>
        <small>Unity-инструменты и 3D-ассеты оставляем на Asset Store. Готовые приложения и игры можно раздавать через GitHub Releases.</small>
      </label>`);

    originalGrid.insertAdjacentHTML('beforebegin', '<div id="distribution-external-title" class="distribution-subtitle">Основная площадка</div>');
    originalGrid.querySelector('label:first-child > span').textContent = 'Текст кнопки';
    originalGrid.querySelector('label:last-child > span').textContent = 'Ссылка на площадку';

    originalGrid.insertAdjacentHTML('afterend', `
      <div id="distribution-github-fields" hidden>
        <label class="field">
          <span>Репозиторий GitHub Releases</span>
          <input id="f-release-repository" placeholder="kiananstudio/my-game">
          <small>Только owner/repository. Исходный код игры хранить здесь не требуется.</small>
        </label>
        <div class="section-line compact distribution-download-head">
          <div>
            <h4>Файлы для скачивания</h4>
            <p>.exe, .dmg, .apk, .zip и другие готовые сборки. Сами файлы должны находиться только в GitHub Releases.</p>
          </div>
          <button type="button" class="btn btn-small btn-secondary" id="add-download">+ Добавить файл</button>
        </div>
        <div id="downloads-editor" class="downloads-list"></div>
      </div>`);

    document.getElementById('f-distribution-type').addEventListener('change', (event) => {
      setDistributionMode(event.target.value);
      if (event.target.value === 'github-releases' && !document.querySelector('#downloads-editor .download-row')) addDownloadRow();
    });

    document.getElementById('add-download').addEventListener('click', () => addDownloadRow());
    document.getElementById('downloads-editor').addEventListener('change', (event) => {
      if (!event.target.matches('.download-platform')) return;
      updateDownloadRowForPlatform(event.target.closest('.download-row'), { preserveArchitecture: false });
    });
    document.getElementById('downloads-editor').addEventListener('click', (event) => {
      const row = event.target.closest('.download-row');
      if (!row) return;
      if (event.target.closest('.remove-download')) row.remove();
      if (event.target.closest('.move-download-up') && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      if (event.target.closest('.move-download-down') && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
    });
  }

  function collectDownloads() {
    return [...document.querySelectorAll('#downloads-editor .download-row')]
      .map((row) => {
        const platform = row.querySelector('.download-platform')?.value || 'other';
        const config = platformConfigs[platform] || platformConfigs.other;
        return {
          platform,
          architecture: config.showArchitecture ? (row.querySelector('.download-architecture')?.value || '') : '',
          requirements: row.querySelector('.download-requirement')?.value.trim() || '',
          version: row.querySelector('.download-version')?.value.trim() || '',
          label: row.querySelector('.download-label')?.value.trim() || '',
          url: row.querySelector('.download-url')?.value.trim() || ''
        };
      })
      .filter((item) => item.url || item.label || item.version || item.requirements);
  }

  function installAppPatches() {
    if (typeof openEditor !== 'function' || typeof collectForm !== 'function') return;

    const originalOpenEditor = openEditor;
    openEditor = function patchedOpenEditor(index = null) {
      originalOpenEditor(index);
      const editing = Number.isInteger(index);
      const product = editing ? state.products[index] : null;
      const distribution = product?.distribution || {};
      const inferredType = distribution.type || 'external';
      setDistributionMode(inferredType);
      document.getElementById('f-release-repository').value = distribution.repository || '';
      fillDownloads(Array.isArray(distribution.downloads) ? distribution.downloads : []);
      if (inferredType === 'github-releases' && !distribution.downloads?.length) addDownloadRow();
    };

    const originalCollectForm = collectForm;
    collectForm = function patchedCollectForm() {
      const product = originalCollectForm();
      const type = document.getElementById('f-distribution-type')?.value || 'external';
      product.distribution = {
        type,
        repository: type === 'github-releases' ? (document.getElementById('f-release-repository')?.value.trim() || '') : '',
        downloads: type === 'github-releases' ? collectDownloads() : []
      };

      if (type === 'none') product.links = { primaryLabel: '', primaryUrl: '' };
      return product;
    };
  }

  window.addEventListener('DOMContentLoaded', () => {
    ensureStylesheet();
    installSection();
    installAppPatches();
    setDistributionMode('external');
  });
})();
