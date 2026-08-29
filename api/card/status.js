import { requireEnv, supabaseJson } from '../xmr/_lib.js';
import { refreshCardOrder, creditInvoice, voidInvoice } from './_help.js';
import * as providers from './_providers/index.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const invoiceId = String(req.query.invoice_id || '').trim();
  if (!invoiceId) return res.status(400).json({ error: 'Missing invoice_id' });

  let cfg;
  try {
    cfg = requireEnv();
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }

  const inv = await supabaseJson(cfg.url, `/rest/v1/xmr_invoices?id=eq.${invoiceId}&select=id,invoice_no,status,channel,created_at&limit=1`, { key: cfg.key });
  if (!inv.ok) return res.status(502).json({ error: 'Storage failed' });
  const invRows = await inv.json();
  if (!invRows.length) return res.status(404).json({ error: 'Invoice not found' });
  const invoice = invRows[0];

  const refreshed = await refreshCardOrder(cfg, invoiceId);
  if (refreshed) {
    if (refreshed.providerStatus === 'finished' && invoice.status !== 'credited' && typeof providers.provider().withdraw !== 'function') {
      await creditInvoice(cfg, invoiceId, { received: refreshed.amount != null ? refreshed.amount : undefined });
    } else if (['failed', 'refunded'].includes(refreshed.providerStatus) && !['credited', 'void'].includes(invoice.status)) {
      await voidInvoice(cfg, invoiceId);
    }
  }

  return res.status(200).json({
    invoice_id: invoiceId,
    invoice_no: invoice.invoice_no,
    channel: invoice.channel,
    card_status: refreshed ? refreshed.providerStatus : null
  });
}