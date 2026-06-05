/**
 * Netlify Function: Recraft V3 SVG Proxy
 * Validates Netlify Identity JWT, enforces daily quota (1 unit per pictogram),
 * calls Recraft API for SVG generation, fetches the resulting SVG, and returns it.
 *
 * Phase 3 (PRODUCIR) of the visual-reasoning pipeline.
 * Each successful Recraft call = 1 pictogram unit toward the daily quota.
 */

import { checkAndCharge, logCall } from './_shared/usage.js';

const ALLOWED_ORIGINS = [
  'https://pictos.net',
  'https://next.pictos.net',
  'https://pictos-next.netlify.app',
];

const RECRAFT_API_URL = 'https://external.api.recraft.ai/v1/images/generations';

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

export const handler = async (event, context) => {
  const origin = event.headers?.origin || '';
  const headers = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { user } = context.clientContext || {};
  const isLocalDev = process.env.NETLIFY_DEV === 'true';
  if (!isLocalDev && !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  if (isLocalDev && !user) {
    console.log('[api-recraft] Local dev mode — skipping JWT validation');
  }

  const email = user?.email ?? 'dev';

  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey) {
    console.error('[api-recraft] RECRAFT_API_KEY not configured');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  let prompt;
  try {
    ({ prompt } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!prompt) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required field: prompt' }) };
  }

  // Quota check — 1 unit per pictogram (Recraft call = the core generation unit)
  const quota = await checkAndCharge(email, 1);
  if (!quota.allowed) {
    console.warn(`[api-recraft] quota exceeded for ${email} (${quota.units_used}/${quota.limit})`);
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: 'Daily quota exceeded',
        units_used: quota.units_used,
        limit: quota.limit,
      }),
    };
  }

  console.log(`[api-recraft] user=${email} model=recraftv4_1_vector today=${quota.units_used}/${quota.limit}`);

  const startMs = Date.now();

  try {
    const body = {
      model: 'recraftv4_1_vector',
      prompt,
      n: 1,
    };

    const recraftRes = await fetch(RECRAFT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!recraftRes.ok) {
      const errText = await recraftRes.text().catch(() => recraftRes.statusText);
      console.error(`[api-recraft] Recraft error ${recraftRes.status}: ${errText}`);

      await logCall({
        email, phase: 'recraft', model: 'recraftv3_svg', units_charged: 1,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false, error_msg: `Recraft ${recraftRes.status}: ${errText}`,
      });

      return { statusCode: 502, headers, body: JSON.stringify({ error: `Recraft error: ${errText}` }) };
    }

    const data = await recraftRes.json();
    const imageUrl = data?.data?.[0]?.url;

    if (!imageUrl) {
      console.error('[api-recraft] No image URL in response:', JSON.stringify(data));
      await logCall({
        email, phase: 'recraft', model: 'recraftv3_svg', units_charged: 1,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false, error_msg: 'No image URL in Recraft response',
      });
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Recraft returned no image URL' }) };
    }

    // Fetch the SVG content from the CDN URL
    const svgRes = await fetch(imageUrl);
    if (!svgRes.ok) {
      await logCall({
        email, phase: 'recraft', model: 'recraftv3_svg', units_charged: 1,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false, error_msg: `CDN fetch failed: ${svgRes.status}`,
      });
      return { statusCode: 502, headers, body: JSON.stringify({ error: `Failed to fetch SVG from Recraft CDN: ${svgRes.status}` }) };
    }

    const svgContent = await svgRes.text();

    if (!svgContent.trim().startsWith('<') && !svgContent.includes('<svg')) {
      console.error('[api-recraft] Response does not look like SVG:', svgContent.slice(0, 200));
      await logCall({
        email, phase: 'recraft', model: 'recraftv3_svg', units_charged: 1,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false, error_msg: 'Response not valid SVG',
      });
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Recraft response is not valid SVG' }) };
    }

    const ms = Date.now() - startMs;
    await logCall({
      email, phase: 'recraft', model: 'recraftv3_svg', units_charged: 1,
      ms, tokens_in: 0, tokens_out: Math.round(svgContent.length / 4), ok: true,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ svg: svgContent }),
    };

  } catch (error) {
    console.error(`[api-recraft] Error: ${error.message}`);
    await logCall({
      email, phase: 'recraft', model: 'recraftv3_svg', units_charged: 1,
      ms: Date.now() - startMs,
      tokens_in: 0, tokens_out: 0, ok: false, error_msg: error.message,
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Recraft service error' }),
    };
  }
};
