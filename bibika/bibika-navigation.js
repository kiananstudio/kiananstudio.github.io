(() => {
  const PUBLIC_ORIGIN = 'https://kiananstudio.com';

  if (!document.querySelector('script[data-bibika-button-colors]')) {
    const script = document.createElement('script');
    script.defer = true;
    script.src = '/button-color-swatches.js?v=1';
    script.dataset.bibikaButtonColors = 'true';
    document.head.appendChild(script);
  }

  function toBibikaUrl(href) {
    const raw = String(href || '').trim();
    if (!raw || raw.startsWith('#') || /^(mailto:|tel:|javascript:|data:|vbscript:)/i.test(raw)) return null;

    let url;
    try {
      url = new URL(raw, PUBLIC_ORIGIN + '/');
    } catch {
      return null;
    }

    if (url.origin !== PUBLIC_ORIGIN) return null;
    const path = url.pathname === '/index.html' ? '/' : url.pathname;
    return `${path}${url.search}${url.hash}`;
  }

  function ensureLogoutButton() {
    const actions = document.querySelector('.bibika-actions');
    if (!actions || document.getElementById('bibika-logout')) return;

    const button = document.createElement('button');
    button.className = 'button button-secondary';
    button.id = 'bibika-logout';
    button.type = 'button';
    button.textContent = 'Выйти';
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      const previousText = button.textContent;
      button.textContent = 'Выход…';

      try {
        const response = await fetch('/logout', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await response.text();
        window.location.replace(PUBLIC_ORIGIN + '/');
      } catch (error) {
        console.error('Bibika logout failed', error);
        button.disabled = false;
        button.textContent = previousText;
        window.alert('Не удалось выйти из Bibika. Попробуй ещё раз.');
      }
    });

    actions.appendChild(button);
  }

  ensureLogoutButton();

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    if (anchor.closest('.bibika-adminbar')) return;
    if (anchor.dataset.bibikaPublic === 'true') return;

    const local = toBibikaUrl(anchor.getAttribute('href'));
    if (!local) return;

    event.preventDefault();
    event.stopPropagation();
    window.location.href = local;
  }, true);
})();
