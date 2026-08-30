const GITHUB_OWNER = "kiananstudio";
const GITHUB_REPO = "kiananstudio.github.io";
const GITHUB_BRANCH = "main";
const CATALOG_PATH = "data/products.json";
const IMAGE_DIR = "assets/images";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CATALOG_PATH}`;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_RELEASE_FILE_BYTES = 90 * 1024 * 1024;
const MAX_CLEANUP_PATHS = 30;
const BIBIKA_IMAGE_RE = /^assets\/images\/[a-z0-9-]+-(cover|gallery|icon|page)-\d{14}-[a-f0-9]{8}\.webp$/;

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Bibika", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function githubHeaders(env) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Kianan-Studio-Bibika",
  };
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBytesBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function encodeBase64Utf8(value) {
  return encodeBytesBase64(new TextEncoder().encode(value));
}

function sanitizeSlug(value, fallback = "product") {
  const result = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return result || fallback;
}

function decodeHeaderValue(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function sanitizeReleaseVersion(value) {
  const result = String(value || "")
    .trim()
    .replace(/^v/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return result || "1.0.0";
}

function sanitizeAssetName(value, fallback = "download.bin") {
  const raw = String(value || "").split(/[\\/]/).pop().trim();
  const result = raw
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._+()-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  return result || fallback;
}

function uniqueAssetName(name, assets = []) {
  const used = new Set((Array.isArray(assets) ? assets : []).map(asset => String(asset?.name || "")));
  if (!used.has(name)) return name;
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const dot = name.lastIndexOf(".");
  if (dot > 0) return `${name.slice(0, dot)}-${stamp}${name.slice(dot)}`;
  return `${name}-${stamp}`;
}

function normalizeImagePath(value) {
  return String(value || "").trim().replace(/^\/+/, "").split(/[?#]/, 1)[0];
}

function isBibikaManagedImage(path) {
  return BIBIKA_IMAGE_RE.test(normalizeImagePath(path));
}

function collectCatalogImages(data) {
  const result = new Set();
  const banner = normalizeImagePath(data?.siteBanner?.image);
  if (banner) result.add(banner);

  for (const product of data?.products || []) {
    const cover = normalizeImagePath(product?.cover);
    const icon = normalizeImagePath(product?.icon);
    if (cover) result.add(cover);
    if (icon) result.add(icon);
    for (const item of Array.isArray(product?.gallery) ? product.gallery : []) {
      const path = normalizeImagePath(item);
      if (path) result.add(path);
    }
  }

  for (const page of data?.sitePages || []) {
    for (const block of Array.isArray(page?.blocks) ? page.blocks : []) {
      if (block?.type !== "image") continue;
      const path = normalizeImagePath(block?.image);
      if (path) result.add(path);
    }
  }

  return result;
}

function githubContentsUrl(path) {
  const encoded = normalizeImagePath(path)
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encoded}`;
}

function validateCatalog(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.categories) || !Array.isArray(data.products)) {
    return "Некорректная структура каталога.";
  }
  const ids = new Set();
  for (const product of data.products) {
    if (!product || typeof product !== "object" || !String(product.id || "").trim() || !String(product.title || "").trim()) {
      return "У каждого продукта должны быть заполнены ID и название.";
    }
    if (ids.has(product.id)) return `Повторяющийся ID продукта: ${product.id}`;
    ids.add(product.id);
  }
  return null;
}

async function getGitHubCatalog(env) {
  const response = await fetch(`${GITHUB_API}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
    method: "GET",
    headers: githubHeaders(env),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `GitHub HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return { data: JSON.parse(decodeBase64Utf8(payload.content)), sha: payload.sha };
}

async function putGitHubCatalog(env, data, message) {
  const current = await getGitHubCatalog(env);
  const response = await fetch(GITHUB_API, {
    method: "PUT",
    headers: { ...githubHeaders(env), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      message: String(message || "Update website catalog from Bibika").slice(0, 120),
      content: encodeBase64Utf8(`${JSON.stringify(data, null, 2)}\n`),
      sha: current.sha,
      branch: GITHUB_BRANCH,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `GitHub HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function putGitHubImage(env, path, bytes, message) {
  const response = await fetch(githubContentsUrl(path), {
    method: "PUT",
    headers: { ...githubHeaders(env), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      message: String(message || "Bibika: upload image").slice(0, 120),
      content: encodeBytesBase64(bytes),
      branch: GITHUB_BRANCH,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `GitHub HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function getGitHubFileMeta(env, path) {
  const response = await fetch(`${githubContentsUrl(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
    method: "GET",
    headers: githubHeaders(env),
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `GitHub HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function listBibikaManagedImages(env) {
  const response = await fetch(`${githubContentsUrl(IMAGE_DIR)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
    method: "GET",
    headers: githubHeaders(env),
  });
  if (response.status === 404) return [];
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || `GitHub HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (!Array.isArray(payload)) return [];
  return payload
    .filter(item => item?.type === "file" && isBibikaManagedImage(item.path))
    .map(item => normalizeImagePath(item.path));
}

async function deleteGitHubImage(env, path, message) {
  const normalized = normalizeImagePath(path);
  if (!isBibikaManagedImage(normalized)) return { deleted: false, reason: "not-managed" };
  const meta = await getGitHubFileMeta(env, normalized);
  if (!meta) return { deleted: false, reason: "missing" };

  const response = await fetch(githubContentsUrl(normalized), {
    method: "DELETE",
    headers: { ...githubHeaders(env), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      message: String(message || "Bibika: remove unused image").slice(0, 120),
      sha: meta.sha,
      branch: GITHUB_BRANCH,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `GitHub HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return { deleted: true, commit: payload.commit?.sha || null };
}

async function cleanupCandidates(env, candidates, referencedImages = null) {
  const refs = referencedImages || collectCatalogImages((await getGitHubCatalog(env)).data);
  const unique = [...new Set((candidates || []).map(normalizeImagePath).filter(Boolean))].slice(0, MAX_CLEANUP_PATHS);
  const deleted = [];
  const skipped = [];
  const failed = [];

  for (const path of unique) {
    if (!isBibikaManagedImage(path)) {
      skipped.push({ path, reason: "not-managed" });
      continue;
    }
    if (refs.has(path)) {
      skipped.push({ path, reason: "referenced" });
      continue;
    }
    try {
      const result = await deleteGitHubImage(env, path, `Bibika: remove unused image ${path.split("/").pop()}`);
      if (result.deleted) deleted.push(path);
      else skipped.push({ path, reason: result.reason || "not-deleted" });
    } catch (error) {
      failed.push({ path, error: error.message });
    }
  }
  return { deleted, skipped, failed };
}

async function cleanupAllOrphanedImages(env, catalogData) {
  const refs = collectCatalogImages(catalogData);
  const managed = await listBibikaManagedImages(env);
  const orphaned = managed.filter(path => !refs.has(path));
  const result = await cleanupCandidates(env, orphaned, refs);
  return { ...result, found: orphaned.length, remaining: Math.max(0, orphaned.length - MAX_CLEANUP_PATHS) };
}

async function handleCatalogApi(request, env) {
  if (!env.GITHUB_TOKEN) return jsonResponse({ error: "GitHub publishing is not configured." }, 503);

  if (request.method === "GET") {
    try {
      const { data } = await getGitHubCatalog(env);
      return jsonResponse(data);
    } catch (error) {
      return jsonResponse({ error: `Не удалось загрузить каталог из GitHub: ${error.message}` }, 502);
    }
  }

  if (request.method === "POST" || request.method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Некорректный JSON." }, 400);
    }
    const validationError = validateCatalog(body?.data);
    if (validationError) return jsonResponse({ error: validationError }, 400);

    let result;
    try {
      result = await putGitHubCatalog(env, body.data, body.message);
    } catch (error) {
      return jsonResponse({ error: `Не удалось опубликовать изменения в GitHub: ${error.message}` }, error.status === 409 ? 409 : 502);
    }

    let cleanup;
    try {
      cleanup = await cleanupAllOrphanedImages(env, body.data);
    } catch (error) {
      cleanup = { deleted: [], skipped: [], failed: [{ path: "*", error: error.message }], found: null, remaining: null };
    }

    return jsonResponse({ ok: true, commit: result.commit?.sha || null, url: result.commit?.html_url || null, cleanup });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
}

async function handleImageApi(request, env) {
  if (!env.GITHUB_TOKEN) return jsonResponse({ error: "GitHub publishing is not configured." }, 503);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const contentType = String(request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "image/webp") return jsonResponse({ error: "Bibika принимает на сервер только подготовленный WEBP." }, 415);

  const productId = sanitizeSlug(request.headers.get("X-Bibika-Product"));
  const target = String(request.headers.get("X-Bibika-Target") || "").toLowerCase();
  if (!new Set(["cover", "gallery", "icon", "page"]).has(target)) {
    return jsonResponse({ error: "Некорректное назначение изображения." }, 400);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) return jsonResponse({ error: "Готовое изображение слишком большое. Максимум 4 МБ." }, 413);

  const buffer = await request.arrayBuffer();
  if (!buffer.byteLength) return jsonResponse({ error: "Пустой файл изображения." }, 400);
  if (buffer.byteLength > MAX_IMAGE_BYTES) return jsonResponse({ error: "Готовое изображение слишком большое. Максимум 4 МБ." }, 413);

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8);
  const path = `${IMAGE_DIR}/${productId}-${target}-${stamp}-${suffix}.webp`;

  try {
    const result = await putGitHubImage(env, path, new Uint8Array(buffer), `Bibika: upload ${target} for ${productId}`);
    return jsonResponse({ ok: true, path, bytes: buffer.byteLength, commit: result.commit?.sha || null, url: result.content?.html_url || null });
  } catch (error) {
    return jsonResponse({ error: `Не удалось загрузить изображение в GitHub: ${error.message}` }, 502);
  }
}

async function handleImageCleanupApi(request, env) {
  if (!env.GITHUB_TOKEN) return jsonResponse({ error: "GitHub publishing is not configured." }, 503);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Некорректный JSON." }, 400);
  }

  const paths = Array.isArray(body?.paths) ? body.paths : [];
  if (!paths.length) return jsonResponse({ ok: true, deleted: [], skipped: [], failed: [] });
  if (paths.length > MAX_CLEANUP_PATHS) return jsonResponse({ error: "Слишком много файлов для очистки за один запрос." }, 400);

  try {
    return jsonResponse({ ok: true, ...(await cleanupCandidates(env, paths)) });
  } catch (error) {
    return jsonResponse({ error: `Не удалось очистить изображения: ${error.message}` }, 502);
  }
}

async function getReleaseByTag(env, tag) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`, {
    method: "GET",
    headers: githubHeaders(env),
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `GitHub HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function createRelease(env, tag, title, version) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`, {
    method: "POST",
    headers: { ...githubHeaders(env), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: GITHUB_BRANCH,
      name: `${title} ${version}`.trim(),
      body: `Application files published from Kianan Bibika for ${title}.`,
      draft: false,
      prerelease: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `GitHub HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function getOrCreateRelease(env, tag, title, version) {
  const existing = await getReleaseByTag(env, tag);
  if (existing) return existing;
  return createRelease(env, tag, title, version);
}

async function handleReleaseUploadApi(request, env) {
  if (!env.GITHUB_TOKEN) return jsonResponse({ error: "GitHub Releases publishing is not configured." }, 503);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!request.body) return jsonResponse({ error: "Файл не выбран." }, 400);

  const pageId = sanitizeSlug(request.headers.get("X-Bibika-Page"), "app");
  const title = decodeHeaderValue(request.headers.get("X-Bibika-Title")) || pageId;
  const platform = sanitizeSlug(request.headers.get("X-Bibika-Platform"), "file");
  const version = decodeHeaderValue(request.headers.get("X-Bibika-Version")).trim();
  const requestedName = decodeHeaderValue(request.headers.get("X-Bibika-File-Name"));
  if (!version) return jsonResponse({ error: "Не указана версия файла." }, 400);
  if (!requestedName) return jsonResponse({ error: "Не указано имя файла." }, 400);

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_RELEASE_FILE_BYTES) {
    return jsonResponse({ error: "Файл слишком большой для загрузки через Bibika. Максимум 90 МБ." }, 413);
  }

  const cleanVersion = sanitizeReleaseVersion(version);
  const tag = `${pageId}-v${cleanVersion}`;
  const baseName = sanitizeAssetName(requestedName, `${pageId}-${platform}-${cleanVersion}.bin`);
  const contentType = String(request.headers.get("Content-Type") || "application/octet-stream").split(";", 1)[0].trim() || "application/octet-stream";

  try {
    const release = await getOrCreateRelease(env, tag, title, version);
    const assetName = uniqueAssetName(baseName, release.assets);
    const uploadUrl = `https://uploads.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`;
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        ...githubHeaders(env),
        "Content-Type": contentType,
      },
      body: request.body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || `GitHub upload HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return jsonResponse({
      ok: true,
      repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      releaseId: release.id,
      releaseTag: tag,
      releaseUrl: release.html_url,
      assetId: payload.id,
      fileName: payload.name || assetName,
      fileSize: Number(payload.size || declaredLength || 0),
      contentType: payload.content_type || contentType,
      url: payload.browser_download_url,
    });
  } catch (error) {
    return jsonResponse({ error: `Не удалось загрузить файл в GitHub Releases: ${error.message}` }, 502);
  }
}

async function handleReleaseAssetDeleteApi(request, env) {
  if (!env.GITHUB_TOKEN) return jsonResponse({ error: "GitHub Releases publishing is not configured." }, 503);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Некорректный JSON." }, 400);
  }

  const ids = [...new Set((Array.isArray(body?.assetIds) ? body.assetIds : []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (!ids.length) return jsonResponse({ ok: true, deleted: [], failed: [] });
  if (ids.length > 30) return jsonResponse({ error: "Слишком много файлов для удаления за один запрос." }, 400);

  const deleted = [];
  const failed = [];
  for (const id of ids) {
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${id}`, {
        method: "DELETE",
        headers: githubHeaders(env),
      });
      if (response.status === 204 || response.status === 404) {
        deleted.push(id);
        continue;
      }
      const payload = await response.json().catch(() => ({}));
      failed.push({ id, error: payload.message || `GitHub HTTP ${response.status}` });
    } catch (error) {
      failed.push({ id, error: error.message });
    }
  }
  return jsonResponse({ ok: failed.length === 0, deleted, failed }, failed.length ? 207 : 200);
}

async function handleRequest(request, env) {
  const expectedUser = env.BIBIKA_USER;
  const expectedPassword = env.BIBIKA_PASSWORD;
  if (!expectedUser || !expectedPassword) {
    return new Response("Bibika authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization || !authorization.startsWith("Basic ")) return unauthorized();

  let credentials;
  try {
    credentials = atob(authorization.slice(6));
  } catch {
    return unauthorized();
  }
  const separator = credentials.indexOf(":");
  if (separator < 0) return unauthorized();
  if (credentials.slice(0, separator) !== expectedUser || credentials.slice(separator + 1) !== expectedPassword) return unauthorized();

  const url = new URL(request.url);
  if (url.pathname === "/api/catalog") return handleCatalogApi(request, env);
  if (url.pathname === "/api/image") return handleImageApi(request, env);
  if (url.pathname === "/api/image/cleanup") return handleImageCleanupApi(request, env);
  if (url.pathname === "/api/release/upload") return handleReleaseUploadApi(request, env);
  if (url.pathname === "/api/release/asset/delete") return handleReleaseAssetDeleteApi(request, env);

  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cache-Control", "no-store");

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("text/html")) {
    const html = await response.text();
    const additions = `<script defer src="/image-editor.js?v=1"></script><script defer src="/image-cleanup.js?v=1"></script><script defer src="/text-page-files.js?v=1"></script><script defer src="/text-page-blocks.js?v=1"></script><script>window.addEventListener("DOMContentLoaded",function(){try{publishData=function(nextState,message){return requestJson("/api/catalog",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({data:nextState,message:message})});};}catch(e){console.error("Bibika publish hotfix",e);}});</script>`;
    const patched = html.includes("</body>") ? html.replace("</body>", `${additions}</body>`) : `${html}${additions}`;
    return new Response(patched, { status: response.status, statusText: response.statusText, headers });
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        return jsonResponse({ error: `Внутренняя ошибка Bibika Worker: ${error?.message || String(error)}` }, 500);
      }
      return new Response("Bibika Worker error", {
        status: 500,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  },
};