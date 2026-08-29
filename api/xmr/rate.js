import { xmrEurRate } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const eurPerXmr = await xmrEurRate();
    return res.status(200).json({ eur_per_xmr: eurPerXmr, updated_at: Date.now() });
  } catch (e) {
    return res.status(502).json({ error: 'Rate unavailable' });
  }
}