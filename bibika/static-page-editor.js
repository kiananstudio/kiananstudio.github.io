(() => {
  const API_URL = '/api/catalog';
  const key = String(document.body?.dataset?.staticPage || '').trim().toLowerCase();
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  let catalog = null;
  let page = null;
  let saving = false;

  const FALLBACKS = {
    about: {
      eyebrow: 'About',
      heading: 'Kianan Studio',
      content: 'Kianan Studio creates practical digital products for game development — Unity tools, reusable 3D assets and original games. We focus on clear workflows, useful functionality and products that are easy to integrate into real projects.',
      buttonPosition: 'side',
      buttons: [
        { label: 'Unity Tools', href: 'category.html?category=unity-tools', style: 'primary' },
        { label: 'Contact', href: 'contact.html', style: 'secondary' }
      ]
    },
    contact: {
      eyebrow: 'Contact',
      heading: 'Support & business inquiries',
      content: 'For product support, feedback, collaboration or other inquiries, contact Kianan Studio.\n\nsupport@kiananstudio.com',
      buttonPosition: 'side',
      buttons: [
        { label: 'Email Kianan Studio', href: 'mailto:support@kiananstudio.com', style: 'primary' },
        { label: 'Unity Asset Store', href: 'https://assetstore.unity.com/packages/slug/398482', style: 'secondary' }
      ]
    }
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function normalizeButton(button) {
    return { label: String(button?.label || '').trim(), href: String(button?.href || '').trim(), style: button?.style === 'secondary' ? 'secondary' : 'primary' };
  }
  function normalizePage(value) {
    const fallback = FALLBACKS[key] || { eyebrow: key, heading: key, content: '', buttonPosition: 'side', buttons: [] };
    const source = value && typeof value === 'object' ? value : {};
    return {
      eyebrow: String(source.eyebrow ?? fallback.eyebrow).trim(),
      heading: String(source.heading ?? fallback.heading).trim(),
      content: String(source.content ?? fallback.content).trim(),
      buttonPosition: source.buttonPosition === 'bottom' ? 'bottom' : 'side',
      buttons: Array.isArray(source.buttons) ? source.buttons.map(normalizeButton).filter(item => item.label || item.href) : clone(fallback.buttons)
    };
  }

  function showToast(message, duration = 3200) {
    const toast = q('#bibika-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  async function fetchCatalog() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function safeHref(value) {
    const href = String(value || '').trim();
    if (!href || /^(javascript|data|vbscript):/i.test(href)) return '';
    return href;
  }

  function renderText(host, value) {
    host.replaceChildren();
    String(value || '').split(/\n{2,}/).map(item => item.trim()).filter(Boolean).forEach(chunk => {
      const p = document.createElement('p');
      p.textContent = chunk;
      host.appendChild(p);
    });
  }

  function renderPage() {
    if (!page) return;
    q('#static-page-eyebrow').textContent = page.eyebrow;
    q('#static-page-heading').textContent = page.heading;
    renderText(q('#static-page-text'), page.content);
    const actions = q('#static-page-actions');
    actions.replaceChildren();
    page.buttons.forEach(button => {
      const href = safeHref(button.href);
      if (!href) return;
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
    const panel = q('#static-page-panel');
    panel.classList.toggle('buttons-bottom', page.buttonPosition === 'bottom');
    panel.classList.toggle('buttons-side', page.buttonPosition !== 'bottom');
  }

  function createButtonRow(button = {}) {
    const item = normalizeButton(button);
    const row = document.createElement('div');
    row.className = 'static-editor-button-row';
    row.innerHTML = `
      <div class="static-editor-button-number"></div>
      <label class="static-editor-field"><span>Название кнопки</span><input class="static-editor-button-label" type="text" autocomplete="off" placeholder="Например, Contact"></label>
      <label class="static-editor-field"><span>Куда ведёт</span><input class="static-editor-button-href" type="text" autocomplete="off" placeholder="contact.html или https://..."></label>
      <label class="static-editor-field"><span>Цвет кнопки</span><select class="static-editor-button-style"><option value="primary">Синяя</option><option value="secondary">Тёмная</option></select></label>
      <div class="static-editor-button-actions"><button type="button" class="static-editor-button-up">↑</button><button type="button" class="static-editor-button-down">↓</button><button type="button" class="static-editor-button-delete">×</button></div>`;
    q('.static-editor-button-label', row).value = item.label;
    q('.static-editor-button-href', row).value = item.href;
    q('.static-editor-button-style', row).value = item.style;
    return row;
  }

  function renumberButtons() {
    const rows = qa('.static-editor-button-row', q('#static-editor-buttons-list'));
    rows.forEach((row, index) => {
      q('.static-editor-button-number', row).textContent = `${index + 1}`;
      q('.static-editor-button-up', row).disabled = index === 0;
      q('.static-editor-button-down', row).disabled = index === rows.length - 1;
    });
    q('#static-editor-buttons-empty').hidden = rows.length > 0;
  }

  function renderEditorButtons() {
    const host = q('#static-editor-buttons-list');
    host.replaceChildren();
    page.buttons.forEach(button => host.appendChild(createButtonRow(button)));
    renumberButtons();
  }

  function siteItems() {
    const fixed = [
      ['Home', './'], ['Unity Tools', 'category.html?category=unity-tools'], ['Games', 'category.html?category=games'], ['3D Assets', 'category.html?category=3d-assets'], ['About', 'about.html'], ['Contact', 'contact.html']
    ].map(([title, href]) => ({ title, href, badge: 'Существующая' }));
    const managed = (Array.isArray(catalog?.sitePages) ? catalog.sitePages : []).map(item => ({ title: String(item?.title || item?.id || '').trim(), href: `page.html?page=${encodeURIComponent(String(item?.id || '').trim())}`, badge: item?.type === 'categories' ? 'Категории' : 'Текст' })).filter(item => item.title);
    const products = (Array.isArray(catalog?.products) ? catalog.products : []).map(item => ({ title: String(item?.title || item?.id || '').trim(), href: String(item?.href || `product.html?id=${encodeURIComponent(item?.id || '')}`).trim(), badge: 'Продукт' })).filter(item => item.title && item.href);
    return [...fixed, ...managed, ...products];
  }

  function renderSitePages() {
    const host = q('#static-editor-site-pages-list');
    host.replaceChildren();
    siteItems().forEach(item => {
      const link = document.createElement('a');
      link.className = 'static-editor-site-link';
      link.href = item.href;
      const main = document.createElement('span');
      const title = document.createElement('strong');
      const path = document.createElement('span');
      title.textContent = item.title;
      path.textContent = item.href;
      main.append(title, path);
      const badge = document.createElement('em');
      badge.textContent = item.href === `${key}.html` ? 'Текущая' : item.badge;
      link.append(main, badge);
      host.appendChild(link);
    });
  }

  function ensureModal() {
    if (q('#static-page-editor-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'static-page-editor-overlay';
    overlay.className = 'static-page-editor-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <section class="static-page-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="static-page-editor-title">
        <div class="static-page-editor-head"><div><span class="static-page-editor-eyebrow">Редактирование страницы</span><h2 id="static-page-editor-title"></h2><p>Настраивай текст и стандартные кнопки страницы.</p></div><button type="button" class="static-page-editor-close" id="static-page-editor-close">×</button></div>
        <div class="static-page-editor-body">
          <section class="static-page-editor-section"><label class="static-editor-field"><span>Заголовок на странице</span><input id="static-editor-heading" type="text" autocomplete="off"></label><label class="static-editor-field"><span>Текст</span><textarea id="static-editor-content" rows="8"></textarea></label></section>
          <section class="static-page-editor-section"><label class="static-editor-field"><span>Расположение кнопок</span><select id="static-editor-position"><option value="side">Сбоку текста</option><option value="bottom">Внизу текста</option></select></label><div class="static-editor-buttons-head"><div><strong>Кнопки</strong><span>Доступны два стандартных цвета: синяя и тёмная.</span></div><button type="button" id="static-editor-add-button">+ Добавить кнопку</button></div><div id="static-editor-buttons-list" class="static-editor-buttons-list"></div><div id="static-editor-buttons-empty" class="static-editor-buttons-empty">Кнопок пока нет.</div></section>
          <section class="static-page-editor-section"><div class="static-editor-site-pages-head"><strong>Страницы сайта</strong><span>Готовые адреса для поля «Куда ведёт».</span></div><div id="static-editor-site-pages-list" class="static-editor-site-pages-list"></div></section>
        </div>
        <div class="static-page-editor-footer"><span id="static-page-editor-state"></span><div><button type="button" class="button button-secondary" id="static-page-editor-cancel">Отмена</button><button type="button" class="button button-primary" id="static-page-editor-save">Сохранить</button></div></div>
      </section>`;
    document.body.appendChild(overlay);
  }

  function openEditor() {
    if (saving || !page) return;
    q('#static-page-editor-title').textContent = page.eyebrow || key;
    q('#static-editor-heading').value = page.heading;
    q('#static-editor-content').value = page.content;
    q('#static-editor-position').value = page.buttonPosition;
    renderEditorButtons();
    renderSitePages();
    q('#static-page-editor-state').textContent = 'Изменения будут опубликованы на kiananstudio.com после сохранения.';
    const overlay = q('#static-page-editor-overlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeEditor() {
    if (saving) return;
    const overlay = q('#static-page-editor-overlay');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function collectPage() {
    return {
      eyebrow: page.eyebrow,
      heading: q('#static-editor-heading')?.value.trim() || '',
      content: q('#static-editor-content')?.value.trim() || '',
      buttonPosition: q('#static-editor-position')?.value === 'bottom' ? 'bottom' : 'side',
      buttons: qa('.static-editor-button-row', q('#static-editor-buttons-list')).map(row => ({
        label: q('.static-editor-button-label', row)?.value.trim() || '',
        href: q('.static-editor-button-href', row)?.value.trim() || '',
        style: q('.static-editor-button-style', row)?.value === 'secondary' ? 'secondary' : 'primary'
      })).filter(item => item.label || item.href)
    };
  }

  async function save() {
    if (saving) return;
    const next = collectPage();
    const state = q('#static-page-editor-state');
    if (!next.heading) { state.textContent = 'Укажи заголовок страницы.'; return; }
    for (let i = 0; i < next.buttons.length; i += 1) {
      const button = next.buttons[i];
      if (!button.label || !button.href) { state.textContent = `Заполни название и адрес кнопки ${i + 1}.`; return; }
      if (/^(javascript|data|vbscript):/i.test(button.href)) { state.textContent = `Кнопка ${i + 1}: этот тип ссылки запрещён.`; return; }
    }

    saving = true;
    const saveButton = q('#static-page-editor-save');
    saveButton.disabled = true;
    saveButton.textContent = 'Сохранение…';
    state.textContent = 'Публикую страницу в GitHub…';

    try {
      const latest = await fetchCatalog();
      latest.siteStaticPages = latest.siteStaticPages && typeof latest.siteStaticPages === 'object' ? latest.siteStaticPages : {};
      latest.siteStaticPages[key] = next;
      const response = await fetch(API_URL, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: latest, message: `Bibika: update ${key} page` }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      catalog = latest;
      page = normalizePage(next);
      renderPage();
      state.textContent = 'Страница сохранена и опубликована.';
      showToast('Страница сохранена в GitHub.');
      setTimeout(() => { saving = false; saveButton.disabled = false; saveButton.textContent = 'Сохранить'; closeEditor(); }, 500);
      return;
    } catch (error) {
      state.textContent = `Не удалось сохранить: ${error.message}`;
      showToast(`Ошибка сохранения: ${error.message}`, 4500);
    }
    saving = false;
    saveButton.disabled = false;
    saveButton.textContent = 'Сохранить';
  }

  function bind() {
    ensureModal();
    q('#edit-static-page')?.addEventListener('click', openEditor);
    q('#static-page-editor-close')?.addEventListener('click', closeEditor);
    q('#static-page-editor-cancel')?.addEventListener('click', closeEditor);
    q('#static-page-editor-save')?.addEventListener('click', save);
    q('#static-editor-add-button')?.addEventListener('click', () => { const row = createButtonRow(); q('#static-editor-buttons-list').appendChild(row); renumberButtons(); q('.static-editor-button-label', row)?.focus(); });
    q('#static-editor-buttons-list')?.addEventListener('click', event => {
      const row = event.target.closest('.static-editor-button-row');
      if (!row) return;
      if (event.target.closest('.static-editor-button-delete')) row.remove();
      else if (event.target.closest('.static-editor-button-up') && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      else if (event.target.closest('.static-editor-button-down') && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
      renumberButtons();
    });
    q('#static-page-editor-overlay')?.addEventListener('click', event => { if (event.target === q('#static-page-editor-overlay')) closeEditor(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && q('#static-page-editor-overlay')?.classList.contains('open')) closeEditor(); });
    q('#bibika-refresh')?.addEventListener('click', async () => { try { catalog = await fetchCatalog(); page = normalizePage(catalog?.siteStaticPages?.[key]); renderPage(); showToast('Страница обновлена из GitHub.'); } catch (error) { showToast(`Не удалось обновить: ${error.message}`, 4500); } });
  }

  async function init() {
    try { catalog = await fetchCatalog(); } catch { catalog = {}; }
    page = normalizePage(catalog?.siteStaticPages?.[key]);
    renderPage();
    bind();
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
