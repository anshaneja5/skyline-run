import { getContributions } from '../_lib.js';

export default async function handler(req, res) {
  const username = String(req.query.username || '').trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) {
    return res.status(400).json({ error: 'Invalid GitHub username.' });
  }
  try {
    const result = await getContributions(username);
    if (result.demo) res.setHeader('X-Demo-Data', '1');
    if (result.cacheHit) res.setHeader('X-Cache', 'HIT');
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Failed to reach GitHub.' });
  }
}
