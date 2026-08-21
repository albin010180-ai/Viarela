export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(503).json({ error: 'Backend not configured' });
  }

  const b = req.body || {};

  if (typeof b.website === 'string' && b.website.trim() !== '') {
    return res.status(200).json({ ok: true });
  }

  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : null);
  const record = {
    first_name: str(b.first_name, 100),
    last_name: str(b.last_name, 100),
    phone: str(b.phone, 200),
    gender_identity: str(b.gender_identity, 50),
    relationship_status: str(b.relationship_status, 50),
    nationality: str(b.nationality, 100),
    partner_nationality: str(b.partner_nationality, 100),
    destination: str(b.destination, 100),
    package: str(b.package, 100),
    fee: Number.isFinite(b.fee) ? b.fee : null,
    service: str(b.service, 100),
    previous_refusal: str(b.previous_refusal, 10),
    message: str(b.message, 5000),
    lang: str(b.lang, 10) || 'en'
  };

  if (!record.first_name || !record.last_name || !record.nationality || !record.destination || !record.message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const r = await fetch(`${url}/rest/v1/case_assessments`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(record)
    });
    if (!r.ok) {
      return res.status(502).json({ error: 'Storage failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Storage failed' });
  }
}
