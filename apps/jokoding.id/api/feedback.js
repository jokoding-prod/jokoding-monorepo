// Vercel Function: POST /api/feedback, menyimpan feedback client ke tabel Supabase `feedback`.
// Butuh env SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY. Key ini hanya ada di server.
import { validateFeedback } from '../src/feedback/validateFeedback.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;

  // Honeypot: field tersembunyi yang hanya diisi bot. Balas sukses supaya bot tidak mencoba lagi.
  if (body?.website) return res.status(200).json({ ok: true });

  const result = validateFeedback(body);
  if (!result.ok) return res.status(400).json({ error: result.error });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('feedback: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum di-set');
    return res.status(500).json({ error: 'Server belum siap menerima feedback.' });
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(result.value),
  });

  if (!response.ok) {
    console.error('feedback: insert gagal', response.status, await response.text());
    return res.status(502).json({ error: 'Gagal menyimpan feedback. Coba lagi sebentar.' });
  }

  return res.status(201).json({ ok: true });
}

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
