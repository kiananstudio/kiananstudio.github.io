(() => {
  const DATA_URL = 'data/products.json';

  function validLinks(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => ({
        label: String(item?.label || '').trim(),
        href: String(item?.href || '').trim()
      }))
      .filter((item) => item.label && item.href && !/^javascript:/i.test(item.href) && !/^data:/i.test(item.href));
  }

  function renderHeaderLinks(links) {
    if (!links.length) return;
    document.querySelectorAll('.site-header .nav-links').forEach((nav) => {
      nav.replaceChildren(...links.map((item) => {
        const anchor = document.createElement('a');
        anchor.textContent = item.label;
        anchor.href = item.href;
        return anchor;
      }));
    });
  }

  async function loadHeader() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const links = validLinks(data?.siteHeader?.links);
      if (links.length) renderHeaderLinks(links);
    } catch {
      // Keep the static HTML navigation as a safe fallback.
    }
  }

  loadHeader();
})();
