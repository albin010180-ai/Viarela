export const PACKAGES = {
  horizon: 7500,
  continental: 10000,
  signature: 15000,
  unity: 20000
};
export const RETAINER_PCT = 0.2;
export const SAFETY_PCT = 3;
export const VALIDITY_MIN = 30;

export function euroForStage(packageId, stage) {
  const fee = PACKAGES[packageId];
  if (!fee) throw new Error('Unknown package');
  if (stage === 'retainer') return Math.round(fee * RETAINER_PCT);
  if (stage === 'remainder') return fee - Math.round(fee * RETAINER_PCT);
  return fee;
}

let rateCache = { at: 0, value: null };
export async function xmrEurRate() {
  if (rateCache.value && Date.now() - rateCache.at < 120000) return rateCache.value;
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=eur', {
    headers: { 'Accept': 'application/json' }
  });
  if (!r.ok) throw new Error('Rate upstream failed');
  const j = await r.json();
  const v = Number(j?.monero?.eur);
  if (!v || !isFinite(v) || v <= 0) throw new Error('Bad rate payload');
  rateCache = { at: Date.now(), value: v };
  return v;
}

export function supabaseJson(url, path, opts = {}) {
  const headers = {
    apikey: opts.key,
    Authorization: `Bearer ${opts.key}`,
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  };
  return fetch(`${url}${path}`, { method: opts.method || 'GET', headers, body: opts.body });
}

export function requireEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Backend not configured');
  return { url, key };
}

export function randomInvoiceNo() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `XMR-${s}`;
}