(() => {
  const DATA_URL = 'data/products.json';
  const DEFAULT_ICONS = {
    'unity-tools': '◇',
    games: '🎮',
    '3d-assets': '⬡'
  };
  const hasOwn = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);

  function normalizeCategories(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      const id = String(item?.id || '').trim();
      const icon = hasOwn(item, 'icon')
        ? String(item.icon ?? '').trim()
        : (DEFAULT_ICONS[id] || '◆');
      return {
        id,
        title: String(item?.title || '').trim(),
        description: String(item?.description || '').trim(),
        icon
      };
    }).filter((item) => item.id && item.title);
  }

  function renderCategories(categories) {
    const grid = document.querySelector('.home-category-grid');
    if (!grid || !categories.length) return;
    grid.replaceChildren(...categories.map((category) => {
      const link = document.createElement('a');
      link.className = 'category-card category-link';
      link.href = `category.html?category=${encodeURIComponent(category.id)}`;

      const icon = document.createElement('span');
      icon.className = 'category-icon';
      icon.textContent = category.icon;

      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = category.title;
      const description = document.createElement('small');
      description.textContent = category.description;
      copy.append(title, description);

      const arrow = document.createElement('span');
      arrow.className = 'catalog-arrow';
      arrow.textContent = '→';
      link.append(icon, copy, arrow);
      return link;
    }));
  }

  async function loadCategories() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      renderCategories(normalizeCategories(data.categories));
    } catch {
      // Keep the static HTML categories as a safe fallback.
    }
  }

  loadCategories();
})();
