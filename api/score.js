import { submitScore } from './_lb.js';

const USERNAME_RE = /^[a-zA-Z0-9-]{1,39}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  const { username, score, bestCombo, daysSurvived, flightTimeMs } = req.body || {};
  if (
    !USERNAME_RE.test(String(username || '')) ||
    ![score, bestCombo, daysSurvived, flightTimeMs].every((v) => Number.isFinite(v))
  ) {
    return res.status(400).json({ error: 'Invalid submission.' });
  }
  const ip = (req.headers['x-forwarded-for'] || 'local').toString().split(',')[0].trim();
  try {
    const result = await submitScore(
      username,
      {
        score: Math.floor(score),
        bestCombo: Math.floor(bestCombo),
        daysSurvived: Math.floor(daysSurvived),
        flightTimeMs: Math.floor(flightTimeMs),
      },
      ip
    );
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('score submit error:', err);
    res.status(500).json({ error: 'Leaderboard unavailable.' });
  }
}
