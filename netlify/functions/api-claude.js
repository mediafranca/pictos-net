/**
 * Netlify Function: Anthropic Claude API Proxy
 * Validates Netlify Identity JWT, enforces daily quota, then forwards the
 * request to Claude with the server-side API key (never exposed to client).
 *
 * Quota:
 *   claude-haiku   (phases 1+2): 0 units  — cheap, not counted
 *   claude-sonnet  (phase 5)   : 0 units  — structuring step, not counted
 *
 * Phases: 1 (COMPRENDER), 2 (COMPONER), 5 (ESTRUCTURAR / vision)
 */

import Anthropic from '@anthropic-ai/sdk';
import { checkAndCharge, logCall } from './_shared/usage.js';
import { connectBlobs } from './_shared/blobs.js';

const ALLOWED_ORIGINS = [
  'https://pictos.net',
  'https://next.pictos.net',
  'https://pictos-next.netlify.app',
];

const ALLOWED_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
];

// All Claude calls are free-tier in the quota — only Recraft (phase 3) counts.
const UNITS_BY_MODEL = {
  'claude-haiku-4-5-20251001': 0,
  'claude-sonnet-4-6': 0,
};

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
  connectBlobs(event);
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
    console.log('[api-claude] Local dev mode — skipping JWT validation');
  }

  const email = user?.email ?? 'dev';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[api-claude] ANTHROPIC_API_KEY not configured');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  let model, max_tokens, system, tools, tool_choice, messages;
  try {
    ({ model, max_tokens, system, tools, tool_choice, messages } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!model || !messages) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: model, messages' }) };
  }

  if (!ALLOWED_MODELS.includes(model)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Model not allowed: ${model}` }) };
  }

  // Quota check (Sonnet = 1 unit; Haiku = 0 units, always allowed)
  const units = UNITS_BY_MODEL[model] ?? 1;
  const quota = await checkAndCharge(email, units);
  if (!quota.allowed) {
    console.warn(`[api-claude] quota exceeded for ${email} (${quota.units_used}/${quota.limit})`);
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

  console.log(`[api-claude] user=${email} model=${model} units=${units} today=${quota.units_used}/${quota.limit}`);

  const startMs = Date.now();
  let response, ok = true, errorMsg;

  try {
    const client = new Anthropic({ apiKey });

    const params = {
      model,
      max_tokens: Math.min(max_tokens || 4096, 8192),
      messages,
    };
    if (system) params.system = system;
    if (tools) params.tools = tools;
    if (tool_choice) params.tool_choice = tool_choice;

    response = await client.messages.create(params);
  } catch (error) {
    ok = false;
    errorMsg = error.message;
    console.error(`[api-claude] Error: ${error.message}`);

    await logCall({
      email, phase: 'claude', model, units_charged: units,
      ms: Date.now() - startMs,
      tokens_in: 0, tokens_out: 0, ok: false, error_msg: errorMsg,
    });

    return { statusCode: 500, headers, body: JSON.stringify({ error: errorMsg || 'Claude API error' }) };
  }

  const ms = Date.now() - startMs;
  await logCall({
    email, phase: 'claude', model, units_charged: units,
    ms,
    tokens_in: response.usage?.input_tokens ?? 0,
    tokens_out: response.usage?.output_tokens ?? 0,
    ok: true,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      content: response.content,
      stop_reason: response.stop_reason,
      usage: response.usage,
    }),
  };
};
