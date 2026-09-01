from pathlib import Path

p = Path('bibika/_worker.js')
s = p.read_text()


def replace_once(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'marker not found: {label}')
    s = s.replace(old, new, 1)

# Public-site security storage shares the existing D1 database but is isolated
# from Bibika auth events. No request bodies, cookies, Authorization headers, or
# query strings are stored.
marker = '''    await db.prepare("CREATE INDEX IF NOT EXISTS idx_bibika_security_ip_created ON bibika_security_events(ip, created_at DESC)").run();\n    authDbReady = true;\n'''
replacement = '''    await db.prepare("CREATE INDEX IF NOT EXISTS idx_bibika_security_ip_created ON bibika_security_events(ip, created_at DESC)").run();\n    await db.prepare(`\n      CREATE TABLE IF NOT EXISTS kianan_public_security_events (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        event_key TEXT NOT NULL UNIQUE,\n        created_at INTEGER NOT NULL,\n        action TEXT,\n        source TEXT,\n        ip TEXT,\n        country TEXT,\n        asn INTEGER,\n        host TEXT,\n        method TEXT,\n        path TEXT,\n        description TEXT,\n        user_agent TEXT\n      )\n    `).run();\n    await db.prepare("CREATE INDEX IF NOT EXISTS idx_kianan_public_security_created ON kianan_public_security_events(created_at DESC)").run();\n    await db.prepare("CREATE INDEX IF NOT EXISTS idx_kianan_public_security_ip_created ON kianan_public_security_events(ip, created_at DESC)").run();\n    await db.prepare("CREATE INDEX IF NOT EXISTS idx_kianan_public_security_source_created ON kianan_public_security_events(source, created_at DESC)").run();\n    await db.prepare(`\n      CREATE TABLE IF NOT EXISTS kianan_security_monitor_meta (\n        key TEXT PRIMARY KEY,\n        value TEXT,\n        updated_at INTEGER NOT NULL\n      )\n    `).run();\n    authDbReady = true;\n'''
replace_once(marker, replacement, 'public security tables')

handler_marker = '\nasync function handleSecurityApi(request, env, url) {'
public_handler = r'''

async function handlePublicSecurityApi(request, env, url) {
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed." }, 405);
  const db = await authDb(env);
  if (!db) return jsonResponse({ error: "Public Security Monitor database is not configured." }, 503);

  const periods = { day: 86400, week: 7 * 86400, month: 30 * 86400, year: 365 * 86400 };
  const requestedPeriod = String(url.searchParams.get("period") || "day");
  const period = Object.prototype.hasOwnProperty.call(periods, requestedPeriod) ? requestedPeriod : "day";
  const now = Math.floor(Date.now() / 1000);
  const since = now - periods[period];
  const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.max(0, Math.min(200, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 100));
  const offset = Math.max(0, Math.min(100000, Number.isFinite(requestedOffset) ? Math.trunc(requestedOffset) : 0));
  const mitigatedActions = ["block", "js_challenge", "managed_challenge", "challenge"];

  const rows = result => Array.isArray(result?.results) ? result.results : [];
  const one = async (sql, ...bindings) => await db.prepare(sql).bind(...bindings).first();
  const many = async (sql, ...bindings) => rows(await db.prepare(sql).bind(...bindings).all());

  const totalsRow = await one(`
    SELECT
      COUNT(*) AS events,
      COUNT(DISTINCT NULLIF(ip,'')) AS unique_ips,
      SUM(CASE WHEN action IN ('block','js_challenge','managed_challenge','challenge') THEN 1 ELSE 0 END) AS mitigated,
      COUNT(DISTINCT NULLIF(source,'')) AS services
    FROM kianan_public_security_events
    WHERE created_at >= ?1
  `, since) || {};

  const dayRow = await one(`
    SELECT
      COUNT(*) AS events,
      SUM(CASE WHEN action IN ('block','js_challenge','managed_challenge','challenge') THEN 1 ELSE 0 END) AS mitigated
    FROM kianan_public_security_events
    WHERE created_at >= ?1
  `, now - 86400) || {};

  const meta = await one("SELECT value, updated_at FROM kianan_security_monitor_meta WHERE key = 'public_last_collected'") || null;
  let collector = { configured: false, lastRun: null, note: "Сборщик публичного сайта ещё не запускался." };
  if (meta) {
    let details = {};
    try { details = JSON.parse(String(meta.value || "{}")); } catch {}
    collector = {
      configured: true,
      lastRun: Number(meta.updated_at || 0) || null,
      fetched: Number(details.fetched || 0),
      inserted: Number(details.inserted || 0),
      note: String(details.note || "Cloudflare Security Events синхронизированы.").slice(0, 220),
    };
  }

  const dayEvents = Number(dayRow.events || 0);
  const dayMitigated = Number(dayRow.mitigated || 0);
  let status;
  if (!collector.configured) {
    status = { level: "gray", label: "Сборщик не запущен", note: "Нужно активировать Cloudflare collector; защита сайта при этом не зависит от мониторинга." };
  } else if (dayMitigated >= 10 || dayEvents >= 50) {
    status = { level: "red", label: "Повышенная атакующая активность", note: `За 24 часа: событий — ${dayEvents}, заблокировано/проверено Cloudflare — ${dayMitigated}.` };
  } else if (dayEvents > 0) {
    status = { level: "yellow", label: "Есть подозрительная активность", note: `За 24 часа Cloudflare зафиксировал событий безопасности: ${dayEvents}.` };
  } else {
    status = { level: "green", label: "Всё спокойно", note: "За последние 24 часа Cloudflare Security Events не зафиксировал подозрительных событий." };
  }

  const [actions, sources, countries, ips, paths] = await Promise.all([
    many("SELECT COALESCE(NULLIF(action,''),'unknown') AS key, COUNT(*) AS count FROM kianan_public_security_events WHERE created_at >= ?1 GROUP BY key ORDER BY count DESC LIMIT 10", since),
    many("SELECT COALESCE(NULLIF(source,''),'unknown') AS key, COUNT(*) AS count FROM kianan_public_security_events WHERE created_at >= ?1 GROUP BY key ORDER BY count DESC LIMIT 10", since),
    many("SELECT COALESCE(NULLIF(country,''),'Неизвестно') AS key, COUNT(*) AS count FROM kianan_public_security_events WHERE created_at >= ?1 GROUP BY key ORDER BY count DESC LIMIT 10", since),
    many("SELECT COALESCE(NULLIF(ip,''),'Неизвестно') AS key, COUNT(*) AS count FROM kianan_public_security_events WHERE created_at >= ?1 GROUP BY key ORDER BY count DESC LIMIT 10", since),
    many("SELECT COALESCE(NULLIF(path,''),'/') AS key, COUNT(*) AS count FROM kianan_public_security_events WHERE created_at >= ?1 GROUP BY key ORDER BY count DESC LIMIT 10", since),
  ]);

  let events = [];
  if (limit > 0) {
    events = await many(`
      SELECT
        id,
        created_at AS createdAt,
        action,
        source,
        ip,
        country,
        asn,
        host,
        method,
        path,
        description,
        user_agent AS userAgent
      FROM kianan_public_security_events
      WHERE created_at >= ?1
      ORDER BY created_at DESC, id DESC
      LIMIT ?2 OFFSET ?3
    `, since, limit, offset);
  }

  const totals = {
    events: Number(totalsRow.events || 0),
    uniqueIps: Number(totalsRow.unique_ips || 0),
    mitigated: Number(totalsRow.mitigated || 0),
    services: Number(totalsRow.services || 0),
  };

  return jsonResponse({
    period,
    since,
    generatedAt: now,
    status,
    collector,
    totals,
    breakdown: { actions, sources, countries, ips, paths },
    events,
    hasMore: limit > 0 && offset + events.length < totals.events,
    retention: { days: 365, maxRows: 100000 },
    privacy: {
      ordinaryVisitorsStored: false,
      queryStringsStored: false,
      requestBodiesStored: false,
      credentialsStored: false,
    },
  });
}
'''
if handler_marker not in s:
    raise SystemExit('marker not found: handleSecurityApi')
s = s.replace(handler_marker, public_handler + handler_marker, 1)

route_marker = '  if (url.pathname === "/api/security") return handleSecurityApi(request, env, url);\n'
route_replacement = '  if (url.pathname === "/api/security/public") return handlePublicSecurityApi(request, env, url);\n' + route_marker
replace_once(route_marker, route_replacement, 'public security route')

p.write_text(s)
