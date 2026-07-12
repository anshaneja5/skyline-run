// Share pages: crawler-friendly HTML with per-user OG tags, instant redirect
// into the game for humans.

const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export default function handler(req, res) {
  const raw = String(req.query.username || '').trim();
  const username = /^[a-zA-Z0-9-]{1,39}$/.test(raw) ? raw : 'anshaneja5';
  const base = 'https://skyline-run.vercel.app';
  const title = `Fly @${username}'s GitHub year ✈️ Skyline Run`;
  const desc = `Every commit day is a building. Fly through @${username}'s contribution graph — crash into their busiest day.`;
  const og = `${base}/api/og/${encodeURIComponent(username)}`;
  const target = `${base}/?user=${encodeURIComponent(username)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(og)}">
<meta property="og:url" content="${esc(target)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(og)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)})</script>
</head><body>Redirecting to <a href="${esc(target)}">Skyline Run</a>…</body></html>`);
}
