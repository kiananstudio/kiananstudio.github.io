(() => {
  const API_URL = '/api/security';
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
  const PERIOD_LABELS = { day: 'за сутки', week: 'за неделю', month: 'за месяц', year: 'за год' };
  let period = 'day';
  let offset = 0;
  let loading = false;

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

  function sourceText(event) {
    const geo = [event.city, event.region, event.country].filter(Boolean).join(', ');
    return [event.ip || 'IP неизвестен', geo].filter(Boolean).join(' · ');
  }

  function setStatus(status) {
    const box = q('#security-live-status');
    const title = q('#security-status-title');
    const note = q('#security-status-note');
    const level = ['green', 'yellow', 'red'].includes(status?.level) ? status.level : 'green';
    if (box) box.dataset.level = level;
    if (title) title.textContent = status?.label || (level === 'green' ? 'Всё спокойно' : level === 'yellow' ? 'Есть подозрительная активность' : 'Зафиксирована атака');
    if (note) note.textContent = status?.note || 'Статус рассчитан по событиям последних 24 часов.';
  }

  function renderRanking(selector, rows, labelKey = 'key') {
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
      const raw = String(row?.[labelKey] || 'Неизвестно');
      label.textContent = selector === '#security-types' ? eventLabel(raw) : raw;
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

  function renderEvent(event) {
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

  function renderEvents(events, append = false) {
    const host = q('#security-events');
    if (!host) return;
    if (!append) host.replaceChildren();
    if (!append && (!Array.isArray(events) || !events.length)) {
      const empty = document.createElement('div');
      empty.className = 'security-ranking-empty';
      empty.textContent = 'За выбранный период событий безопасности не зафиксировано.';
      host.appendChild(empty);
      return;
    }
    (events || []).forEach(event => host.appendChild(renderEvent(event)));
  }

  function render(data, append = false) {
    const totals = data?.totals || {};
    q('#security-total-events').textContent = formatNumber(totals.events);
    q('#security-unique-ips').textContent = formatNumber(totals.uniqueIps);
    q('#security-blocked-ips').textContent = formatNumber(totals.blockedIps);
    q('#security-high-events').textContent = formatNumber(Number(totals.high || 0) + Number(totals.critical || 0));
    q('#security-events-caption').textContent = `Последние события ${PERIOD_LABELS[period] || ''}`;
    q('#security-generated').textContent = data?.generatedAt ? `Обновлено ${formatTime(data.generatedAt)}` : '';
    q('#security-retention').textContent = data?.retention ? `Подробный журнал хранится до ${data.retention.days} дней и ограничен ${formatNumber(data.retention.maxRows)} записями, чтобы мониторинг не мог бесконтрольно разрастаться.` : '';
    setStatus(data?.status);
    renderRanking('#security-types', data?.breakdown?.types);
    renderRanking('#security-countries', data?.breakdown?.countries);
    renderRanking('#security-ips', data?.breakdown?.ips);
    renderRanking('#security-paths', data?.breakdown?.paths);
    renderEvents(data?.events, append);
    const more = q('#security-load-more');
    if (more) more.hidden = !data?.hasMore;
  }

  async function load({ append = false } = {}) {
    if (loading) return;
    loading = true;
    const refresh = q('#security-refresh');
    if (refresh) refresh.disabled = true;
    try {
      const params = new URLSearchParams({ period, limit: String(PAGE_SIZE), offset: String(offset) });
      const response = await fetch(`${API_URL}?${params}`, { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      render(data, append);
    } catch (error) {
      if (!append) {
        const host = q('#security-events');
        if (host) {
          host.replaceChildren();
          const message = document.createElement('div');
          message.className = 'security-error';
          message.textContent = `Не удалось загрузить журнал безопасности: ${error.message}`;
          host.appendChild(message);
        }
      }
      showToast(`Ошибка Security Monitor: ${error.message}`, 5000);
    } finally {
      loading = false;
      if (refresh) refresh.disabled = false;
    }
  }

  document.querySelectorAll('[data-period]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-period]').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      period = button.dataset.period || 'day';
      offset = 0;
      load();
    });
  });

  q('#security-refresh')?.addEventListener('click', () => {
    offset = 0;
    load();
  });

  q('#security-load-more')?.addEventListener('click', () => {
    offset += PAGE_SIZE;
    load({ append: true });
  });

  load();
})();
