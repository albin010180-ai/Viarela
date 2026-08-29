import { supabaseJson, requireEnv } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing id' });

  let cfg;
  try {
    cfg = requireEnv();
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }

  const r = await supabaseJson(cfg.url, `/rest/v1/xmr_invoices?id=eq.${id}&select=id,invoice_no,address,amount_eur,amount_xmr,fx_rate,status,confirmations,received_amount_xmr,expires_at,created_at`, { key: cfg.key });
  if (!r.ok) return res.status(502).json({ error: 'Storage failed' });
  const rows = await r.json();
  if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });

  const row = rows[0];
  return res.status(200).json({
    id: row.id,
    invoice_no: row.invoice_no,
    address: row.address,
    amount_eur: Number(row.amount_eur),
    amount_xmr: Number(row.amount_xmr),
    fx_rate: Number(row.fx_rate),
    status: row.status,
    confirmations: row.confirmations,
    received_amount_xmr: row.received_amount_xmr != null ? Number(row.received_amount_xmr) : null,
    expires_at: row.expires_at,
    created_at: row.created_at
  });
}