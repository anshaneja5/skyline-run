import { topScores } from './_lb.js';

export default async function handler(_req, res) {
  try {
    const entries = await topScores(20);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.json(entries);
  } catch (err) {
    console.error('leaderboard error:', err);
    res.status(500).json({ error: 'Leaderboard unavailable.' });
  }
}
