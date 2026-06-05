/**
 * Netlify Function: Usage Report (admin only)
 *
 * Returns daily usage summary from Netlify Blobs.
 * Restricted to the site owner (herbert.spencer@gmail.com).
 *
 * GET /.netlify/functions/api-usage-report?date=YYYY-MM-DD
 */

import { getDailySummary } from './_shared/usage.js';

const ADMIN_EMAIL = 'herbert.spencer@gmail.com';

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };
}

export const handler = async (event, context) => {
  const origin = event.headers?.origin || '';
  const headers = corsHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { user } = context.clientContext || {};
  const isLocalDev = process.env.NETLIFY_DEV === 'true';
  const authHeader = event.headers.authorization;

  // Permite acceso si envían una llave de API válida
  const hasValidApiKey = authHeader && process.env.ADMIN_API_KEY && authHeader === `Bearer ${process.env.ADMIN_API_KEY}`;
  
  // Permite acceso si está autenticado como administrador vía Netlify Identity
  const hasValidUser = user && user.email === ADMIN_EMAIL;

  if (!isLocalDev && !hasValidApiKey && !hasValidUser) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized. Requires valid Netlify Identity token or Bearer ADMIN_API_KEY.' }) };
  }

  const date = event.queryStringParameters?.date || new Date().toISOString().slice(0, 10);

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD' }) };
  }

  try {
    const summary = await getDailySummary(date);
    const totalCalls = Object.values(summary).reduce((s, u) => s + u.calls, 0);
    const totalUnits = Object.values(summary).reduce((s, u) => s + u.units, 0);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        date,
        total_calls: totalCalls,
        total_units: totalUnits,
        users: summary,
      }),
    };
  } catch (error) {
    console.error('[api-usage-report] Error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
