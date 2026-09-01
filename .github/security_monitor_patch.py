from pathlib import Path

p = Path('bibika/_worker.js')
s = p.read_text()


def replace_once(old, new, name):
    global s
    if old not in s:
        raise SystemExit(f'marker not found: {name}')
    s = s.replace(old, new, 1)

replace_once(
    'const LOGIN_BLOCK_SECONDS = 180;\n',
    'const LOGIN_BLOCK_SECONDS = 180;\nconst SECURITY_RETENTION_DAYS = 365;\nconst SECURITY_MAX_ROWS = 50000;\n',
    'security constants'
)

auth_gate = '''function authGatePath(url) {
  const path = String(url?.pathname || "/").toLowerCase();
  if (path.startsWith("/api/")) return true;
  if (path === "/" || path.endsWith(".html")) return true;
  const tail = path.split("/").pop() || "";
  return !tail.includes(".");
}
'''

security_helpers = r'''

function cleanSecurityText(value, maxLength = 240) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isSuspiciousProbePath(value) {
  const path = String(value || "").toLowerCase();
  return /(?:^|\/)(?:\.env(?:\.|\/|$)|\.git(?:\/|$)|wp-admin(?:\/|$)|wp-login\.php(?:\/|$)|xmlrpc\.php(?:\/|$)|phpmyadmin(?:\/|$)|adminer(?:\.php|\/|$)|vendor\/phpunit(?:\/|$)|cgi-bin(?:\/|$)|\.aws(?:\/|$)|actuator(?:\/|$)|server-status(?:\/|$)|config\.php(?:\/|$))/.test(path);
}

async function pruneSecurityEvents(db) {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - SECURITY_RETENTION_DAYS * 86400;
    await db.prepare("DELETE FROM bibika_security_events WHERE created_at < ?1").bind(cutoff).run();
    await db.prepare(`
      DELETE FROM bibika_security_events
      WHERE id IN (
        SELECT id FROM bibika_security_events
        ORDER BY id DESC
        LIMIT -1 OFFSET ?1
      )
    `).bind(SECURITY_MAX_ROWS).run();
  } catch (error) {
    console.error("Bibika security log cleanup failed", error);
  }
}

async function recordSecurityEvent(request, env, event = {}) {
  try {
    const db = await authDb(env);
    if (!db) return false;
    const now = Math.floor(Date.now() / 1000);
    const cf = request.cf || {};
    const url = new URL(request.url);
    const eventType = cleanSecurityText(event.eventType || "security_event", 64) || "security_event";
    const severity = new Set(["low", "medium", "high", "critical"]).has(event.severity) ? event.severity : "medium";
    const path = cleanSecurityText(url.pathname || "/", 300) || "/";
    const ip = cleanSecurityText(clientIp(request), 80) || "unknown";
    const dedupeSeconds = Math.max(0, Math.min(300, Number(event.dedupeSeconds ?? 5) || 0));

    const result = await db.prepare(`
      INSERT INTO bibika_security_events (
        created_at, event_type, severity, ip, country, region, city, asn, as_org, colo,
        method, path, status, reason, user_agent, ray_id
      )
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
      WHERE NOT EXISTS (
        SELECT 1 FROM bibika_security_events
        WHERE ip = ?4 AND event_type = ?2 AND path = ?12 AND created_at >= ?17
        LIMIT 1
      )
    `).bind(
      now,
      eventType,
      severity,
      ip,
      cleanSecurityText(cf.country, 8),
      cleanSecurityText(cf.region, 100),
      cleanSecurityText(cf.city, 100),
      Number(cf.asn || 0) || null,
      cleanSecurityText(cf.asOrganization, 180),
      cleanSecurityText(cf.colo, 16),
      cleanSecurityText(request.method || "GET", 12),
      path,
      Number(event.status || 0) || null,
      cleanSecurityText(event.reason, 360),
      cleanSecurityText(request.headers.get("User-Agent"), 320),
      cleanSecurityText(request.headers.get("CF-Ray"), 80),
      now - dedupeSeconds
    ).run();

    if (Math.random() < 0.01) await pruneSecurityEvents(db);
    return Number(result?.meta?.changes || 0) > 0;
  } catch (error) {
    // Security telemetry must never become a dependency of the protection path.
    console.error("Bibika security event logging failed", error);
    return false;
  }
}
'''
replace_once(auth_gate, auth_gate + security_helpers, 'auth gate helper insertion')

old_auth_db = '''    await db.prepare(`
      CREATE TABLE IF NOT EXISTS bibika_login_attempts (
        ip TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        window_started INTEGER NOT NULL DEFAULT 0,
        blocked_until INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `).run();
    authDbReady = true;
'''
new_auth_db = '''    await db.prepare(`
      CREATE TABLE IF NOT EXISTS bibika_login_attempts (
        ip TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        window_started INTEGER NOT NULL DEFAULT 0,
        blocked_until INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `).run();
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS bibika_security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        ip TEXT NOT NULL,
        country TEXT,
        region TEXT,
        city TEXT,
        asn INTEGER,
        as_org TEXT,
        colo TEXT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status INTEGER,
        reason TEXT,
        user_agent TEXT,
        ray_id TEXT
      )
    `).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_bibika_security_created ON bibika_security_events(created_at DESC)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_bibika_security_type_created ON bibika_security_events(event_type, created_at DESC)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_bibika_security_ip_created ON bibika_security_events(ip, created_at DESC)").run();
    authDbReady = true;
'''
replace_once(old_auth_db, new_auth_db, 'security D1 schema')

old_reject = '''async function rejectFailedLogin(request, env) {
  const state = await recordFailedLogin(request, env);
  if (state?.blockedUntil) return tooManyLoginAttempts(state.retryAfter);
  return unauthorized();
}
'''
new_reject = '''async function rejectFailedLogin(request, env) {
  const state = await recordFailedLogin(request, env);
  const blocked = !!state?.blockedUntil;
  await recordSecurityEvent(request, env, {
    eventType: blocked ? "auth_blocked" : "auth_failed",
    severity: blocked ? "high" : "medium",
    status: blocked ? 429 : 401,
    reason: blocked
      ? `Brute-force protection activated after ${Number(state?.attempts || LOGIN_MAX_FAILURES)} failed attempts; IP blocked for 3 minutes.`
      : `Invalid Basic Auth credentials; failed attempt ${Number(state?.attempts || 1)} of ${LOGIN_MAX_FAILURES}.`,
    dedupeSeconds: 1,
  });
  if (blocked) return tooManyLoginAttempts(state.retryAfter);
  return unauthorized();
}
'''
replace_once(old_reject, new_reject, 'failed login telemetry')

security_api = r'''

async function handleSecurityApi(request, env, url) {
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed." }, 405);
  const db = await authDb(env);
  if (!db) return jsonResponse({ error: "Security Monitor database is not configured." }, 503);

  const periods = { day: 86400, week: 7 * 86400, month: 30 * 86400, year: 365 * 86400 };
  const period = Object.prototype.hasOwnProperty.call(periods, url.searchParams.get("period")) ? url.searchParams.get("period") : "day";
  const now = Math.floor(Date.now() / 1000);
  const since = now - periods[period];
  const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.max(0, Math.min(200, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 100));
  const offset = Math.max(0, Math.min(SECURITY_MAX_ROWS, Number.isFinite(requestedOffset) ? Math.trunc(requestedOffset) : 0));

  const rows = result => Array.isArray(result?.results) ? result.results : [];
  const one = async (sql, ...bindings) => await db.prepare(sql).bind(...bindings).first();
  const many = async (sql, ...bindings) => rows(await db.prepare(sql).bind(...bindings).all());

  const totalsRow = await one(`
    SELECT
      COUNT(*) AS events,
      COUNT(DISTINCT ip) AS unique_ips,
      COUNT(DISTINCT CASE WHEN event_type IN ('auth_blocked','blocked_request') THEN ip END) AS blocked_ips,
      SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) AS high,
      SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) AS medium,
      SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) AS low
    FROM bibika_security_events WHERE created_at >= ?1
  `, since) || {};

  const statusRow = await one(`
    SELECT
      COUNT(*) AS events,
      SUM(CASE WHEN severity IN ('high','critical') THEN 1 ELSE 0 END) AS high_events,
      SUM(CASE WHEN event_type = 'auth_blocked' THEN 1 ELSE 0 END) AS auth_blocks
    FROM bibika_security_events WHERE created_at >= ?1
  `, now - 86400) || {};

  const statusEvents = Number(statusRow.events || 0);
  const highEvents = Number(statusRow.high_events || 0);
  const authBlocks = Number(statusRow.auth_blocks || 0);
  let status;
  if (authBlocks > 0 || highEvents >= 3) {
    status = { level: "red", label: "Зафиксирована атака", note: `За последние 24 часа: блокировок brute force — ${authBlocks}, событий высокого риска — ${highEvents}.` };
  } else if (statusEvents > 0) {
    status = { level: "yellow", label: "Есть подозрительная активность", note: `За последние 24 часа зафиксировано событий: ${statusEvents}.` };
  } else {
    status = { level: "green", label: "Всё спокойно", note: "За последние 24 часа события безопасности не зафиксированы." };
  }

  const [types, countries, ips, paths] = await Promise.all([
    many("SELECT event_type AS key, COUNT(*) AS count FROM bibika_security_events WHERE created_at >= ?1 GROUP BY event_type ORDER BY count DESC LIMIT 10", since),
    many("SELECT COALESCE(NULLIF(country,''),'Неизвестно') AS key, COUNT(*) AS count FROM bibika_security_events WHERE created_at >= ?1 GROUP BY key ORDER BY count DESC LIMIT 10", since),
    many("SELECT ip AS key, COUNT(*) AS count FROM bibika_security_events WHERE created_at >= ?1 GROUP BY ip ORDER BY count DESC LIMIT 10", since),
    many("SELECT path AS key, COUNT(*) AS count FROM bibika_security_events WHERE created_at >= ?1 GROUP BY path ORDER BY count DESC LIMIT 10", since),
  ]);

  let events = [];
  if (limit > 0) {
    events = await many(`
      SELECT
        id,
        created_at AS createdAt,
        event_type AS eventType,
        severity,
        ip,
        country,
        region,
        city,
        asn,
        as_org AS asOrganization,
        colo,
        method,
        path,
        status,
        reason,
        user_agent AS userAgent,
        ray_id AS rayId
      FROM bibika_security_events
      WHERE created_at >= ?1
      ORDER BY created_at DESC, id DESC
      LIMIT ?2 OFFSET ?3
    `, since, limit, offset);
  }

  const totals = {
    events: Number(totalsRow.events || 0),
    uniqueIps: Number(totalsRow.unique_ips || 0),
    blockedIps: Number(totalsRow.blocked_ips || 0),
    critical: Number(totalsRow.critical || 0),
    high: Number(totalsRow.high || 0),
    medium: Number(totalsRow.medium || 0),
    low: Number(totalsRow.low || 0),
  };

  return jsonResponse({
    period,
    since,
    generatedAt: now,
    status,
    totals,
    breakdown: { types, countries, ips, paths },
    events,
    hasMore: limit > 0 && offset + events.length < totals.events,
    retention: { days: SECURITY_RETENTION_DAYS, maxRows: SECURITY_MAX_ROWS },
  });
}
'''
replace_once('\nasync function handleCatalogApi(request, env) {\n', security_api + '\nasync function handleCatalogApi(request, env) {\n', 'security API insertion')

old_validation = '''  if (validationError) {
    const status = /слишком большой/i.test(validationError) ? 413 : 400;
    return jsonResponse({ error: validationError }, status);
  }
'''
new_validation = '''  if (validationError) {
    const status = /слишком большой/i.test(validationError) ? 413 : 400;
    await recordSecurityEvent(request, env, {
      eventType: "upload_rejected",
      severity: "low",
      status,
      reason: `Release upload rejected by server validation: ${validationError}`,
      dedupeSeconds: 10,
    });
    return jsonResponse({ error: validationError }, status);
  }
'''
replace_once(old_validation, new_validation, 'release validation telemetry')

old_stream_too_large = '''    if (error?.message === "BIBIKA_RELEASE_TOO_LARGE") {
      return jsonResponse({ error: "Файл слишком большой для загрузки через Bibika. Максимум 90 МБ." }, 413);
    }
'''
new_stream_too_large = '''    if (error?.message === "BIBIKA_RELEASE_TOO_LARGE") {
      await recordSecurityEvent(request, env, {
        eventType: "upload_rejected",
        severity: "medium",
        status: 413,
        reason: "Release upload exceeded the server-side 90 MB stream limit.",
        dedupeSeconds: 10,
      });
      return jsonResponse({ error: "Файл слишком большой для загрузки через Bibika. Максимум 90 МБ." }, 413);
    }
'''
replace_once(old_stream_too_large, new_stream_too_large, 'stream size telemetry')

old_auth_start = '''  const authorization = request.headers.get("Authorization");
  if (!authorization) return unauthorized();

  const url = new URL(request.url);
'''
new_auth_start = '''  const url = new URL(request.url);
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    if (isSuspiciousProbePath(url.pathname)) {
      await recordSecurityEvent(request, env, {
        eventType: "scan_probe",
        severity: "medium",
        status: 401,
        reason: "Known sensitive-path probe blocked by the Bibika authentication gate.",
        dedupeSeconds: 60,
      });
    }
    return unauthorized();
  }
'''
replace_once(old_auth_start, new_auth_start, 'unauthenticated probe logging')

old_block = '''  if (authGatePath(url)) {
    const blocked = await activeLoginBlock(request, env);
    if (blocked) return tooManyLoginAttempts(blocked.retryAfter);
  }
'''
new_block = '''  if (authGatePath(url)) {
    const blocked = await activeLoginBlock(request, env);
    if (blocked) {
      await recordSecurityEvent(request, env, {
        eventType: "blocked_request",
        severity: "high",
        status: 429,
        reason: "Request rejected because this IP is currently blocked by brute-force protection.",
        dedupeSeconds: 60,
      });
      return tooManyLoginAttempts(blocked.retryAfter);
    }
  }
'''
replace_once(old_block, new_block, 'blocked IP telemetry')

old_csrf = '''    const csrfError = validateCsrfRequest(request, url);
    if (csrfError) return csrfError;
'''
new_csrf = '''    const csrfError = validateCsrfRequest(request, url);
    if (csrfError) {
      await recordSecurityEvent(request, env, {
        eventType: "csrf_blocked",
        severity: "high",
        status: 403,
        reason: "Origin / Sec-Fetch-Site validation rejected a state-changing request.",
        dedupeSeconds: 10,
      });
      return csrfError;
    }
'''
if s.count(old_csrf) != 2:
    raise SystemExit(f'expected 2 CSRF markers, found {s.count(old_csrf)}')
s = s.replace(old_csrf, new_csrf)

old_routes = '''  if (url.pathname === "/api/catalog") return handleCatalogApi(request, env);
  if (url.pathname === "/api/image") return handleImageApi(request, env);
  if (url.pathname === "/api/image/cleanup") return handleImageCleanupApi(request, env);
  if (url.pathname === "/api/release/upload") return handleReleaseUploadApi(request, env);
  if (url.pathname === "/api/release/asset/delete") return handleReleaseAssetDeleteApi(request, env);

  const response = await env.ASSETS.fetch(request);
'''
new_routes = '''  if (url.pathname === "/api/security") return handleSecurityApi(request, env, url);
  if (url.pathname === "/api/catalog") return handleCatalogApi(request, env);
  if (url.pathname === "/api/image") return handleImageApi(request, env);
  if (url.pathname === "/api/image/cleanup") return handleImageCleanupApi(request, env);
  if (url.pathname === "/api/release/upload") return handleReleaseUploadApi(request, env);
  if (url.pathname === "/api/release/asset/delete") return handleReleaseAssetDeleteApi(request, env);
  if (url.pathname.startsWith("/api/")) {
    await recordSecurityEvent(request, env, {
      eventType: "api_probe",
      severity: "medium",
      status: 404,
      reason: "Request targeted an unknown Bibika API endpoint.",
      dedupeSeconds: 30,
    });
    return jsonResponse({ error: "Not found." }, 404);
  }

  if (isSuspiciousProbePath(url.pathname)) {
    await recordSecurityEvent(request, env, {
      eventType: "scan_probe",
      severity: "medium",
      status: 404,
      reason: "Known sensitive-path probe detected after authentication.",
      dedupeSeconds: 60,
    });
  }

  const response = await env.ASSETS.fetch(request);
'''
replace_once(old_routes, new_routes, 'security API route')

p.write_text(s)
