# Kianan Studio public-site Security Collector

Scheduled Cloudflare Worker that copies **only Cloudflare Security Events** for `kiananstudio.com` / `www.kiananstudio.com` into the existing `bibika-security` D1 database.

It does **not** receive or proxy public website traffic. It has no HTTP `fetch()` handler and is intended to run only from a Cron Trigger.

## Required Cloudflare configuration

1. Create a Worker named `kianan-public-security-collector` and use `worker.js` from this folder.
2. Add D1 binding `DB` -> existing database `bibika-security`.
3. Add secret `CLOUDFLARE_ANALYTICS_TOKEN`.
   - Use a dedicated read-only Cloudflare Analytics token.
   - Give it only Analytics Read access required by the GraphQL Analytics API.
   - Restrict the token resource to the `kiananstudio.com` zone.
   - Do not grant DNS Edit, WAF Edit, Workers Edit, or other write permissions.
4. Add variable `CLOUDFLARE_ZONE_ID` with the Zone ID for `kiananstudio.com`.
5. Add Cron Trigger: `*/15 * * * *`.

## Privacy / security properties

- Only `firewallEventsAdaptive` Security Events are requested; ordinary visitor traffic is not collected.
- The GraphQL query intentionally does not request query strings, cookies, request bodies, credentials, or payloads.
- Only these fields are stored: timestamp, Cloudflare action/source, IP, country, ASN, hostname, sanitized path, rule description, and User-Agent.
- Long token-like path segments are replaced with `[redacted]` before storage.
- Repeated overlapping Cron windows are deduplicated with a SHA-256 event key.
- Raw public security events are retained for at most 365 days and capped at 100,000 rows.
- Collector failure cannot affect `kiananstudio.com` or Bibika because the collector is not in either site's request path.

The Bibika dashboard reads this data through the authenticated `/api/security/public` endpoint.
