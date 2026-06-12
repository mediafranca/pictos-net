/**
 * Usage tracking and quota enforcement for PictoNet Netlify Functions.
 *
 * Uses Netlify Blobs (no external service required).
 *
 * Quota model:
 *   - Each api-recraft call          = 1 unit  (one generated pictogram)
 *   - All api-claude calls           = 0 units (phases 1+2+5, not counted)
 *   - Default daily limit: DAILY_LIMIT_PER_USER env var (default: 50)
 *
 * Blob schema:
 *   Store: "pictonet-usage"
 *   quota/{email}/{YYYY-MM-DD}         → { units, first_call, last_call }
 *   audit/{YYYY-MM-DD}/{ts-safe-email} → { ts, email, phase, model, units_charged,
 *                                          ms, tokens_in, tokens_out, ok, error_msg }
 */

import { getBlobStore as getStore } from './blobs.js';

const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT_PER_USER ?? '50', 10);
const STORE_NAME = 'pictonet-usage';

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function safeEmail(email) {
  return email.replace(/[^a-zA-Z0-9@._-]/g, '_').slice(0, 80);
}

/**
 * Check quota and increment if allowed.
 *
 * @param {string}   email  - user email (use 'dev' for local dev, always allowed)
 * @param {number}   units  - units to charge (0 = log only, no quota impact)
 * @param {string[]} roles  - Netlify Identity roles from app_metadata.roles
 * @returns {{ allowed: boolean, units_used: number, limit: number }}
 */
export async function checkAndCharge(email, units = 1, roles = []) {
  // Dev mode or anonymous: always allow, no tracking
  if (!email || email === 'dev') {
    return { allowed: true, units_used: 0, limit: DAILY_LIMIT };
  }

  // Superusers bypass the daily quota entirely
  if (Array.isArray(roles) && roles.includes('superuser')) {
    return { allowed: true, units_used: 0, limit: Infinity };
  }

  if (units === 0) {
    return { allowed: true, units_used: 0, limit: DAILY_LIMIT };
  }

  const store = getStore(STORE_NAME);
  const date = today();
  const key = `quota/${email}/${date}`;

  let current = { units: 0, first_call: null, last_call: null };
  try {
    current = await store.get(key, { type: 'json' }) ?? current;
  } catch {
    // Blob not found → first call today
  }

  if (current.units >= DAILY_LIMIT) {
    return { allowed: false, units_used: current.units, limit: DAILY_LIMIT };
  }

  const updated = {
    units: current.units + units,
    first_call: current.first_call ?? new Date().toISOString(),
    last_call: new Date().toISOString(),
  };

  try {
    await store.set(key, JSON.stringify(updated));
  } catch (err) {
    // Don't block the request if the write fails — log and continue
    console.error(`[usage] quota write failed for ${email}:`, err.message);
  }

  return { allowed: true, units_used: updated.units, limit: DAILY_LIMIT };
}

/**
 * Record an API call for audit purposes.
 * Non-blocking — failures are logged but never thrown.
 *
 * @param {{ email, phase, model, units_charged, ms, tokens_in, tokens_out, ok, error_msg }} record
 */
export async function logCall(record) {
  try {
    const store = getStore(STORE_NAME);
    const ts = new Date().toISOString();
    const date = ts.slice(0, 10);
    // Unique key per call — no race condition on concurrent writes
    const tsKey = ts.slice(11, 23).replace(/[:.]/g, '-');
    const key = `audit/${date}/${tsKey}-${safeEmail(record.email ?? 'anon')}`;

    await store.set(key, JSON.stringify({ ts, ...record }));
  } catch (err) {
    console.error('[usage] audit log write failed:', err.message);
  }
}

/**
 * Return daily usage summary grouped by user.
 * Reads all audit entries for the given date (default: today).
 *
 * @param {string} [date] - YYYY-MM-DD
 * @returns {Promise<Record<string, { calls, units, phases, errors }>>}
 */
export async function getDailySummary(date = today()) {
  const store = getStore(STORE_NAME);
  const { blobs } = await store.list({ prefix: `audit/${date}/` });

  const byUser = {};
  for (const blob of blobs) {
    let record;
    try {
      record = await store.get(blob.key, { type: 'json' });
    } catch {
      continue;
    }
    if (!record) continue;

    const { email, phase, units_charged = 0, ok } = record;
    if (!byUser[email]) byUser[email] = { calls: 0, units: 0, phases: {}, errors: 0 };
    byUser[email].calls++;
    byUser[email].units += units_charged;
    byUser[email].phases[phase] = (byUser[email].phases[phase] ?? 0) + 1;
    if (!ok) byUser[email].errors++;
  }

  return byUser;
}

/**
 * Return raw quota entry for a user on a given date.
 * Useful for admin inspection.
 *
 * @param {string} email
 * @param {string} [date]
 */
export async function getUserQuota(email, date = today()) {
  const store = getStore(STORE_NAME);
  try {
    return await store.get(`quota/${email}/${date}`, { type: 'json' });
  } catch {
    return null;
  }
}
