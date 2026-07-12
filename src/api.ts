import type { ContributionDay } from './game/types';

export interface ContributionResult {
  days: ContributionDay[];
  demo: boolean;
}

export async function fetchConfig(): Promise<{ defaultUser: string; demo: boolean }> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return { defaultUser: 'anshaneja5', demo: false };
  }
}

export interface LeaderboardEntry {
  username: string;
  rating: number; // basis points of the city's theoretical max (0..10000)
  score?: number;
  bestCombo?: number;
  pct?: number;
  win?: boolean;
  starred?: boolean; // verified stargazer of the repo
}

export async function fetchStars(user?: string): Promise<{ stars: number | null; starred: boolean }> {
  try {
    const res = await fetch(`/api/stars${user ? `?user=${encodeURIComponent(user)}` : ''}`);
    if (!res.ok) return { stars: null, starred: false };
    const body = await res.json();
    return { stars: body.stars ?? null, starred: !!body.starred };
  } catch {
    return { stars: null, starred: false };
  }
}

export interface SubmitResult {
  rank: number;
  rating: number;
  improved: boolean;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function submitScore(
  username: string,
  run: { score: number; bestCombo: number; daysSurvived: number; flightTimeMs: number }
): Promise<SubmitResult | null> {
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, ...run }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchContributions(username: string): Promise<ContributionResult> {
  const res = await fetch(`/api/contributions/${encodeURIComponent(username)}`);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  let days: ContributionDay[] = await res.json();
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error('No contribution data returned.');
  }
  // the flight starts at the first day with commits, not at empty runway months
  const firstCommitDay = days.findIndex((d) => d.count > 0);
  if (firstCommitDay > 0) days = days.slice(firstCommitDay);
  return { days, demo: res.headers.get('X-Demo-Data') === '1' };
}
