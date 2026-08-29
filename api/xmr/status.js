import { supabaseJson, requireEnv } from './_lib.js';
import { refreshCardOrder, creditInvoice, voidInvoice } from '../card/_help.js';
import * as providers from '../card/_providers/index.js';

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

  const r = await supabaseJson(cfg.url, `/rest/v1/xmr_invoices?id=eq.${id}&select=id,invoice_no,address,amount_eur,amount_xmr,fx_rate,status,confirmations,received_amount_xmr,expires_at,created_at,channel`, { key: cfg.key });
  if (!r.ok) return res.status(502).json({ error: 'Storage failed' });
  const rows = await r.json();
  if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });

  const row = rows[0];
  const out = {
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
    created_at: row.created_at,
    channel: row.channel || 'xmr',
    payment_url: null,
    card_status: null
  };

  if ((out.channel === 'card' || out.channel === 'psp') && out.status === 'pending') {
    const refreshed = await refreshCardOrder(cfg, row.id);
    if (refreshed) {
      out.payment_url = refreshed.order.payment_url || null;
      out.card_status = refreshed.providerStatus;
      if (refreshed.providerStatus === 'finished') {
        if (typeof providers.provider().withdraw === 'function') {
          out.card_status = out.card_status || 'withdrawing';
        } else {
          await creditInvoice(cfg, row.id, { received: refreshed.amount != null ? refreshed.amount : undefined });
          out.status = 'credited';
          out.received_amount_xmr = refreshed.amount != null ? refreshed.amount : out.received_amount_xmr;
        }
      } else if (['failed', 'refunded'].includes(refreshed.providerStatus)) {
        await voidInvoice(cfg, row.id);
        out.status = 'void';
      }
    }
  }

  return res.status(200).json(out);
}