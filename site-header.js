(() => {
  const DATA_URL = 'data/products.json';
  const DEFAULT_FOOTER = {
    brand: 'Kianan Studio',
    tagline: 'Unity tools, 3D assets and games.',
    copyright: 'Kianan Studio. All rights reserved.'
  };

  function validLinks(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => ({
        label: String(item?.label || '').trim(),
        href: String(item?.href || '').trim()
      }))
      .filter((item) => item.label && item.href && !/^javascript:/i.test(item.href) && !/^data:/i.test(item.href));
  }

  function validFooter(value) {
    return {
      brand: String(value?.brand || DEFAULT_FOOTER.brand).trim(),
      tagline: String(value?.tagline ?? DEFAULT_FOOTER.tagline).trim(),
      copyright: String(value?.copyright || DEFAULT_FOOTER.copyright).trim()
    };
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

  function renderFooter(value) {
    const footer = validFooter(value);
    document.querySelectorAll('.site-footer').forEach((root) => {
      const brand = root.querySelector('.footer-brand strong');
      const tagline = root.querySelector('.footer-brand span');
      const copyright = root.querySelector('.footer-inner > p');
      if (brand) brand.textContent = footer.brand;
      if (tagline) tagline.textContent = footer.tagline;
      if (copyright) copyright.textContent = `© ${new Date().getFullYear()} ${footer.copyright}`;
    });
  }

  async function loadSiteChrome() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const links = validLinks(data?.siteHeader?.links);
      if (links.length) renderHeaderLinks(links);
      renderFooter(data?.siteFooter);
    } catch {
      // Keep the static HTML navigation and Footer as safe fallbacks.
    }
  }

  loadSiteChrome();
})();
