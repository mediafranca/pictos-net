/**
 * Netlify Function: Gemini Vision + Function Calling Proxy (Phase 5 — ESTRUCTURAR)
 *
 * Accepts a Claude-style request (model, messages, tools, tool_choice, system),
 * translates it to Gemini REST format, calls the Gemini API synchronously,
 * and returns a Claude-compatible response shape for uniform handling in the client.
 *
 * Supported models: gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash
 * Phase 5 calls are free-tier in the quota (0 units charged).
 */

import { logCall } from './_shared/usage.js';
import { connectBlobs } from './_shared/blobs.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const ALLOWED_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

const ALLOWED_ORIGINS = [
  'https://pictos.net',
  'https://next.pictos.net',
  'https://pictos-next.netlify.app',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

/**
 * Translate a Claude-style content block array to Gemini parts array.
 * Handles: { type: 'text', text } and { type: 'image', source: { type: 'base64', media_type, data } }
 */
function claudeContentToGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  return content.map(block => {
    if (block.type === 'text') return { text: block.text };
    if (block.type === 'image' && block.source?.type === 'base64') {
      return {
        inlineData: {
          mimeType: block.source.media_type,
          data: block.source.data,
        },
      };
    }
    console.warn('[api-gemini-structure] Unknown content block type:', block.type);
    return { text: '' };
  });
}

/**
 * Translate Claude tool schema (input_schema) to Gemini function declaration (parameters).
 * Gemini uses the same JSON Schema subset, so this is mostly a rename.
 */
function claudeToolToGeminiFunctionDeclaration(tool) {
  return {
    name: tool.name,
    description: tool.description ?? '',
    parameters: tool.input_schema ?? {},
  };
}

async function handleRequest(event, context) {
  connectBlobs(event);
  const origin = event.headers?.origin || '';
  const headers = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { user } = context.clientContext || {};
  const isLocalDev = process.env.NETLIFY_DEV === 'true';
  if (!isLocalDev && !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const apiKey = isLocalDev
    ? process.env.GEMINI_LOCAL_API_KEY
    : process.env.GEMINI_PUBLIC_API_KEY;

  if (!apiKey) {
    console.error('[api-gemini-structure] Gemini API key not configured');
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

  const email = user?.email ?? 'dev';

  // Phase 5 Gemini calls are free-tier (0 units)
  console.log(`[api-gemini-structure] user=${email} model=${model}`);

  // ── Translate to Gemini format ─────────────────────────────────────────────

  // messages[0] is the user turn
  const userContent = messages[0]?.content ?? [];
  const geminiContents = [{
    role: 'user',
    parts: claudeContentToGeminiParts(userContent),
  }];

  const geminiBody = {
    contents: geminiContents,
  };

  // System instruction
  if (system) {
    const systemText = typeof system === 'string' ? system : system.map(b => b.text ?? '').join('\n');
    geminiBody.systemInstruction = { parts: [{ text: systemText }] };
  }

  // Tools (function declarations)
  if (tools && tools.length > 0) {
    geminiBody.tools = [{
      functionDeclarations: tools.map(claudeToolToGeminiFunctionDeclaration),
    }];
  }

  // Tool choice (force function call)
  if (tool_choice?.name) {
    geminiBody.toolConfig = {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [tool_choice.name],
      },
    };
  }

  // Generation config
  geminiBody.generationConfig = {
    maxOutputTokens: Math.min(max_tokens || 8192, 8192),
  };

  // ── Call Gemini API ────────────────────────────────────────────────────────

  const deployUrl = process.env.URL || 'https://next.pictos.net';
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const startMs = Date.now();
  let geminiData, ok = true, errorMsg;

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': `${deployUrl}/`,
      },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => geminiRes.statusText);
      console.error(`[api-gemini-structure] Gemini error ${geminiRes.status}: ${errText.slice(0, 400)}`);
      ok = false;
      errorMsg = `Gemini ${geminiRes.status}: ${errText.slice(0, 200)}`;

      await logCall({
        email, phase: 'gemini-structure', model, units_charged: 0,
        ms: Date.now() - startMs,
        tokens_in: 0, tokens_out: 0, ok: false, error_msg: errorMsg,
      });

      return { statusCode: 500, headers, body: JSON.stringify({ error: errorMsg }) };
    }

    geminiData = await geminiRes.json();
  } catch (error) {
    ok = false;
    errorMsg = error.message;
    console.error(`[api-gemini-structure] fetch error: ${error.message}`);

    await logCall({
      email, phase: 'gemini-structure', model, units_charged: 0,
      ms: Date.now() - startMs,
      tokens_in: 0, tokens_out: 0, ok: false, error_msg: errorMsg,
    });

    return { statusCode: 500, headers, body: JSON.stringify({ error: errorMsg }) };
  }

  const ms = Date.now() - startMs;

  // ── Translate Gemini response to Claude format ────────────────────────────

  const candidate = geminiData?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const usage = geminiData?.usageMetadata ?? {};

  // Find the function call part
  const funcCallPart = parts.find(p => p.functionCall);

  if (!funcCallPart?.functionCall) {
    const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
    console.error(`[api-gemini-structure] No function call in response. Parts: ${JSON.stringify(parts).slice(0, 400)}`);

    await logCall({
      email, phase: 'gemini-structure', model, units_charged: 0,
      ms,
      tokens_in: usage.promptTokenCount ?? 0,
      tokens_out: usage.candidatesTokenCount ?? 0,
      ok: false,
      error_msg: 'No function call in Gemini response',
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Gemini did not invoke the tool. Response: ${textParts.slice(0, 200)}` }),
    };
  }

  await logCall({
    email, phase: 'gemini-structure', model, units_charged: 0,
    ms,
    tokens_in: usage.promptTokenCount ?? 0,
    tokens_out: usage.candidatesTokenCount ?? 0,
    ok: true,
  });

  console.log(`[api-gemini-structure] user=${email} model=${model} ms=${ms} in=${usage.promptTokenCount ?? '?'} out=${usage.candidatesTokenCount ?? '?'}`);

  // Return Claude-compatible response
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      content: [{
        type: 'tool_use',
        name: funcCallPart.functionCall.name,
        input: funcCallPart.functionCall.args ?? {},
      }],
      stop_reason: 'tool_use',
      usage: {
        input_tokens: usage.promptTokenCount ?? 0,
        output_tokens: usage.candidatesTokenCount ?? 0,
      },
    }),
  };
}

export const handler = async (event, context) => {
  const origin = event.headers?.origin || '';
  const headers = corsHeaders(origin);
  try {
    return await handleRequest(event, context);
  } catch (err) {
    console.error('[api-gemini-structure] unhandled exception:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err?.message || 'Internal server error' }),
    };
  }
};
