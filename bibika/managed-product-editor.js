(() => {
  const API_URL = '/api/catalog';
  const MANAGED_CATEGORIES = new Set(['unity-tools', '3d-assets']);
  const drafts = new Map();
  let catalogCache = null;
  let loading = false;

  const q = (selector, root = document) => root.querySelector(selector);

  function currentId() {
    return String(q('#header-page-id')?.value || new URLSearchParams(location.search).get('page') || '')
      .trim().toLowerCase();
  }

  function isCatalogUrl(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      return new URL(raw, location.href).pathname === '/api/catalog';
    } catch {
      return false;
    }
  }

  function productFor(data, id = currentId()) {
    return (Array.isArray(data?.products) ? data.products : [])
      .find(product => String(product?.id || '').toLowerCase() === id && MANAGED_CATEGORIES.has(String(product?.category || '')));
  }

  function ensureUi() {
    if (q('#managed-product-store-editor')) return q('#managed-product-store-editor');
    const actions = q('#text-page-block-actions');
    if (!actions?.parentElement) return null;

    const section = document.createElement('section');
    section.id = 'managed-product-store-editor';
    section.className = 'managed-product-store-editor';
    section.hidden = true;
    section.innerHTML = `
      <div class="managed-product-store-head">
        <div>
          <strong>Unity Asset Store</strong>
          <span>Параметры продукта для Unity Tools и 3D Assets.</span>
        </div>
      </div>
      <div class="managed-product-store-grid">
        <label class="header-editor-field"><span>Версия</span><input id="managed-product-version" type="text" maxlength="40" autocomplete="off" placeholder="Например, 1.0.0"></label>
        <label class="header-editor-field"><span>Статус</span><input id="managed-product-status" type="text" maxlength="80" autocomplete="off" placeholder="Например, Unity Asset Store"></label>
        <label class="header-editor-field managed-product-store-url"><span>Ссылка на Unity Asset Store</span><input id="managed-product-store-url" type="url" maxlength="500" autocomplete="off" placeholder="https://assetstore.unity.com/..."></label>
      </div>
      <p class="managed-product-store-note">Изображения добавляются обычной кнопкой «+ Добавить картинку». Отдельной галереи для этих продуктов нет.</p>`;
    actions.parentElement.insertBefore(section, actions);
    return section;
  }

  function setFileControlsVisible(visible) {
    const button = q('#text-page-add-file-block');
    const host = q('#text-page-file-blocks');
    const empty = q('#text-page-file-blocks-empty');
    if (button && button.hidden === visible) button.hidden = !visible;
    if (host && host.hidden === visible) host.hidden = !visible;
    const hideEmpty = !visible || !!host?.children.length;
    if (empty && empty.hidden !== hideEmpty) empty.hidden = hideEmpty;
  }

  function keepAssetMode() {
    if (!q('#header-page-create-overlay')?.classList.contains('open')) return;
    const id = currentId();
    if (productFor(catalogCache, id)) setFileControlsVisible(false);
  }

  function fill(product, id) {
    const section = ensureUi();
    if (!section) return;
    section.hidden = false;
    setFileControlsVisible(false);
    setTimeout(keepAssetMode, 60);
    setTimeout(keepAssetMode, 180);
    if (section.dataset.loadedId === id) return;
    section.dataset.loadedId = id;
    q('#managed-product-version').value = String(product?.version || '');
    q('#managed-product-status').value = String(product?.status || 'Unity Asset Store');
    q('#managed-product-store-url').value = String(product?.links?.primaryUrl || '');
  }

  function clearMode() {
    const section = ensureUi();
    if (section) {
      section.hidden = true;
      section.dataset.loadedId = '';
    }
    setFileControlsVisible(true);
  }

  async function loadCatalog() {
    if (loading) return;
    loading = true;
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (response.ok) catalogCache = await response.json();
    } catch {} finally {
      loading = false;
    }
  }

  async function refreshMode() {
    if (!q('#header-page-create-overlay')?.classList.contains('open')) return;
    if (!catalogCache) await loadCatalog();
    const id = currentId();
    const product = productFor(catalogCache, id);
    if (product) fill(product, id);
    else clearMode();
  }

  function safeStoreUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function captureDraft() {
    const id = currentId();
    if (!id || q('#managed-product-store-editor')?.hidden) return;
    drafts.set(id, {
      version: String(q('#managed-product-version')?.value || '').trim(),
      status: String(q('#managed-product-status')?.value || '').trim() || 'Unity Asset Store',
      url: safeStoreUrl(q('#managed-product-store-url')?.value)
    });
  }

  function syncStoreButton(page, url) {
    const buttons = Array.isArray(page?.buttons) ? page.buttons.map(button => ({ ...button })) : [];
    const index = buttons.findIndex(button => /asset\s*store/i.test(String(button?.label || '')));
    if (url) {
      const next = { label: 'View on Unity Asset Store', href: url, style: 'primary' };
      if (index >= 0) buttons[index] = next;
      else buttons.unshift(next);
    } else if (index >= 0) {
      buttons.splice(index, 1);
    }
    page.buttons = buttons;
  }

  function applyDrafts(payload) {
    const data = payload?.data;
    if (!data || !Array.isArray(data.products) || !Array.isArray(data.sitePages)) return;

    data.products.forEach(product => {
      const id = String(product?.id || '').trim().toLowerCase();
      if (!MANAGED_CATEGORIES.has(String(product?.category || ''))) return;
      const page = data.sitePages.find(item => String(item?.id || '').trim().toLowerCase() === id);
      if (!page) return;

      product.href = `page.html?page=${encodeURIComponent(id)}`;
      product.title = String(page.title || product.title || id).trim();
      product.shortDescription = String(page.content || product.shortDescription || '').trim();

      const draft = drafts.get(id);
      if (!draft) return;
      product.version = draft.version;
      product.status = draft.status;
      product.links = {
        ...(product.links || {}),
        primaryLabel: draft.url ? 'View on Unity Asset Store' : '',
        primaryUrl: draft.url
      };
      syncStoreButton(page, draft.url);
    });
  }

  function installFetchPatch() {
    const previousFetch = window.fetch.bind(window);
    window.fetch = async function managedProductFetch(input, init = {}) {
      let nextInit = init;
      let touched = false;
      const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      if (isCatalogUrl(input) && (method === 'POST' || method === 'PUT') && typeof init?.body === 'string') {
        try {
          const payload = JSON.parse(init.body);
          applyDrafts(payload);
          nextInit = { ...init, body: JSON.stringify(payload) };
          touched = true;
        } catch {}
      }
      const response = await previousFetch(input, nextInit);
      if (response.ok && touched) {
        drafts.clear();
        catalogCache = null;
      }
      return response;
    };
  }

  function bind() {
    installFetchPatch();
    loadCatalog();

    const overlay = q('#header-page-create-overlay');
    if (overlay) {
      new MutationObserver(() => {
        if (overlay.classList.contains('open')) setTimeout(refreshMode, 0);
        else clearMode();
      }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }

    document.addEventListener('click', event => {
      if (event.target.closest('#header-page-create-confirm')) captureDraft();
    }, true);

    q('#header-page-id')?.addEventListener('input', () => setTimeout(refreshMode, 0));

    new MutationObserver(() => {
      if (q('#header-page-create-overlay')?.classList.contains('open')) setTimeout(refreshMode, 0);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
