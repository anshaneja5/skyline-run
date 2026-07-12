// Shared logic for the Vercel serverless API. The local dev server
// (server/index.js) has its own copy of this flow with Express.

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

// Module-level cache: with Fluid Compute the function instance is reused
// across requests, so this behaves like the Express in-memory cache.
const cache = new Map(); // username -> { at, data, demo }
export const CACHE_TTL = 60 * 60 * 1000;

export function demoData() {
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
    if (rand() > 0.96) count += Math.floor(rand() * 20);
    days.push({ date: d.toISOString().slice(0, 10), count, weekday });
  }
  return days;
}

/** Returns { status, body, demo } */
export async function getContributions(username) {
  const token = process.env.GITHUB_TOKEN;
  const key = username.toLowerCase();

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return { status: 200, body: cached.data, demo: cached.demo, cacheHit: true };
  }

  if (!token) {
    const data = demoData();
    cache.set(key, { at: Date.now(), data, demo: true });
    return { status: 200, body: data, demo: true };
  }

  const ghRes = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'skyline-run',
    },
    body: JSON.stringify({ query: QUERY, variables: { login: username } }),
  });

  if (!ghRes.ok) {
    return { status: 502, body: { error: 'GitHub API request failed.' } };
  }

  const body = await ghRes.json();
  // GraphQL reports unknown users with HTTP 200 + user: null
  if (!body.data || body.data.user === null) {
    return { status: 404, body: { error: `GitHub user "${username}" not found.` } };
  }

  const weeks = body.data.user.contributionsCollection.contributionCalendar.weeks;
  const days = weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({
      date: d.date,
      count: d.contributionCount,
      weekday: d.weekday,
    }))
  );

  cache.set(key, { at: Date.now(), data: days, demo: false });
  return { status: 200, body: days, demo: false };
}
