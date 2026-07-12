import { getStarCount, getStargazers } from './_gh.js';

export default async function handler(req, res) {
  const stars = await getStarCount();
  const user = String(req.query?.user || '').trim().toLowerCase();
  let starred = false;
  if (/^[a-z0-9-]{1,39}$/.test(user)) {
    starred = (await getStargazers()).has(user);
  }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.json({ stars, starred });
}
