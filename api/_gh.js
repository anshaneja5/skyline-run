// Cached GitHub repo data: star count + stargazer usernames.
// Used for the live star counter and the leaderboard's ⭐ stargazer badges.

const REPO = 'anshaneja5/skyline-run';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

let countCache = { at: 0, stars: 0 };
let gazersCache = { at: 0, set: new Set() };

function ghHeaders() {
  const headers = { 'User-Agent': 'skyline-run', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export async function getStarCount() {
  if (Date.now() - countCache.at < CACHE_TTL) return countCache.stars;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, { headers: ghHeaders() });
    if (res.ok) {
      const body = await res.json();
      countCache = { at: Date.now(), stars: body.stargazers_count ?? 0 };
    }
  } catch {
    /* keep last known count */
  }
  return countCache.stars;
}

/** Lowercased usernames of stargazers (first ~800; enough until fame strikes). */
export async function getStargazers() {
  if (Date.now() - gazersCache.at < CACHE_TTL) return gazersCache.set;
  try {
    const set = new Set();
    for (let page = 1; page <= 8; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/stargazers?per_page=100&page=${page}`,
        { headers: ghHeaders() }
      );
      if (!res.ok) break;
      const batch = await res.json();
      for (const u of batch) set.add(u.login.toLowerCase());
      if (batch.length < 100) break;
    }
    gazersCache = { at: Date.now(), set };
  } catch {
    /* keep last known set */
  }
  return gazersCache.set;
}
