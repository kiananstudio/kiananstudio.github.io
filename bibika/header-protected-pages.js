(() => {
  const CATEGORY_PAGES = [
    { title: 'Unity Tools', path: 'category.html?category=unity-tools' },
    { title: 'Games', path: 'category.html?category=games' },
    { title: '3D Assets', path: 'category.html?category=3d-assets' }
  ];

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function addCategoryOptions(select) {
    if (!select) return;

    let group = [...select.querySelectorAll('optgroup')]
      .find((item) => item.label === 'Существующие страницы сайта');

    if (!group) {
      group = document.createElement('optgroup');
      group.label = 'Существующие страницы сайта';
      select.appendChild(group);
    }

    CATEGORY_PAGES.forEach((page) => {
      if ([...select.options].some((option) => option.value === page.path)) return;
      const option = document.createElement('option');
      option.value = page.path;
      option.textContent = `${page.title} — ${page.path}`;
      group.appendChild(option);
    });
  }

  function normalizeHeaderRows() {
    qa('.header-link-row', q('#header-links-editor')).forEach((row) => {
      const mode = q('.header-link-mode', row);
      const pageSelect = q('.header-page-select', row);
      const hrefInput = q('.header-link-href', row);
      if (!mode || !pageSelect || !hrefInput) return;

      addCategoryOptions(pageSelect);

      const current = String(
        row.dataset.href ||
        pageSelect.value ||
        hrefInput.value ||
        ''
      ).trim();

      if (!CATEGORY_PAGES.some((page) => page.path === current)) return;

      row.dataset.href = current;
      mode.value = 'page';
      addCategoryOptions(pageSelect);
      pageSelect.value = current;
      pageSelect.hidden = false;
      hrefInput.hidden = true;
    });
  }

  function addProtectedPagesToManager() {
    const list = q('#header-pages-list');
    if (!list) return;

    const existingPaths = new Set(
      qa('.header-page-row-main span', list).map((node) => node.textContent.trim())
    );

    CATEGORY_PAGES.forEach((page) => {
      if (existingPaths.has(page.path)) return;

      const row = document.createElement('div');
      row.className = 'header-page-row header-page-row-category';
      row.dataset.protectedPage = 'true';
      row.innerHTML = `
        <div class="header-page-row-main">
          <strong></strong>
          <span></span>
        </div>
        <span class="header-page-badge header-page-badge-existing">Существующая</span>
        <span class="header-page-lock" title="Эта страница не удаляется через Header">◆</span>`;
      q('strong', row).textContent = page.title;
      q('.header-page-row-main span', row).textContent = page.path;
      list.appendChild(row);
    });
  }

  function refreshProtectedPages() {
    normalizeHeaderRows();
    addProtectedPagesToManager();
  }

  function scheduleRefresh() {
    setTimeout(refreshProtectedPages, 0);
    setTimeout(refreshProtectedPages, 80);
  }

  function bind() {
    document.addEventListener('click', (event) => {
      if (
        event.target.closest('#edit-site-header') ||
        event.target.closest('#header-add-link') ||
        event.target.closest('#bibika-refresh')
      ) {
        scheduleRefresh();
      }
    });

    document.addEventListener('change', (event) => {
      if (event.target.matches('.header-link-mode, .header-page-select')) {
        scheduleRefresh();
      }
    });

    const observer = new MutationObserver(() => {
      if (q('#header-editor-overlay')?.classList.contains('open')) scheduleRefresh();
    });

    const startObserver = () => {
      const overlay = q('#header-editor-overlay');
      if (overlay) {
        observer.observe(overlay, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        scheduleRefresh();
      } else {
        setTimeout(startObserver, 50);
      }
    };

    startObserver();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
