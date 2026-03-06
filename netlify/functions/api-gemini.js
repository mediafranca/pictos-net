/**
 * Netlify Function: Gemini API Proxy
 * Validates Netlify Identity JWT, then forwards the request to Gemini
 * with the server-side API key (never exposed to the client).
 */

const { GoogleGenAI } = require("@google/genai");

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Validate JWT from Netlify Identity
  const { user } = context.clientContext || {};
  if (!user) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Unauthorized — login required' })
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api-gemini] GEMINI_API_KEY not configured');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration error' })
    };
  }

  try {
    const { model, contents, config } = JSON.parse(event.body);

    if (!model || !contents) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: model, contents' })
      };
    }

    console.log(`[api-gemini] user=${user.email} model=${model}`);

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model, contents, config });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text: response.text || '',
        candidates: response.candidates || []
      })
    };
  } catch (error) {
    console.error('[api-gemini] Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Gemini API error' })
    };
  }
};
