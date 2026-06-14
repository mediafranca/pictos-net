/**
 * Resilient fetch helpers shared by the image-generation background workers
 * (api-gemini-worker-background.js — Vertex AI, and
 *  api-recraft-worker-background.js — Recraft).
 *
 * Why this exists: occasionally the upstream generation call throws a bare
 * "fetch failed". That string is an undici transport-level TypeError (DNS,
 * IPv6/happy-eyeballs, or a dead keep-alive socket). The real reason is hidden
 * inside `error.cause`, so the previous catch blocks — which stored only
 * `error.message` — left us blind and surfaced the useless "fetch failed" to
 * the user. These helpers (1) retry transient transport failures with
 * exponential backoff and (2) flatten the error into a readable string that
 * preserves the underlying cause code (ECONNRESET, ENETUNREACH, UND_ERR_SOCKET).
 */

/**
 * Pause for `ms` milliseconds. Internal helper for fetchWithRetry's backoff.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Flatten a network/undici error into a human-readable string, keeping the
 * underlying `error.cause` (the part that actually says why the socket died).
 *
 * Used in the catch blocks of both image workers so logs and the client get
 * "fetch failed — cause: ENETUNREACH ..." instead of just "fetch failed".
 */
export function describeFetchError(error) {
  const parts = [error?.message || 'Unknown error'];
  const cause = error?.cause;
  if (cause) {
    const code = cause.code || cause.errno;
    const detail = [code, cause.message].filter(Boolean).join(' ');
    if (detail) parts.push(`cause: ${detail}`);
  }
  return parts.join(' — ');
}

/**
 * fetch() with retry + exponential backoff for transient failures.
 *
 * Retries on: network-level throws (the "fetch failed" TypeError) and upstream
 * 5xx responses. Does NOT retry 4xx (auth, quota, bad request) — those are
 * returned to the caller unchanged so existing handling still applies.
 *
 * Used by both image workers for the upstream generation request (and, in the
 * Recraft worker, the CDN image download).
 *
 * @param {string} url
 * @param {RequestInit} options    Standard fetch options.
 * @param {{retries?: number, baseDelayMs?: number}} cfg
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options, { retries = 2, baseDelayMs = 600 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      // Retry transient upstream 5xx; return everything else to the caller.
      if (res.status >= 500 && res.status < 600 && attempt < retries) {
        lastError = new Error(`Upstream ${res.status}`);
        await delay(baseDelayMs * 2 ** attempt);
        continue;
      }
      return res;
    } catch (error) {
      // Transport-level failure (DNS/IPv6/socket). Back off and retry.
      lastError = error;
      if (attempt < retries) {
        await delay(baseDelayMs * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
