(() => {
  const DATA_URL = 'data/products.json';
  const DEFAULT_BANNER = {
    image: 'assets/images/kianan-banner.webp',
    alt: 'Kianan Studio — tools, 3D assets and games'
  };

  function safeImage(value) {
    const src = String(value || '').trim();
    if (!src || /^(javascript|data|vbscript):/i.test(src)) return '';
    return src;
  }

  function applyBanner(imageValue, altValue) {
    const image = safeImage(imageValue);
    const alt = String(altValue || DEFAULT_BANNER.alt).trim() || DEFAULT_BANNER.alt;
    document.querySelectorAll('.home-banner').forEach((node) => {
      const wrap = node.parentElement;
      if (!image) {
        node.removeAttribute('src');
        node.style.display = 'none';
        wrap?.classList.add('banner-placeholder');
        return;
      }
      node.src = image;
      node.alt = alt;
      node.style.display = '';
      wrap?.classList.remove('banner-placeholder');
    });
  }

  async function loadBanner() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (!data?.siteBanner || !Object.prototype.hasOwnProperty.call(data.siteBanner, 'image')) return;
      applyBanner(data.siteBanner.image, data.siteBanner.alt);
    } catch {
      // Keep the static HTML banner as a safe fallback.
    }
  }

  loadBanner();
})();
