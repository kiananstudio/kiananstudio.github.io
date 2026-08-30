(() => {
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  let topCreateActive = false;
  let pendingHref = '';
  let pendingTitle = '';
  let finishing = false;

  function showToast(message, duration = 3600) {
    const toast = q('#bibika-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function ensureStyles() {
    if (q('#bibika-global-create-style')) return;
    const style = document.createElement('style');
    style.id = 'bibika-global-create-style';
    style.textContent = `
      #header-create-page{display:none!important}
      #bibika-create-page{white-space:nowrap}
      @media(max-width:720px){.bibika-actions{flex-wrap:wrap}}
    `;
    document.head.appendChild(style);
  }

  function hideHeaderEditor() {
    const overlay = q('#header-editor-overlay');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('header-editor-open');
  }

  function ensureTopButton() {
    const actions = q('.bibika-adminbar .bibika-actions');
    if (!actions || q('#bibika-create-page')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'bibika-create-page';
    button.className = 'button button-secondary';
    button.textContent = 'Создать страницу';
    button.title = 'Создать новую страницу сайта';
    const refresh = q('#bibika-refresh', actions);
    actions.insertBefore(button, refresh || actions.firstChild);
    button.addEventListener('click', openTopCreate);
  }

  function tidyHeaderEditorCopy() {
    const dialog = q('#header-editor-overlay .header-editor-dialog');
    if (!dialog) return;
    const intro = q('.header-editor-head p', dialog);
    const text = 'Настраивай кнопки Header и выбирай существующие страницы сайта.';
    if (intro && intro.textContent !== text) intro.textContent = text;
  }

  function rowHref(row) {
    const mode = q('.header-link-mode', row)?.value || 'link';
    return mode === 'page'
      ? q('.header-page-select', row)?.value.trim() || ''
      : q('.header-link-href', row)?.value.trim() || '';
  }

  function removeAutomaticallyAddedHeaderButton() {
    if (!pendingHref) return;
    const rows = qa('#header-links-editor .header-link-row');
    const matches = rows.filter(row => rowHref(row) === pendingHref);
    if (!matches.length) return;

    const autoRow = matches.find(row => (q('.header-link-label', row)?.value.trim() || '') === pendingTitle) || matches[matches.length - 1];
    autoRow?.remove();
  }

  function finishTopCreation() {
    if (!topCreateActive || finishing) return;
    const pageOverlay = q('#header-page-create-overlay');
    if (pageOverlay?.classList.contains('open')) return;

    finishing = true;
    removeAutomaticallyAddedHeaderButton();
    hideHeaderEditor();

    const save = q('#header-editor-save');
    if (!save) {
      showToast('Страница подготовлена, но не удалось найти кнопку сохранения Header.', 4800);
      finishing = false;
      topCreateActive = false;
      return;
    }

    save.click();
    topCreateActive = false;
    pendingHref = '';
    pendingTitle = '';
    setTimeout(() => { finishing = false; }, 900);
  }

  function openTopCreate() {
    if (topCreateActive || finishing) return;
    const editHeader = q('#edit-site-header');
    if (!editHeader) {
      showToast('На этой странице редактор Header недоступен.', 4200);
      return;
    }

    topCreateActive = true;
    pendingHref = '';
    pendingTitle = '';
    editHeader.click();

    setTimeout(() => {
      const hiddenCreate = q('#header-create-page');
      if (!hiddenCreate) {
        topCreateActive = false;
        hideHeaderEditor();
        showToast('Не удалось открыть создание страницы.', 4200);
        return;
      }
      hiddenCreate.click();
      hideHeaderEditor();
    }, 0);
  }

  function bind() {
    ensureStyles();
    ensureTopButton();
    tidyHeaderEditorCopy();

    document.addEventListener('click', event => {
      if (!topCreateActive) return;

      if (event.target.closest('#header-page-create-cancel, #header-page-create-close')) {
        topCreateActive = false;
        pendingHref = '';
        pendingTitle = '';
        setTimeout(hideHeaderEditor, 0);
        return;
      }

      if (!event.target.closest('#header-page-create-confirm')) return;
      const idInput = q('#header-page-id');
      if (!idInput || idInput.disabled) return;
      const id = String(idInput.value || '').trim().toLowerCase();
      pendingTitle = q('#header-page-title')?.value.trim() || '';
      pendingHref = id ? `page.html?page=${encodeURIComponent(id)}` : '';
      setTimeout(finishTopCreation, 0);
    }, true);

    // Header editor is created by header-editor.js before this deferred script runs.
    // A persistent MutationObserver here caused a self-triggering DOM mutation loop.
    // Keep only a couple of harmless one-shot checks in case another page initializes later.
    setTimeout(() => {
      ensureTopButton();
      tidyHeaderEditorCopy();
    }, 0);
    setTimeout(() => {
      ensureTopButton();
      tidyHeaderEditorCopy();
    }, 150);
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
