(() => {
  const DATA_URL = 'data/products.json';
  const DEFAULT_BANNER = {
    image: 'assets/images/kianan-banner.webp',
    alt: 'Kianan Studio — tools, 3D assets and games'
  };

  function safeImage(value) {
    const src = String(value || '').trim();
    if (!src || /^(javascript|data|vbscript):/i.test(src)) return DEFAULT_BANNER.image;
    return src;
  }

  async function loadBanner() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const image = safeImage(data?.siteBanner?.image);
      const alt = String(data?.siteBanner?.alt || DEFAULT_BANNER.alt).trim() || DEFAULT_BANNER.alt;
      document.querySelectorAll('.home-banner').forEach((node) => {
        node.src = image;
        node.alt = alt;
      });
    } catch {
      // Keep the static HTML banner as a safe fallback.
    }
  }

  loadBanner();
})();
