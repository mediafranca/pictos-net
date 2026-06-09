/**
 * Netlify Background Function: Gemini Image Generation Proxy
 *
 * Generates an image via the Gemini API and stores the result in Netlify Blobs
 * for the client to poll via api-gemini-poll.
 *
 * Implements: GeminiKeySelection rule (usage-enforcement.allium) —
 *   GEMINI_LOCAL_API_KEY for local dev, GEMINI_PUBLIC_API_KEY for deployed.
 *   GEMINI_PUBLIC_API_KEY must be restricted by API restriction (not HTTP referrer).
 */

import { checkAndCharge, logCall } from './_shared/usage.js';
import { getBlobStore as getStore, connectBlobs } from './_shared/blobs.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const ALLOWED_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
];

export const handler = async (event, context) => {
  connectBlobs(event);

  let bodyPayload;
  try {
    bodyPayload = JSON.parse(event.body);
  } catch (err) {
    console.error('[api-gemini-worker] Invalid JSON body');
    return;
  }

  const { prompt, model, jobId } = bodyPayload;
  if (!jobId || !prompt || !model) {
    console.error('[api-gemini-worker] Missing jobId, prompt, or model');
    return;
  }

  if (!ALLOWED_MODELS.includes(model)) {
    console.error(`[api-gemini-worker] Disallowed model: ${model}`);
    return;
  }

  const store = getStore('gemini-jobs');
  await store.setJSON(jobId, { pending: true });

  let user = context.clientContext?.user;
  const isLocalDev = process.env.NETLIFY_DEV === 'true';

  // Background functions in production do not populate context.clientContext;
  // reconstruct user from the Authorization header JWT.
  if (!user && !isLocalDev) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          user = { email: payload.email, sub: payload.sub };
        }
      } catch (err) {
        console.error('[api-gemini-worker] Failed to decode JWT:', err.message);
      }
    }
  }

  const email = user?.email ?? 'dev';

  if (!isLocalDev && !user) {
    await store.setJSON(jobId, { error: 'Unauthorized' });
    return;
  }

  // GeminiKeySelection rule: local → GEMINI_LOCAL_API_KEY, deployed → GEMINI_PUBLIC_API_KEY
  const apiKey = isLocalDev
    ? process.env.GEMINI_LOCAL_API_KEY
    : process.env.GEMINI_PUBLIC_API_KEY;

  if (!apiKey) {
    console.error('[api-gemini-worker] Gemini API key not configured');
    await store.setJSON(jobId, { error: 'Server configuration error' });
    return;
  }


  // Quota check — 1 unit per image generation call (usage-enforcement.allium)
  const quota = await checkAndCharge(email, 1);
  if (!quota.allowed) {
    console.warn(`[api-gemini-worker] quota exceeded for ${email} (${quota.units_used}/${quota.limit})`);
    await store.setJSON(jobId, {
      error: 'Daily quota exceeded',
      quotaExceeded: true,
      units_used: quota.units_used,
      limit: quota.limit,
    });
    return;
  }

  console.log(`[api-gemini-worker] user=${email} model=${model} today=${quota.units_used}/${quota.limit} jobId=${jobId}`);

  const startMs = Date.now();

  try {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
    // Add Referer so HTTP-referrer-restricted keys are not blocked by Google.
    // The proper fix is to switch GEMINI_PUBLIC_API_KEY from HTTP-referrer to
    // API restriction in Google Cloud Console (see .env.example), but this
    // header ensures server-side calls are accepted either way.
    const deployUrl = process.env.URL || 'https://next.pictos.net';
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Referer': `${deployUrl}/` },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => geminiRes.statusText);
      console.error(`[api-gemini-worker] Gemini error ${geminiRes.status}: ${errText}`);
      await logCall({
        email, phase: 'gemini', model, units_charged: 1,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false,
        error_msg: `Gemini ${geminiRes.status}: ${errText.slice(0, 300)}`,
      });
      await store.setJSON(jobId, { error: `Gemini error: ${errText.slice(0, 200)}` });
      return;
    }

    const data = await geminiRes.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart?.inlineData?.data) {
      console.error('[api-gemini-worker] No image data in Gemini response');
      await logCall({
        email, phase: 'gemini', model, units_charged: 1,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false,
        error_msg: 'No image data in Gemini response',
      });
      await store.setJSON(jobId, { error: 'Gemini returned no image data' });
      return;
    }

    const mimeType = imagePart.inlineData.mimeType;
    const base64Data = imagePart.inlineData.data;
    const bitmap = `data:${mimeType};base64,${base64Data}`;

    const ms = Date.now() - startMs;
    await logCall({
      email, phase: 'gemini', model, units_charged: 1,
      ms, tokens_in: 0, tokens_out: Math.round(base64Data.length / 4), ok: true,
    });

    await store.setJSON(jobId, { bitmap });

  } catch (error) {
    console.error(`[api-gemini-worker] Error: ${error.message}`);
    await logCall({
      email, phase: 'gemini', model, units_charged: 1,
      ms: Date.now() - startMs,
      tokens_in: 0, tokens_out: 0, ok: false, error_msg: error.message,
    });
    await store.setJSON(jobId, { error: error.message || 'Gemini service error' });
  }
};
