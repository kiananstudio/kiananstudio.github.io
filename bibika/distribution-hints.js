(() => {
  const linkHints = {
    windows: {
      placeholder: 'https://github.com/owner/repo/releases/download/v1.0.0/MyGame-Windows.exe',
      help: 'Для Windows укажи прямую ссылку на .exe или .zip из GitHub Releases.'
    },
    macos: {
      placeholder: 'https://github.com/owner/repo/releases/download/v1.0.0/MyGame-macOS.dmg',
      help: 'Для macOS укажи прямую ссылку на .dmg из GitHub Releases.'
    },
    android: {
      placeholder: 'https://github.com/owner/repo/releases/download/v1.0.0/MyGame-Android.apk',
      help: 'Для Android укажи прямую ссылку на .apk из GitHub Releases.'
    },
    linux: {
      placeholder: 'https://github.com/owner/repo/releases/download/v1.0.0/MyGame-Linux.AppImage',
      help: 'Для Linux укажи прямую ссылку на .AppImage, .tar.gz или другую готовую сборку из GitHub Releases.'
    },
    other: {
      placeholder: 'https://github.com/owner/repo/releases/download/v1.0.0/file.zip',
      help: 'Укажи прямую ссылку на готовый файл из GitHub Releases.'
    }
  };

  function updateRow(row) {
    if (!row) return;
    const platform = row.querySelector('.download-platform')?.value || 'other';
    const config = linkHints[platform] || linkHints.other;
    const input = row.querySelector('.download-url');
    if (!input) return;

    input.placeholder = config.placeholder;
    const field = input.closest('.field');
    const help = field?.querySelector('small');
    if (help) help.textContent = config.help;
  }

  function updateAll() {
    document.querySelectorAll('#downloads-editor .download-row').forEach(updateRow);
  }

  function loadReleaseSync() {
    if (document.getElementById('bibika-release-sync-script')) return;
    const script = document.createElement('script');
    script.id = 'bibika-release-sync-script';
    script.src = '/release-sync.js?v=1';
    document.head.appendChild(script);
  }

  window.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('downloads-editor');
    if (!editor) return;

    editor.addEventListener('change', (event) => {
      if (event.target.matches('.download-platform')) updateRow(event.target.closest('.download-row'));
    });

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === 'childList' && mutation.addedNodes.length)) updateAll();
    });
    observer.observe(editor, { childList: true });

    updateAll();
  });

  loadReleaseSync();
})();
