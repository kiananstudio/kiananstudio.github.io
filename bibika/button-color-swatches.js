(() => {
  const SELECTOR = '.static-editor-button-style, .text-page-button-style';

  function ensureStyles() {
    if (document.getElementById('bibika-button-color-swatches-style')) return;
    const style = document.createElement('style');
    style.id = 'bibika-button-color-swatches-style';
    style.textContent = `
      .bibika-button-color-select{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      .bibika-button-color-picker{display:grid;grid-template-columns:1fr 1fr;gap:7px;width:100%}
      .bibika-button-color-swatch{position:relative;min-width:48px;height:42px;border-radius:10px;border:2px solid transparent;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);transition:.15s transform,.15s border-color,.15s box-shadow}
      .bibika-button-color-swatch:hover{transform:translateY(-1px)}
      .bibika-button-color-swatch[data-style="primary"]{background:linear-gradient(135deg,#1598ee,#0d74c6)}
      .bibika-button-color-swatch[data-style="secondary"]{background:rgba(255,255,255,.035);border-color:rgba(255,255,255,.16)}
      .bibika-button-color-swatch.is-active{border-color:#dff5ff;box-shadow:0 0 0 2px rgba(66,196,255,.28),inset 0 0 0 1px rgba(255,255,255,.12)}
      .bibika-button-color-swatch.is-active::after{content:'✓';position:absolute;right:7px;bottom:4px;color:#fff;font-size:.72rem;font-weight:900;text-shadow:0 1px 3px rgba(0,0,0,.7)}
      .bibika-button-color-swatch[data-style="secondary"].is-active{border-color:#a8b3bf;box-shadow:0 0 0 2px rgba(168,179,191,.18),inset 0 0 0 1px rgba(255,255,255,.12)}
    `;
    document.head.appendChild(style);
  }

  function sync(select, picker) {
    const value = select.value === 'secondary' ? 'secondary' : 'primary';
    picker.querySelectorAll('.bibika-button-color-swatch').forEach(button => {
      const active = button.dataset.style === value;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function enhance(select) {
    if (!(select instanceof HTMLSelectElement) || select.dataset.colorSwatchesReady === '1') return;
    select.dataset.colorSwatchesReady = '1';
    select.classList.add('bibika-button-color-select');

    const picker = document.createElement('div');
    picker.className = 'bibika-button-color-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Цвет кнопки');

    [
      ['primary', 'Синий цвет кнопки'],
      ['secondary', 'Тёмный цвет кнопки']
    ].forEach(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bibika-button-color-swatch';
      button.dataset.style = value;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', () => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync(select, picker);
      });
      picker.appendChild(button);
    });

    select.insertAdjacentElement('afterend', picker);
    select.addEventListener('change', () => sync(select, picker));
    sync(select, picker);
  }

  function scan(root = document) {
    if (root instanceof Element && root.matches(SELECTOR)) enhance(root);
    root.querySelectorAll?.(SELECTOR).forEach(enhance);
  }

  ensureStyles();
  scan();

  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node instanceof Element) scan(node);
    }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
