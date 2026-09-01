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

  function ensureSecurityButton() {
    const actions = document.querySelector('.bibika-actions');
    if (!actions || document.getElementById('bibika-security-status')) return;

    const link = document.createElement('a');
    link.className = 'button button-secondary bibika-security-status';
    link.id = 'bibika-security-status';
    link.href = '/security.html';
    link.textContent = '⚪ Безопасность';
    link.dataset.level = 'loading';
    actions.appendChild(link);

    const refresh = async () => {
      try {
        const response = await fetch('/api/security?period=day&limit=0&offset=0', {
          cache: 'no-store',
          credentials: 'same-origin'
        });
        if (!response.ok) return;
        const data = await response.json();
        const level = ['green', 'yellow', 'red'].includes(data?.status?.level) ? data.status.level : 'green';
        link.dataset.level = level;
        link.textContent = `${level === 'red' ? '🔴' : level === 'yellow' ? '🟡' : '🟢'} Безопасность`;
        link.title = data?.status?.note || 'Открыть журнал безопасности';
      } catch {
        link.dataset.level = 'loading';
        link.textContent = '⚪ Безопасность';
      }
    };

    refresh();
    setInterval(refresh, 60000);
  }

  function ensureLogoutButton() {
    const actions = document.querySelector('.bibika-actions');
    if (!actions || document.getElementById('bibika-logout')) return;

    const button = document.createElement('button');
    button.className = 'button button-secondary';
    button.id = 'bibika-logout';
    button.type = 'button';
    button.textContent = 'Выйти';
    button.addEventListener('click', () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = 'Выход…';

      try {
        fetch('/logout', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          keepalive: true
        }).catch((error) => {
          console.error('Bibika logout request failed', error);
        });
      } finally {
        window.location.replace(PUBLIC_ORIGIN + '/');
      }
    });

    actions.appendChild(button);
  }

  ensureSecurityButton();
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
