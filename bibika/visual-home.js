(() => {
  const API_URL = '/api/catalog';
  const fallbackDescriptions = {
    'unity-tools': 'Editor tools and extensions for Unity workflows.',
    games: 'Original games and interactive projects.',
    '3d-assets': 'Reusable 3D content for game development.'
  };

  const toast = document.getElementById('bibika-toast');
  const refreshButton = document.getElementById('bibika-refresh');

  function showToast(message, duration = 2600) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function setCategory(category) {
    const card = document.querySelector(`[data-category-id="${category.id}"]`);
    if (!card) return;
    const title = card.querySelector('[data-category-title]');
    const description = card.querySelector('[data-category-description]');
    if (title && category.title) title.textContent = category.title;
    if (description) description.textContent = fallbackDescriptions[category.id] || category.description || description.textContent;
  }

  async function refreshFromGitHub({ announce = true } = {}) {
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Обновление…';
    }
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      (data.categories || []).forEach(setCategory);
      if (announce) showToast('Данные обновлены из GitHub.');
    } catch (error) {
      showToast(`Не удалось обновить данные: ${error.message}`, 4200);
    } finally {
      if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = 'Обновить из GitHub';
      }
    }
  }

  document.querySelectorAll('[data-edit-block]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showToast(`Редактирование «${button.dataset.editBlock}» подключим следующим шагом.`);
    });
  });

  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  navToggle?.addEventListener('click', () => {
    const open = navLinks?.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  refreshButton?.addEventListener('click', () => refreshFromGitHub({ announce: true }));

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  refreshFromGitHub({ announce: false });
})();
