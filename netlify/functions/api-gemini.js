/**
 * Netlify Function: Gemini API Proxy
 * Validates Netlify Identity JWT, then forwards the request to Gemini
 * with the server-side API key (never exposed to the client).
 */

const { GoogleGenAI } = require("@google/genai");

const ALLOWED_ORIGINS = [
  'https://pictos.net',
  'https://pictos-next.netlify.app',
];

const ALLOWED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-image',
  'gemini-3-pro-preview',
  'gemini-3-pro-image-preview',
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

exports.handler = async (event, context) => {
  const origin = event.headers?.origin || '';
  const headers = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth: require Netlify Identity JWT
  const { user } = context.clientContext || {};
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api-gemini] GEMINI_API_KEY not configured');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  try {
    const { model, contents, config } = JSON.parse(event.body);

    if (!model || !contents) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields: model, contents' }) };
    }

    // Whitelist models to prevent misuse
    if (!ALLOWED_MODELS.includes(model)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Model not allowed: ${model}` }) };
    }

    console.log(`[api-gemini] user=${user.email} model=${model}`);

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model, contents, config });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text: response.text || '',
        candidates: response.candidates || [],
      }),
    };
  } catch (error) {
    console.error(`[api-gemini] Error: ${error.message}`);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI service error' }) };
  }
};
