import { getStarCount } from './_gh.js';

export default async function handler(_req, res) {
  const stars = await getStarCount();
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.json({ stars });
}
