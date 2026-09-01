const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const PUBLIC_HOSTS = new Set(['kiananstudio.com', 'www.kiananstudio.com']);
const LOOKBACK_SECONDS = 20 * 60;
const RETENTION_SECONDS = 365 * 86400;
const MAX_ROWS = 100000;
const MAX_EVENTS_PER_RUN = 5000;

function clean(value, max = 320) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safePath(value) {
  let path = clean(value || '/', 500) || '/';
  path = path.split('?', 1)[0];
  const parts = path.split('/').map(part => {
    const decoded = (() => {
      try { return decodeURIComponent(part); } catch { return part; }
    })();
    if (decoded.length > 72) return '[redacted]';
    if (/^[A-Fa-f0-9]{40,}$/.test(decoded)) return '[redacted]';
    if (/^[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}$/.test(decoded)) return '[redacted]';
    return part;
  });
  return clean(parts.join('/'), 300) || '/';
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS kianan_public_security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      action TEXT,
      source TEXT,
      ip TEXT,
      country TEXT,
      asn INTEGER,
      host TEXT,
      method TEXT,
      path TEXT,
      description TEXT,
      user_agent TEXT
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_kianan_public_security_created ON kianan_public_security_events(created_at DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_kianan_public_security_ip_created ON kianan_public_security_events(ip, created_at DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_kianan_public_security_source_created ON kianan_public_security_events(source, created_at DESC)').run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS kianan_security_monitor_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER NOT NULL
    )
  `).run();
}

async function fetchSecurityEvents(env, start, end) {
  if (!env.CLOUDFLARE_ANALYTICS_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    throw new Error('Collector secrets are not configured.');
  }

  const query = `
    query PublicSecurity($zoneTag: string, $filter: FirewallEventsAdaptiveFilter_InputObject) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          firewallEventsAdaptive(
            filter: $filter
            limit: ${MAX_EVENTS_PER_RUN}
            orderBy: [datetime_DESC]
          ) {
            action
            clientAsn
            clientCountryName
            clientIP
            clientRequestHTTPHost
            clientRequestPath
            datetime
            description
            source
            userAgent
          }
        }
      }
    }
  `;

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        zoneTag: String(env.CLOUDFLARE_ZONE_ID),
        filter: {
          datetime_geq: new Date(start * 1000).toISOString(),
          datetime_leq: new Date(end * 1000).toISOString(),
        },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray(payload?.errors) && payload.errors.length)) {
    const message = payload?.errors?.map(item => item?.message).filter(Boolean).join('; ') || `Cloudflare GraphQL HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload?.data?.viewer?.zones?.[0]?.firewallEventsAdaptive || [];
}

async function insertEvent(db, raw) {
  const host = clean(raw?.clientRequestHTTPHost, 180).toLowerCase();
  if (!PUBLIC_HOSTS.has(host)) return { accepted: false, inserted: false };

  const createdAt = Math.floor(new Date(raw?.datetime || 0).getTime() / 1000);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return { accepted: false, inserted: false };

  const action = clean(raw?.action, 48).toLowerCase();
  const source = clean(raw?.source, 80).toLowerCase();
  const ip = clean(raw?.clientIP, 80);
  const country = clean(raw?.clientCountryName, 12).toUpperCase();
  const asn = Number(raw?.clientAsn || 0) || null;
  const path = safePath(raw?.clientRequestPath);
  const description = clean(raw?.description, 360);
  const userAgent = clean(raw?.userAgent, 320);
  const eventKey = (await sha256Hex([
    createdAt, action, source, ip, country, asn || '', host, path, description, userAgent,
  ].join('\u001f'))).slice(0, 48);

  const result = await db.prepare(`
    INSERT OR IGNORE INTO kianan_public_security_events (
      event_key, created_at, action, source, ip, country, asn, host, method, path, description, user_agent
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, '', ?9, ?10, ?11)
  `).bind(eventKey, createdAt, action, source, ip, country, asn, host, path, description, userAgent).run();

  return { accepted: true, inserted: Number(result?.meta?.changes || 0) > 0 };
}

async function prune(db, now) {
  await db.prepare('DELETE FROM kianan_public_security_events WHERE created_at < ?1').bind(now - RETENTION_SECONDS).run();
  await db.prepare(`
    DELETE FROM kianan_public_security_events
    WHERE id IN (
      SELECT id FROM kianan_public_security_events
      ORDER BY id DESC
      LIMIT -1 OFFSET ?1
    )
  `).bind(MAX_ROWS).run();
}

async function collect(env) {
  const db = env.DB;
  if (!db || typeof db.prepare !== 'function') throw new Error('D1 binding DB is not configured.');
  await ensureSchema(db);

  const end = Math.floor(Date.now() / 1000);
  const start = end - LOOKBACK_SECONDS;
  const events = await fetchSecurityEvents(env, start, end);
  let accepted = 0;
  let inserted = 0;

  for (const event of events) {
    const result = await insertEvent(db, event);
    if (result.accepted) accepted += 1;
    if (result.inserted) inserted += 1;
  }

  await prune(db, end);
  await db.prepare(`
    INSERT INTO kianan_security_monitor_meta (key, value, updated_at)
    VALUES ('public_last_collected', ?1, ?2)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(JSON.stringify({
    fetched: events.length,
    accepted,
    inserted,
    windowSeconds: LOOKBACK_SECONDS,
    note: 'Cloudflare Security Events synchronized by the read-only public-site collector.',
  }), end).run();

  return { fetched: events.length, accepted, inserted, start, end };
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(collect(env));
  },
};
