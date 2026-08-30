(() => {
  const ARCHITECTURES = new Set(['Universal', 'ARM64', 'ARMv7', 'x86_64', 'x64', 'x86', 'Apple Silicon', 'Intel', 'Не указано']);

  function update() {
    let changed = false;
    document.querySelectorAll('.managed-page-file-block').forEach(block => {
      const first = block.querySelector('.managed-page-file-meta span:first-child');
      if (!first) return;
      const text = String(first.textContent || '').trim();
      if (!text || /^(min(?:imum)?\b)/i.test(text) || ARCHITECTURES.has(text)) return;
      first.textContent = `Min ${text}`;
      changed = true;
    });
    return changed;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    update();
    if (attempts >= 60) clearInterval(timer);
  }, 100);

  if (document.readyState !== 'loading') update();
  else document.addEventListener('DOMContentLoaded', update, { once: true });
})();
