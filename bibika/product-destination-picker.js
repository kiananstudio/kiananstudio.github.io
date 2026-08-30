(() => {
  const API_URL = '/api/catalog';
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  let catalog = null;
  let pageItems = [];

  function slugify(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
  }

  function defaultProductHref(product) {
    const explicit = String(product?.href || '').trim();
    if (explicit) return explicit;
    const id = String(product?.id || '').trim();
    return id ? `product.html?id=${encodeURIComponent(id)}` : '';
  }

  function buildPageItems(data) {
    const fixed = [
      { group: 'Основные страницы', title: 'Home', href: './' },
      { group: 'Основные страницы', title: 'Unity Tools', href: 'category.html?category=unity-tools' },
      { group: 'Основные страницы', title: 'Games', href: 'category.html?category=games' },
      { group: 'Основные страницы', title: '3D Assets', href: 'category.html?category=3d-assets' },
      { group: 'Основные страницы', title: 'About', href: 'about.html' },
      { group: 'Основные страницы', title: 'Contact', href: 'contact.html' }
    ];
    const managed = (Array.isArray(data?.sitePages) ? data.sitePages : []).map(page => ({
      group: 'Страницы Bibika',
      title: String(page?.title || page?.id || '').trim(),
      href: `page.html?page=${encodeURIComponent(String(page?.id || '').trim())}`
    })).filter(item => item.title && item.href);
    const products = (Array.isArray(data?.products) ? data.products : []).map(product => ({
      group: 'Страницы продуктов',
      title: String(product?.title || product?.id || '').trim(),
      href: defaultProductHref(product)
    })).filter(item => item.title && item.href);
    return [...fixed, ...managed, ...products];
  }

  function sameHref(a, b) {
    const left = String(a || '').trim();
    const right = String(b || '').trim();
    if (left === right) return true;
    try {
      const base = 'https://kiananstudio.com/';
      return new URL(left, base).href === new URL(right, base).href;
    } catch {
      return false;
    }
  }

  function matchedPage(value) {
    return pageItems.find(item => sameHref(item.href, value)) || null;
  }

  function fillPageSelect(select, current, isNew) {
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Выбери страницу';
    select.appendChild(placeholder);

    if (isNew) {
      const self = document.createElement('option');
      self.value = '__self__';
      self.textContent = 'Страница этого продукта — создастся автоматически';
      select.appendChild(self);
    }

    const groups = new Map();
    pageItems.forEach(item => {
      let group = groups.get(item.group);
      if (!group) {
        group = document.createElement('optgroup');
        group.label = item.group;
        groups.set(item.group, group);
        select.appendChild(group);
      }
      const option = document.createElement('option');
      option.value = item.href;
      option.textContent = `${item.title} — ${item.href}`;
      group.appendChild(option);
    });

    if (current && current !== '__self__' && !pageItems.some(item => sameHref(item.href, current))) {
      const option = document.createElement('option');
      option.value = current;
      option.textContent = current;
      select.appendChild(option);
    }
    select.value = current || '';
  }

  function ensureStyles() {
    if (q('#product-destination-picker-style')) return;
    const style = document.createElement('style');
    style.id = 'product-destination-picker-style';
    style.textContent = `
      .category-page-product-href-source{display:none!important}
      .category-page-product-destination{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px}
      .category-page-product-destination select,.category-page-product-destination input{width:100%;min-width:0;border:1px solid rgba(127,175,213,.2);border-radius:10px;background:#081018;color:#f4f7fa;padding:10px 11px;outline:none;font:inherit}
      .category-page-product-destination select:focus,.category-page-product-destination input:focus{border-color:rgba(66,196,255,.55)}
      @media(max-width:900px){.category-page-product-destination{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function selfHref(row) {
    const title = q('.category-page-product-title', row)?.value || '';
    const id = slugify(title);
    return id ? `product.html?id=${encodeURIComponent(id)}` : '';
  }

  function syncSource(row) {
    const source = q('.category-page-product-href', row);
    const mode = q('.category-page-product-destination-mode', row)?.value || 'page';
    const pageSelect = q('.category-page-product-destination-page', row);
    const linkInput = q('.category-page-product-destination-link', row);
    if (!source || !pageSelect || !linkInput) return;

    const value = mode === 'page'
      ? (pageSelect.value === '__self__' ? selfHref(row) : pageSelect.value)
      : linkInput.value.trim();
    source.value = value;
    source.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function syncModeUi(row) {
    const mode = q('.category-page-product-destination-mode', row)?.value || 'page';
    const pageSelect = q('.category-page-product-destination-page', row);
    const linkInput = q('.category-page-product-destination-link', row);
    if (!pageSelect || !linkInput) return;
    pageSelect.hidden = mode !== 'page';
    linkInput.hidden = mode !== 'link';
    syncSource(row);
  }

  function enhanceRow(row) {
    if (!catalog || !row || row.dataset.destinationPickerReady === '1') return;
    const field = q('.category-page-product-href-field', row);
    const source = q('.category-page-product-href', row);
    if (!field || !source) return;

    row.dataset.destinationPickerReady = '1';
    source.classList.add('category-page-product-href-source');
    const current = String(source.value || '').trim();
    const isNew = row.classList.contains('category-page-product-row-new');
    const matched = matchedPage(current);

    const wrap = document.createElement('div');
    wrap.className = 'category-page-product-destination';

    const mode = document.createElement('select');
    mode.className = 'category-page-product-destination-mode';
    mode.innerHTML = '<option value="page">Страница сайта</option><option value="link">Ссылка</option>';

    const pageSelect = document.createElement('select');
    pageSelect.className = 'category-page-product-destination-page';

    const linkInput = document.createElement('input');
    linkInput.type = 'text';
    linkInput.className = 'category-page-product-destination-link';
    linkInput.autocomplete = 'off';
    linkInput.placeholder = 'Вставь ссылку, например https://...';

    let pageValue = '';
    let initialMode = 'link';
    if (matched) {
      initialMode = 'page';
      pageValue = matched.href;
    } else if (!current && isNew) {
      initialMode = 'page';
      pageValue = '__self__';
    } else {
      linkInput.value = current;
    }

    fillPageSelect(pageSelect, pageValue, isNew);
    mode.value = initialMode;
    wrap.append(mode, pageSelect, linkInput);
    field.appendChild(wrap);

    mode.addEventListener('change', () => syncModeUi(row));
    pageSelect.addEventListener('change', () => syncSource(row));
    linkInput.addEventListener('input', () => syncSource(row));
    q('.category-page-product-title', row)?.addEventListener('input', () => {
      if (mode.value === 'page' && pageSelect.value === '__self__') syncSource(row);
    });

    syncModeUi(row);
  }

  function scan(root = document) {
    if (root instanceof Element && root.matches('.category-page-product-row-fields')) enhanceRow(root);
    root.querySelectorAll?.('.category-page-product-row-fields').forEach(enhanceRow);
  }

  async function loadCatalog() {
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return;
      catalog = await response.json();
      pageItems = buildPageItems(catalog);
      scan();
    } catch {}
  }

  function bind() {
    ensureStyles();
    loadCatalog();
    scan();

    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node instanceof Element) scan(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    q('#bibika-refresh')?.addEventListener('click', () => setTimeout(loadCatalog, 120));
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
