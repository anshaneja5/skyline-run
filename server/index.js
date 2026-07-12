import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

// reuse the serverless handlers so dev and prod behave identically
const { default: scoreHandler } = await import('../api/score.js');
const { default: leaderboardHandler } = await import('../api/leaderboard.js');
const { default: starsHandler } = await import('../api/stars.js');

const app = express();
app.use(express.json());
app.post('/api/score', (req, res) => scoreHandler(req, res));
app.get('/api/leaderboard', (req, res) => leaderboardHandler(req, res));
app.get('/api/stars', (req, res) => starsHandler(req, res));
const PORT = process.env.PORT || 3001;
const TOKEN = process.env.GITHUB_TOKEN;
const DEFAULT_USER = process.env.DEFAULT_USER || 'torvalds';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cache = new Map(); // username -> { at, data }

const QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount weekday }
        }
      }
    }
  }
}`;

// Deterministic pseudo-random contribution data for running without a token.
function demoData() {
  const days = [];
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const weekday = d.getDay();
    const weekdayBias = weekday === 0 || weekday === 6 ? 0.35 : 1;
    const r = rand();
    let count = 0;
    if (r > 0.35) count = Math.floor(rand() * 12 * weekdayBias);
    if (rand() > 0.96) count += Math.floor(rand() * 20); // occasional spike
    days.push({ date: d.toISOString().slice(0, 10), count, weekday });
  }
  return days;
}

app.get('/api/config', (_req, res) => {
  res.json({ defaultUser: DEFAULT_USER, demo: !TOKEN });
});

app.get('/api/contributions/:username', async (req, res) => {
  const username = req.params.username.trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) {
    return res.status(400).json({ error: 'Invalid GitHub username.' });
  }

  const cached = cache.get(username.toLowerCase());
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    res.set('X-Cache', 'HIT');
    if (cached.demo) res.set('X-Demo-Data', '1');
    return res.json(cached.data);
  }

  if (!TOKEN) {
    console.warn('No GITHUB_TOKEN set — serving deterministic demo data.');
    const data = demoData();
    cache.set(username.toLowerCase(), { at: Date.now(), data, demo: true });
    res.set('X-Demo-Data', '1');
    return res.json(data);
  }

  try {
    const ghRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'skyline-run',
      },
      body: JSON.stringify({ query: QUERY, variables: { login: username } }),
    });

    if (!ghRes.ok) {
      const text = await ghRes.text();
      console.error('GitHub API error', ghRes.status, text.slice(0, 200));
      return res.status(502).json({ error: 'GitHub API request failed.' });
    }

    const body = await ghRes.json();
    // GraphQL reports unknown users with HTTP 200 + user: null
    if (!body.data || body.data.user === null) {
      return res.status(404).json({ error: `GitHub user "${username}" not found.` });
    }

    const weeks = body.data.user.contributionsCollection.contributionCalendar.weeks;
    const days = weeks.flatMap((w) =>
      w.contributionDays.map((d) => ({
        date: d.date,
        count: d.contributionCount,
        weekday: d.weekday,
      }))
    );

    cache.set(username.toLowerCase(), { at: Date.now(), data: days, demo: false });
    res.json(days);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Failed to reach GitHub.' });
  }
});

app.listen(PORT, () => {
  console.log(`Skyline Run API listening on http://localhost:${PORT}`);
  if (!TOKEN) console.warn('⚠ No GITHUB_TOKEN in .env — demo data mode.');
});
