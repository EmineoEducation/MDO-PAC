// api/progress.js — Upstash Redis progress tracker · PAC MDO
// GET  /api/progress?hash=xxx            → renvoie { progress: { bc1, bc2, bc3, bc4 } }
// POST /api/progress  { hash, bloc, status } → met à jour la clé Redis
//
// Clé Redis : mdo:student:{hash}:{bloc}
// hash = SHA-256(email.toLowerCase().trim())[:24]
//   Identique à hashEmail() dans index.html (crypto.subtle) et
//   à hashEmail() dans api/send-portfolio.js (Node crypto.createHash).
//   Les trois calculent la même valeur sans communiquer.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TITRE       = 'mdo';
const BLOCS       = ['bc1', 'bc2', 'bc3', 'bc4'];
const TTL         = 60 * 60 * 24 * 90; // 90 jours

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

async function redisSet(key, value, ttl) {
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${ttl}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: 'Redis non configuré' });
  }

  // ── GET : lecture de la progression complète ────────────────────────────
  if (req.method === 'GET') {
    const { hash } = req.query;
    if (!hash) return res.status(400).json({ error: 'hash manquant' });

    const progress = {};
    for (const bloc of BLOCS) {
      const key = `${TITRE}:student:${hash}:${bloc}`;
      const val = await redisGet(key);
      progress[bloc] = val || 'available';
    }
    return res.status(200).json({ progress });
  }

  // ── POST : écriture d'une coche (appelé par send-portfolio.js dans les PAC)
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'JSON invalide' });
    }
    const { hash, bloc, status } = body || {};
    if (!hash || !bloc || !status) {
      return res.status(400).json({ error: 'hash, bloc et status requis' });
    }
    if (!BLOCS.includes(bloc)) {
      return res.status(400).json({ error: `bloc inconnu: ${bloc}` });
    }
    const allowed = ['available', 'completed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status invalide: ${status}` });
    }
    const key = `${TITRE}:student:${hash}:${bloc}`;
    await redisSet(key, status, TTL);
    return res.status(200).json({ ok: true, key, status });
  }

  return res.status(405).json({ error: 'Méthode non autorisée' });
}
