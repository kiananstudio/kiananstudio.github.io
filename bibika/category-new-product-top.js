(() => {
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function moveFreshProductToTop(existingKeys) {
    const list = q('#category-page-products-list');
    if (!list) return;

    const fresh = qa('.category-page-product-row-fields', list)
      .find(row => !existingKeys.has(row.dataset.productKey));
    const key = fresh?.dataset.productKey;
    if (!key) return;

    let guard = 100;
    while (guard-- > 0) {
      const row = qa('.category-page-product-row-fields', list)
        .find(item => item.dataset.productKey === key);
      const up = row?.querySelector('.category-page-product-up');
      if (!row || !up || up.disabled) break;
      up.click();
    }

    const topRow = qa('.category-page-product-row-fields', list)
      .find(item => item.dataset.productKey === key);
    topRow?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    topRow?.querySelector('.category-page-product-title')?.focus();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('#category-page-add-product');
    if (!button) return;

    const existingKeys = new Set(
      qa('#category-page-products-list .category-page-product-row-fields')
        .map(row => row.dataset.productKey)
        .filter(Boolean)
    );

    setTimeout(() => moveFreshProductToTop(existingKeys), 0);
  });
})();
