#!/usr/bin/env node

/**
 * script: fetch-usage.mjs
 * 
 * Extrae y consolida el uso diario desde pictos.net y next.pictos.net.
 * 
 * Uso:
 *   node scripts/fetch-usage.mjs [YYYY-MM-DD]
 * 
 * Requiere que tengas ADMIN_API_KEY definida en tu .env o en tu entorno local.
 */

import fs from 'fs';
import path from 'path';

// Carga rudimentaria de .env si existe
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
} catch (e) {
  // Ignorar errores
}

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_API_KEY) {
  console.error("❌ ERROR: La variable de entorno ADMIN_API_KEY no está definida.");
  console.error("Por favor añádela a tu archivo .env local.");
  process.exit(1);
}

const args = process.argv.slice(2);
const date = args[0] || new Date().toISOString().slice(0, 10);

const DOMAINS = [
  'https://pictos.net',
  'https://next.pictos.net'
];

async function fetchUsage(domain, targetDate) {
  const url = `${domain}/.netlify/functions/api-usage-report?date=${targetDate}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ADMIN_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      if (res.status === 401) throw new Error("Acceso no autorizado. Verifica tu ADMIN_API_KEY en este entorno y en Netlify.");
      throw new Error(`HTTP Error ${res.status}`);
    }
    
    return await res.json();
  } catch (error) {
    console.warn(`[WARN] No se pudo obtener el uso de ${domain}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log(`\n📊 Recopilando reporte de uso consolidado para la fecha: ${date}\n`);
  
  const results = await Promise.all(DOMAINS.map(d => fetchUsage(d, date)));
  
  let globalTotalCalls = 0;
  let globalTotalUnits = 0;
  const userAggregation = {};
  
  for (let i = 0; i < DOMAINS.length; i++) {
    const domain = DOMAINS[i];
    const data = results[i];
    
    if (!data) continue;
    
    globalTotalCalls += data.total_calls || 0;
    globalTotalUnits += data.total_units || 0;
    
    if (data.users) {
      for (const [email, usage] of Object.entries(data.users)) {
        if (!userAggregation[email]) {
          userAggregation[email] = { calls: 0, units: 0, environments: [] };
        }
        userAggregation[email].calls += usage.calls;
        userAggregation[email].units += usage.units;
        userAggregation[email].environments.push(new URL(domain).hostname);
      }
    }
  }
  
  console.log("=== RESUMEN GLOBAL ===");
  console.log(`Total llamadas: ${globalTotalCalls}`);
  console.log(`Total unidades: ${globalTotalUnits}`);
  console.log("\n=== DESGLOSE POR USUARIO ===");
  
  const userEntries = Object.entries(userAggregation);
  if (userEntries.length === 0) {
    console.log("No hubo actividad registrada en los dominios para esta fecha.");
  } else {
    // Sort by most units
    userEntries.sort((a, b) => b[1].units - a[1].units);
    
    console.table(
      userEntries.map(([email, stats]) => ({
        "Usuario": email,
        "Llamadas": stats.calls,
        "Unidades": stats.units,
        "Dominios": stats.environments.join(', ')
      }))
    );
  }
  console.log("\n");
}

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
