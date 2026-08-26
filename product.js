(() => {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const shell = document.getElementById('product-page-shell');
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const platformNames = {
    windows: 'Windows',
    macos: 'macOS',
    android: 'Android',
    linux: 'Linux',
    other: 'Other'
  };

  function releaseRepositoryUrl(repository) {
    const value = String(repository || '').trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) return '';
    return `https://github.com/${value}/releases`;
  }

  function releaseAssetInfo(value, repository = '') {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length < 7 || parts[2] !== 'releases' || parts[3] !== 'download') return null;
      const repo = `${parts[0]}/${parts[1]}`;
      if (repository && repo.toLowerCase() !== String(repository).trim().toLowerCase()) return null;
      const filename = decodeURIComponent(parts.slice(5).join('/'));
      const dot = filename.lastIndexOf('.');
      const extension = dot > -1 ? filename.slice(dot + 1).toUpperCase() : '';
      return { url: url.href, repo, filename, extension };
    } catch {
      return null;
    }
  }

  fetch('data/products.json', { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error(`Catalog load failed: ${r.status}`);
      return r.json();
    })
    .then(data => {
      const product = data.products.find(p => p.id === id);
      if (!product) {
        shell.innerHTML = `<div class="product-not-found"><h1>Product not found</h1><p><a class="text-link" href="./#categories">Return to catalog →</a></p></div>`;
        return;
      }

      const category = data.categories.find(c => c.id === product.category);
      document.title = `${product.title} — Kianan Studio`;

      const gallery = (product.gallery || []).map(src => `
        <figure class="media-frame product-gallery-item"><img src="${escapeHtml(src)}" alt="${escapeHtml(product.title)} screenshot" loading="lazy"></figure>
      `).join('');

      const features = (product.features || []).map(item => `<li>${escapeHtml(item)}</li>`).join('');
      const distribution = product.distribution || { type: 'external', repository: '', downloads: [] };
      const distributionType = distribution.type || 'external';
      const releasesUrl = releaseRepositoryUrl(distribution.repository);
      const validDownloads = distributionType === 'github-releases'
        ? (Array.isArray(distribution.downloads) ? distribution.downloads : [])
            .map(item => ({ item, asset: releaseAssetInfo(item?.url, distribution.repository) }))
            .filter(entry => entry.asset)
        : [];

      let primary = '';
      if (distributionType === 'github-releases') {
        if (validDownloads.length) primary += '<a class="button button-primary" href="#downloads">Download</a>';
        if (releasesUrl) primary += `<a class="button button-secondary" href="${escapeHtml(releasesUrl)}" target="_blank" rel="noopener">GitHub Releases</a>`;
      } else if (distributionType !== 'none' && product.links?.primaryUrl) {
        primary = `<a class="button button-primary" href="${escapeHtml(product.links.primaryUrl)}" target="_blank" rel="noopener">${escapeHtml(product.links.primaryLabel || 'Open link')}</a>`;
      }

      const downloads = validDownloads.map(({ item, asset }) => {
        const platform = platformNames[item.platform] || item.platform || 'Download';
        const details = [
          item.version ? `Version ${item.version}` : '',
          item.architecture || '',
          asset.extension || ''
        ].filter(Boolean).map(escapeHtml).join(' · ');
        return `
          <article class="download-card">
            <div class="download-card-copy">
              <span class="download-platform">${escapeHtml(platform)}</span>
              <h3>${escapeHtml(item.label || `Download for ${platform}`)}</h3>
              ${details ? `<p>${details}</p>` : ''}
            </div>
            <a class="button button-primary download-button" href="${escapeHtml(asset.url)}" rel="noopener">Download</a>
          </article>`;
      }).join('');

      shell.innerHTML = `
        <a class="back-link" href="./#categories">← Back to ${escapeHtml(category?.title || 'catalog')}</a>
        <section class="product-detail-hero">
          <div class="product-detail-copy">
            <span class="eyebrow">${escapeHtml(category?.title || '')}</span>
            <h1>${escapeHtml(product.title)}</h1>
            <div class="product-labels">
              ${product.status ? `<span>${escapeHtml(product.status)}</span>` : ''}
              ${product.version ? `<span>Version ${escapeHtml(product.version)}</span>` : ''}
            </div>
            <p class="product-lead">${escapeHtml(product.description || product.shortDescription || '')}</p>
            <div class="hero-actions">${primary}</div>
          </div>
          <div class="product-cover-panel">
            ${product.cover ? `<img src="${escapeHtml(product.cover)}" alt="${escapeHtml(product.title)}">` : `<div class="item-placeholder large">${escapeHtml(product.title.slice(0,2).toUpperCase())}</div>`}
          </div>
        </section>
        ${downloads ? `<section class="product-content-section" id="downloads"><span class="eyebrow">Downloads</span><h2>Choose your platform.</h2><div class="download-grid">${downloads}</div></section>` : ''}
        ${features ? `<section class="product-content-section"><span class="eyebrow">Features</span><h2>What it includes.</h2><ul class="feature-list product-feature-list">${features}</ul></section>` : ''}
        ${gallery ? `<section class="product-content-section"><span class="eyebrow">Media</span><h2>Screenshots.</h2><div class="product-gallery">${gallery}</div></section>` : ''}
      `;
    })
    .catch(err => {
      console.error(err);
      shell.innerHTML = '<p class="load-error">Product information is temporarily unavailable.</p>';
    });
})();
