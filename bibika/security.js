(() => {
  const BIBIKA_API_URL = '/api/security';
  const PUBLIC_API_URL = '/api/security/public';
  const PAGE_SIZE = 100;
  const TYPE_LABELS = {
    auth_failed: 'Неудачная авторизация',
    auth_blocked: 'Brute Force — IP заблокирован',
    blocked_request: 'Запрос с заблокированного IP',
    csrf_blocked: 'CSRF-запрос заблокирован',
    scan_probe: 'Сканирование защищённого сайта',
    api_probe: 'Неизвестный API-запрос',
    upload_rejected: 'Загрузка отклонена защитой'
  };
  const ACTION_LABELS = {
    block: 'Block',
    challenge: 'Challenge',
    js_challenge: 'JS Challenge',
    managed_challenge: 'Managed Challenge',
    log: 'Log',
    skip: 'Skip'
  };
  const SOURCE_LABELS = {
    waf: 'WAF',
    firewallddos: 'HTTP DDoS',
    bic: 'Browser Integrity Check',
    firewallrules: 'Firewall rules',
    ratelimit: 'Rate limiting',
    securitylevel: 'Security Level'
  };
  const PERIOD_LABELS = { day: 'за сутки', week: 'за неделю', month: 'за месяц', year: 'за год' };
  let period = 'day';
  let bibikaOffset = 0;
  let publicOffset = 0;
  let bibikaLoading = false;
  let publicLoading = false;

  const q = (selector, root = document) => root.querySelector(selector);

  function showToast(message, duration = 3500) {
    const toast = q('#bibika-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
  }

  function formatTime(seconds) {
    const date = new Date(Number(seconds || 0) * 1000);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(date);
  }

  function eventLabel(value) {
    const key = String(value || '');
    return TYPE_LABELS[key] || key || 'Событие';
  }

  function actionLabel(value) {
    const key = String(value || '').toLowerCase();
    return ACTION_LABELS[key] || key || 'Unknown';
  }

  function sourceLabel(value) {
    const key = String(value || '').toLowerCase();
    return SOURCE_LABELS[key] || key || 'Unknown';
  }

  function sourceText(event) {
    const geo = [event.city, event.region, event.country].filter(Boolean).join(', ');
    return [event.ip || 'IP неизвестен', geo].filter(Boolean).join(' · ');
  }

  function setStatus(prefix, status) {
    const box = q(`#${prefix}-live-status`);
    const title = q(`#${prefix}-status-title`);
    const note = q(`#${prefix}-status-note`);
    const allowed = ['green', 'yellow', 'red', 'gray'];
    const level = allowed.includes(status?.level) ? status.level : 'gray';
    if (box) box.dataset.level = level;
    if (title) title.textContent = status?.label || (level === 'green' ? 'Всё спокойно' : level === 'yellow' ? 'Есть подозрительная активность' : level === 'red' ? 'Зафиксирована атака' : 'Нет данных');
    if (note) note.textContent = status?.note || 'Статус рассчитан по событиям последних 24 часов.';
  }

  function renderRanking(selector, rows, transform = value => value) {
    const host = q(selector);
    if (!host) return;
    host.replaceChildren();
    if (!Array.isArray(rows) || !rows.length) {
      const empty = document.createElement('div');
      empty.className = 'security-ranking-empty';
      empty.textContent = 'Нет данных за выбранный период.';
      host.appendChild(empty);
      return;
    }
    rows.forEach(row => {
      const line = document.createElement('div');
      line.className = 'security-ranking-row';
      const label = document.createElement('span');
      label.className = 'security-ranking-label';
      label.textContent = transform(String(row?.key || 'Неизвестно'));
      label.title = label.textContent;
      const count = document.createElement('strong');
      count.className = 'security-ranking-count';
      count.textContent = formatNumber(row?.count);
      line.append(label, count);
      host.appendChild(line);
    });
  }

  function detail(label, value, wide = false) {
    const wrapper = document.createElement('dl');
    wrapper.className = `security-detail${wide ? ' security-detail-wide' : ''}`;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    wrapper.append(dt, dd);
    return wrapper;
  }

  function renderBibikaEvent(event) {
    const article = document.createElement('article');
    article.className = 'security-event';

    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'security-event-summary';
    summary.setAttribute('aria-expanded', 'false');

    const severity = document.createElement('span');
    severity.className = 'security-severity';
    severity.dataset.level = String(event.severity || 'low');
    severity.textContent = String(event.severity || 'low');

    const type = document.createElement('span');
    type.className = 'security-event-type';
    type.textContent = eventLabel(event.eventType);

    const time = document.createElement('span');
    time.className = 'security-event-time';
    time.textContent = formatTime(event.createdAt);

    const source = document.createElement('span');
    source.className = 'security-event-source';
    source.textContent = sourceText(event);
    source.title = source.textContent;

    const path = document.createElement('span');
    path.className = 'security-event-path';
    path.textContent = `${event.method || 'GET'} ${event.path || '/'}`;
    path.title = path.textContent;

    summary.append(severity, type, time, source, path);

    const details = document.createElement('div');
    details.className = 'security-event-details';
    details.append(
      detail('Дата и время', formatTime(event.createdAt)),
      detail('IP', event.ip),
      detail('Страна', event.country),
      detail('Регион', event.region),
      detail('Город', event.city),
      detail('ASN', event.asn ? `AS${event.asn}` : '—'),
      detail('Сеть / организация', event.asOrganization),
      detail('Cloudflare POP', event.colo),
      detail('HTTP-метод', event.method),
      detail('Код ответа', event.status),
      detail('Путь', event.path, true),
      detail('Причина', event.reason, true),
      detail('User-Agent', event.userAgent, true),
      detail('Cloudflare Ray ID', event.rayId, true)
    );

    summary.addEventListener('click', () => {
      const open = article.classList.toggle('open');
      summary.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    article.append(summary, details);
    return article;
  }

  function publicSeverity(action) {
    const value = String(action || '').toLowerCase();
    if (['block', 'challenge', 'js_challenge', 'managed_challenge'].includes(value)) return 'high';
    if (value === 'log') return 'medium';
    return 'low';
  }

  function renderPublicEvent(event) {
    const article = document.createElement('article');
    article.className = 'security-event';

    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'security-event-summary';
    summary.setAttribute('aria-expanded', 'false');

    const severity = document.createElement('span');
    severity.className = 'security-severity';
    severity.dataset.level = publicSeverity(event.action);
    severity.textContent = actionLabel(event.action);

    const type = document.createElement('span');
    type.className = 'security-event-type';
    type.textContent = sourceLabel(event.source);

    const time = document.createElement('span');
    time.className = 'security-event-time';
    time.textContent = formatTime(event.createdAt);

    const source = document.createElement('span');
    source.className = 'security-event-source';
    source.textContent = [event.ip || 'IP неизвестен', event.country].filter(Boolean).join(' · ');
    source.title = source.textContent;

    const path = document.createElement('span');
    path.className = 'security-event-path';
    path.textContent = `${event.host || 'kiananstudio.com'}${event.path || '/'}`;
    path.title = path.textContent;

    summary.append(severity, type, time, source, path);

    const details = document.createElement('div');
    details.className = 'security-event-details';
    details.append(
      detail('Дата и время', formatTime(event.createdAt)),
      detail('Действие Cloudflare', actionLabel(event.action)),
      detail('Источник защиты', sourceLabel(event.source)),
      detail('IP', event.ip),
      detail('Страна', event.country),
      detail('ASN', event.asn ? `AS${event.asn}` : '—'),
      detail('Hostname', event.host),
      detail('Путь', event.path, true),
      detail('Описание правила', event.description, true),
      detail('User-Agent', event.userAgent, true)
    );

    summary.addEventListener('click', () => {
      const open = article.classList.toggle('open');
      summary.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    article.append(summary, details);
    return article;
  }

  function renderEvents(selector, events, renderer, append = false, emptyMessage = 'За выбранный период событий безопасности не зафиксировано.') {
    const host = q(selector);
    if (!host) return;
    if (!append) host.replaceChildren();
    if (!append && (!Array.isArray(events) || !events.length)) {
      const empty = document.createElement('div');
      empty.className = 'security-ranking-empty';
      empty.textContent = emptyMessage;
      host.appendChild(empty);
      return;
    }
    (events || []).forEach(event => host.appendChild(renderer(event)));
  }

  function renderBibika(data, append = false) {
    const totals = data?.totals || {};
    q('#security-total-events').textContent = formatNumber(totals.events);
    q('#security-unique-ips').textContent = formatNumber(totals.uniqueIps);
    q('#security-blocked-ips').textContent = formatNumber(totals.blockedIps);
    q('#security-high-events').textContent = formatNumber(Number(totals.high || 0) + Number(totals.critical || 0));
    q('#security-events-caption').textContent = `Последние события ${PERIOD_LABELS[period] || ''}`;
    q('#security-generated').textContent = data?.generatedAt ? `Обновлено ${formatTime(data.generatedAt)}` : '';
    q('#security-retention').textContent = data?.retention ? `Bibika: подробный журнал хранится до ${data.retention.days} дней и ограничен ${formatNumber(data.retention.maxRows)} записями.` : '';
    setStatus('security', data?.status);
    renderRanking('#security-types', data?.breakdown?.types, eventLabel);
    renderRanking('#security-countries', data?.breakdown?.countries);
    renderRanking('#security-ips', data?.breakdown?.ips);
    renderRanking('#security-paths', data?.breakdown?.paths);
    renderEvents('#security-events', data?.events, renderBibikaEvent, append);
    const more = q('#security-load-more');
    if (more) more.hidden = !data?.hasMore;
  }

  function renderPublic(data, append = false) {
    const totals = data?.totals || {};
    q('#public-security-total-events').textContent = formatNumber(totals.events);
    q('#public-security-unique-ips').textContent = formatNumber(totals.uniqueIps);
    q('#public-security-mitigated').textContent = formatNumber(totals.mitigated);
    q('#public-security-services').textContent = formatNumber(totals.services);
    q('#public-security-events-caption').textContent = `Последние события ${PERIOD_LABELS[period] || ''}`;
    q('#public-security-generated').textContent = data?.generatedAt ? `Обновлено ${formatTime(data.generatedAt)}` : '';
    q('#public-security-retention').textContent = data?.retention ? `Публичный сайт: архив Security Events хранится до ${data.retention.days} дней и ограничен ${formatNumber(data.retention.maxRows)} записями.` : '';
    setStatus('public-security', data?.status);

    const collector = q('#public-security-collector');
    if (collector) {
      if (data?.collector?.configured && data.collector.lastRun) {
        collector.dataset.state = 'ok';
        collector.textContent = `Сборщик Cloudflare: активен · последний запуск ${formatTime(data.collector.lastRun)} · получено ${formatNumber(data.collector.fetched)} · новых ${formatNumber(data.collector.inserted)}.`;
      } else {
        collector.dataset.state = 'waiting';
        collector.textContent = 'Сборщик Cloudflare ещё не запускался. Публичный журнал начнёт заполняться после активации collector Worker.';
      }
    }

    renderRanking('#public-security-actions', data?.breakdown?.actions, actionLabel);
    renderRanking('#public-security-sources', data?.breakdown?.sources, sourceLabel);
    renderRanking('#public-security-countries', data?.breakdown?.countries);
    renderRanking('#public-security-ips', data?.breakdown?.ips);
    renderRanking('#public-security-paths', data?.breakdown?.paths);
    const emptyMessage = data?.collector?.configured
      ? 'За выбранный период Cloudflare Security Events не зафиксировал событий.'
      : 'Сборщик Cloudflare ещё не активирован; публичный журнал пока пуст.';
    renderEvents('#public-security-events', data?.events, renderPublicEvent, append, emptyMessage);
    const more = q('#public-security-load-more');
    if (more) more.hidden = !data?.hasMore;
  }

  async function loadBibika({ append = false } = {}) {
    if (bibikaLoading) return;
    bibikaLoading = true;
    try {
      const params = new URLSearchParams({ period, limit: String(PAGE_SIZE), offset: String(bibikaOffset) });
      const response = await fetch(`${BIBIKA_API_URL}?${params}`, { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      renderBibika(data, append);
    } catch (error) {
      if (!append) {
        const host = q('#security-events');
        if (host) {
          host.replaceChildren();
          const message = document.createElement('div');
          message.className = 'security-error';
          message.textContent = `Не удалось загрузить журнал Bibika: ${error.message}`;
          host.appendChild(message);
        }
      }
      showToast(`Ошибка журнала Bibika: ${error.message}`, 5000);
    } finally {
      bibikaLoading = false;
    }
  }

  async function loadPublic({ append = false } = {}) {
    if (publicLoading) return;
    publicLoading = true;
    try {
      const params = new URLSearchParams({ period, limit: String(PAGE_SIZE), offset: String(publicOffset) });
      const response = await fetch(`${PUBLIC_API_URL}?${params}`, { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      renderPublic(data, append);
    } catch (error) {
      if (!append) {
        setStatus('public-security', { level: 'gray', label: 'Монитор недоступен', note: error.message });
        const host = q('#public-security-events');
        if (host) {
          host.replaceChildren();
          const message = document.createElement('div');
          message.className = 'security-error';
          message.textContent = `Не удалось загрузить публичный журнал: ${error.message}`;
          host.appendChild(message);
        }
      }
      showToast(`Ошибка публичного Security Monitor: ${error.message}`, 5000);
    } finally {
      publicLoading = false;
    }
  }

  async function loadAll() {
    const refresh = q('#security-refresh');
    if (refresh) refresh.disabled = true;
    try {
      await Promise.all([loadBibika(), loadPublic()]);
    } finally {
      if (refresh) refresh.disabled = false;
    }
  }

  document.querySelectorAll('[data-period]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-period]').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      period = button.dataset.period || 'day';
      bibikaOffset = 0;
      publicOffset = 0;
      loadAll();
    });
  });

  q('#security-refresh')?.addEventListener('click', () => {
    bibikaOffset = 0;
    publicOffset = 0;
    loadAll();
  });

  q('#security-load-more')?.addEventListener('click', () => {
    bibikaOffset += PAGE_SIZE;
    loadBibika({ append: true });
  });

  q('#public-security-load-more')?.addEventListener('click', () => {
    publicOffset += PAGE_SIZE;
    loadPublic({ append: true });
  });

  loadAll();
})();
