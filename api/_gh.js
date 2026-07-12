// Cached GitHub repo data: star count + stargazer usernames, via GraphQL
// (the REST stargazers endpoint requires auth the token doesn't carry;
// GraphQL works with the same token used for contributions).

const OWNER = 'anshaneja5';
const NAME = 'skyline-run';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

let cache = { at: 0, stars: 0, set: new Set() };

const QUERY = `
query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    stargazerCount
    stargazers(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { login }
    }
  }
}`;

async function refresh() {
  if (Date.now() - cache.at < CACHE_TTL) return cache;
  if (!process.env.GITHUB_TOKEN) return cache;
  try {
    const set = new Set();
    let stars = cache.stars;
    let after = null;
    for (let page = 0; page < 8; page++) {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'skyline-run',
        },
        body: JSON.stringify({ query: QUERY, variables: { owner: OWNER, name: NAME, after } }),
      });
      if (!res.ok) break;
      const body = await res.json();
      const repo = body?.data?.repository;
      if (!repo) break;
      stars = repo.stargazerCount;
      for (const n of repo.stargazers.nodes) set.add(n.login.toLowerCase());
      if (!repo.stargazers.pageInfo.hasNextPage) break;
      after = repo.stargazers.pageInfo.endCursor;
    }
    if (set.size > 0 || stars === 0) cache = { at: Date.now(), stars, set };
  } catch {
    /* keep last known data */
  }
  return cache;
}

export async function getStarCount() {
  return (await refresh()).stars;
}

/** Lowercased usernames of stargazers (first ~800; enough until fame strikes). */
export async function getStargazers() {
  return (await refresh()).set;
}
