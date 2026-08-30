(() => {
  const DATA_URL = 'data/products.json';
  const q = selector => document.querySelector(selector);
  const PLATFORM_LABELS = { android: 'Android', windows: 'Windows', macos: 'macOS', linux: 'Linux', ios: 'iOS', other: 'Download' };
  const DEFAULT_LABELS = { android: 'Download APK', windows: 'Download for Windows', macos: 'Download for macOS', linux: 'Download for Linux', ios: 'Download for iOS', other: 'Download file' };

  function pageId() {
    return String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase();
  }

  function normalizeFile(item) {
    const platform = PLATFORM_LABELS[item?.platform] ? item.platform : 'other';
    return {
      platform,
      version: String(item?.version || '').trim(),
      minimum: String(item?.minimum || '').trim(),
      architecture: String(item?.architecture || '').trim(),
      requirements: String(item?.requirements || '').trim(),
      label: String(item?.label || DEFAULT_LABELS[platform]).trim() || DEFAULT_LABELS[platform],
      fileName: String(item?.fileName || '').trim(),
      fileSize: Number(item?.fileSize || 0) || 0,
      url: String(item?.url || '').trim(),
      assetId: Number(item?.assetId || 0) || 0
    };
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!value) return '';
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    if (value >= 1024) return `${Math.round(value / 1024)} KB`;
    return `${value} B`;
  }

  function minimumDisplay(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return /^(min(?:imum)?\b)/i.test(text) ? text : `Min ${text}`;
  }

  function safeUrl(value) {
    const url = String(value || '').trim();
    return /^https:\/\/github\.com\//i.test(url) || /^https:\/\/objects\.githubusercontent\.com\//i.test(url) ? url : '';
  }

  function renderFile(item) {
    const file = normalizeFile(item);
    const href = safeUrl(file.url);
    if (!href) return null;
    const section = document.createElement('section');
    section.className = 'managed-page-file-block';

    const copy = document.createElement('div');
    copy.className = 'managed-page-file-copy';
    const heading = document.createElement('h3');
    heading.textContent = `${PLATFORM_LABELS[file.platform]}${file.version ? ` · v${file.version.replace(/^v/i, '')}` : ''}`;
    const meta = document.createElement('div');
    meta.className = 'managed-page-file-meta';
    [minimumDisplay(file.minimum), file.architecture && file.architecture !== 'Не указано' ? file.architecture : '', file.requirements].filter(Boolean).forEach(value => {
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
    link.href = href;
    link.textContent = file.label;
    link.rel = 'noopener';
    section.append(copy, link);
    return section;
  }

  function appendFiles(page) {
    const host = q('#managed-page-content');
    if (!host || page?.type === 'categories') return;
    const files = Array.isArray(page?.files) ? page.files.map(normalizeFile).filter(item => item.assetId && item.url) : [];
    if (!files.length) return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const first = q('.managed-text-panel', host);
      if (!first && attempts < 40) return;
      clearInterval(timer);
      host.querySelectorAll('.managed-page-file-block').forEach(node => node.remove());
      files.forEach(file => {
        const node = renderFile(file);
        if (node) host.appendChild(node);
      });
    }, 60);
  }

  fetch(DATA_URL, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(data => {
      const id = pageId();
      const page = (Array.isArray(data?.sitePages) ? data.sitePages : []).find(item => String(item?.id || '').toLowerCase() === id);
      if (page) appendFiles(page);
    })
    .catch(() => {});
})();
