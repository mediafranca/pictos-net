/**
 * Netlify Background Function: Recraft V3 SVG Proxy
 * This runs in the background (up to 15 mins) to bypass the 10-second limit
 * on synchronous Netlify functions.
 * It stores the result in Netlify Blobs for the client to poll.
 */

import { checkAndCharge, logCall } from './_shared/usage.js';
import { getBlobStore as getStore, connectBlobs } from './_shared/blobs.js';

const RECRAFT_API_URL = 'https://external.api.recraft.ai/v1/images/generations';

export const handler = async (event, context) => {
  connectBlobs(event);
  let bodyPayload;
  try {
    bodyPayload = JSON.parse(event.body);
  } catch (err) {
    console.error('[api-recraft-worker] Invalid JSON body');
    return;
  }

  const { prompt, colors, jobId, model = 'recraftv4_1_vector' } = bodyPayload;
  if (!jobId || !prompt) {
    console.error('[api-recraft-worker] Missing jobId or prompt');
    return;
  }

  const ALLOWED_MODELS = ['recraftv4_1', 'recraftv4_1_vector'];
  if (!ALLOWED_MODELS.includes(model)) {
    console.error(`[api-recraft-worker] Disallowed model: ${model}`);
    await store.setJSON(jobId, { error: `Model not allowed: ${model}` });
    return;
  }

  const store = getStore('recraft-jobs');
  
  // Set initial status to pending so poller knows it started
  await store.setJSON(jobId, { pending: true });

  let user = context.clientContext?.user;
  const isLocalDev = process.env.NETLIFY_DEV === 'true';

  // In Netlify Background Functions in production, context.clientContext is missing.
  // We reconstruct the user context from the Authorization header JWT.
  if (!user && !isLocalDev) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          user = {
            email: payload.email,
            sub: payload.sub,
            user_metadata: payload.user_metadata,
          };
        }
      } catch (err) {
        console.error('[api-recraft-worker] Failed to decode JWT from Authorization header:', err.message);
      }
    }
  }

  const email = user?.email ?? 'dev';

  if (!isLocalDev && !user) {
    await store.setJSON(jobId, { error: 'Unauthorized' });
    return;
  }

  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey) {
    await store.setJSON(jobId, { error: 'Server configuration error' });
    return;
  }

  if (prompt.length > 10000) {
    await store.setJSON(jobId, { error: 'Prompt too long (max 10000 characters)' });
    return;
  }

  // Quota check
  const quota = await checkAndCharge(email, 1);
  if (!quota.allowed) {
    console.warn(`[api-recraft-worker] quota exceeded for ${email} (${quota.units_used}/${quota.limit})`);
    await store.setJSON(jobId, {
      error: 'Daily quota exceeded',
      quotaExceeded: true,
      units_used: quota.units_used,
      limit: quota.limit,
    });
    return;
  }

  console.log(`[api-recraft-worker] user=${email} model=${model} today=${quota.units_used}/${quota.limit} jobId=${jobId}`);

  const startMs = Date.now();

  try {
    const body = {
      model,
      prompt,
      n: 1,
      size: '1:1',
      ...(Array.isArray(colors) && colors.length > 0 ? {
        controls: {
          colors: colors.slice(0, 10).map(hex => ({
            rgb: [
              parseInt(hex.slice(1, 3), 16),
              parseInt(hex.slice(3, 5), 16),
              parseInt(hex.slice(5, 7), 16),
            ],
          })),
        },
      } : {}),
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
      console.error(`[api-recraft-worker] Recraft error ${recraftRes.status}: ${errText}`);
      await logCall({
        email, phase: 'recraft', model, units_charged: 1,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false, error_msg: `Recraft ${recraftRes.status}: ${errText}`,
      });
      await store.setJSON(jobId, { error: `Recraft error: ${errText}` });
      return;
    }

    const data = await recraftRes.json();
    const imageUrl = data?.data?.[0]?.url;

    if (!imageUrl) {
      console.error('[api-recraft-worker] No image URL in response');
      await logCall({
        email, phase: 'recraft', model, units_charged: 1,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false, error_msg: 'No image URL in Recraft response',
      });
      await store.setJSON(jobId, { error: 'Recraft returned no image URL' });
      return;
    }

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      await logCall({
        email, phase: 'recraft', model, units_charged: 1,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false, error_msg: `CDN fetch failed: ${imageRes.status}`,
      });
      await store.setJSON(jobId, { error: `Failed to fetch image from Recraft CDN: ${imageRes.status}` });
      return;
    }

    const ms = Date.now() - startMs;

    if (model === 'recraftv4_1_vector') {
      // Vector model: fetch and validate SVG text
      const svgContent = await imageRes.text();
      if (!svgContent.trim().startsWith('<') && !svgContent.includes('<svg')) {
        await logCall({
          email, phase: 'recraft', model, units_charged: 1,
          ms, tokens_in: 0, tokens_out: 0, ok: false, error_msg: 'Response not valid SVG',
        });
        await store.setJSON(jobId, { error: 'Recraft response is not valid SVG' });
        return;
      }
      await logCall({
        email, phase: 'recraft', model, units_charged: 1,
        ms, tokens_in: 0, tokens_out: Math.round(svgContent.length / 4), ok: true,
      });
      await store.setJSON(jobId, { svg: svgContent });
    } else {
      // Raster model (recraftv4_1): fetch PNG, convert to base64 data URL
      const arrayBuffer = await imageRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const bitmap = `data:image/png;base64,${base64}`;
      await logCall({
        email, phase: 'recraft', model, units_charged: 1,
        ms, tokens_in: 0, tokens_out: Math.round(base64.length / 4), ok: true,
      });
      await store.setJSON(jobId, { bitmap });
    }

  } catch (error) {
    console.error(`[api-recraft-worker] Error: ${error.message}`);
    await logCall({
      email, phase: 'recraft', model, units_charged: 1,
      ms: Date.now() - startMs,
      tokens_in: 0, tokens_out: 0, ok: false, error_msg: error.message,
    });
    await store.setJSON(jobId, { error: error.message || 'Recraft service error' });
  }
};
