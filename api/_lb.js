// Leaderboard storage + validation, shared by the Vercel functions and the
// local Express server. Uses Upstash Redis over REST when configured
// (UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN); otherwise falls
// back to a per-instance in-memory store (fine for dev, ephemeral in prod).

import { getContributions } from './_lib.js';

const SCORES_KEY = 'lb:scores';
const META_PREFIX = 'lb:u:';
const RATE_PREFIX = 'lb:rate:';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const hasRedis = Boolean(redisUrl && redisToken);

async function redis(...command) {
  const res = await fetch(redisUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body.result;
}

// ---- in-memory fallback (dev / unprovisioned) ----
const mem = {
  scores: new Map(), // username -> score
  meta: new Map(), // username -> meta
  rate: new Map(), // ip -> { count, resetAt }
};

async function rateLimit(ip) {
  const LIMIT = 10; // submissions per minute per IP
  if (hasRedis) {
    const key = RATE_PREFIX + ip;
    const count = await redis('INCR', key);
    if (count === 1) await redis('EXPIRE', key, 60);
    return count <= LIMIT;
  }
  const now = Date.now();
  const entry = mem.rate.get(ip);
  if (!entry || now > entry.resetAt) {
    mem.rate.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= LIMIT;
}

/** Same trim the frontend applies: the flight starts at the first commit day. */
function trimmedDays(days) {
  const first = days.findIndex((d) => d.count > 0);
  return first > 0 ? days.slice(first) : days;
}

/**
 * Validate a submitted run against what the server knows about this user's
 * actual contribution data. Returns { ok } or { ok: false, reason }.
 */
export async function validateRun(username, run) {
  const contrib = await getContributions(username);
  if (contrib.status !== 200) return { ok: false, reason: 'unknown user' };
  const days = trimmedDays(contrib.body);
  const totalCommits = days.reduce((s, d) => s + d.count, 0);

  // theoretical max: every building near-missed at the x8 combo cap
  const maxScore = totalCommits * 3 * 8;
  if (run.score < 0 || run.score > maxScore) return { ok: false, reason: 'impossible score' };
  if (run.daysSurvived > days.length) return { ok: false, reason: 'impossible distance' };
  // fastest possible full-boost pace is ~8.3 days/second — require slower
  if (run.flightTimeMs < run.daysSurvived * 100) return { ok: false, reason: 'impossible speed' };
  if (run.bestCombo < 1 || run.bestCombo > 8) return { ok: false, reason: 'impossible combo' };
  return { ok: true, totalDays: days.length };
}

export async function submitScore(username, run, ip) {
  if (!(await rateLimit(ip))) return { status: 429, body: { error: 'Too many submissions.' } };

  const check = await validateRun(username, run);
  if (!check.ok) return { status: 422, body: { error: `Rejected: ${check.reason}.` } };

  const user = username.toLowerCase();
  const meta = {
    score: run.score,
    bestCombo: run.bestCombo,
    pct: Math.round((run.daysSurvived / check.totalDays) * 100),
    win: run.daysSurvived >= check.totalDays,
    at: Date.now(),
  };

  let best;
  if (hasRedis) {
    // ZADD GT: only update when the new score is greater
    await redis('ZADD', SCORES_KEY, 'GT', String(run.score), user);
    best = Number(await redis('ZSCORE', SCORES_KEY, user));
    if (best === run.score) await redis('SET', META_PREFIX + user, JSON.stringify(meta));
    const rank = await redis('ZREVRANK', SCORES_KEY, user);
    return { status: 200, body: { rank: rank + 1, best, improved: best === run.score } };
  }

  const prev = mem.scores.get(user) ?? -1;
  if (run.score > prev) {
    mem.scores.set(user, run.score);
    mem.meta.set(user, meta);
  }
  best = mem.scores.get(user);
  const rank = [...mem.scores.values()].filter((s) => s > best).length + 1;
  return { status: 200, body: { rank, best, improved: run.score > prev } };
}

export async function topScores(limit = 20) {
  if (hasRedis) {
    const flat = await redis('ZRANGE', SCORES_KEY, '0', String(limit - 1), 'REV', 'WITHSCORES');
    const entries = [];
    for (let i = 0; i < flat.length; i += 2) {
      entries.push({ username: flat[i], score: Number(flat[i + 1]) });
    }
    // attach meta in one pipeline-ish pass
    for (const e of entries) {
      try {
        const raw = await redis('GET', META_PREFIX + e.username);
        if (raw) Object.assign(e, JSON.parse(raw));
      } catch {
        /* meta is decorative */
      }
    }
    return entries;
  }
  return [...mem.scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([username, score]) => ({ username, score, ...(mem.meta.get(username) || {}) }));
}
