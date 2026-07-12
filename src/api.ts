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
  const days: ContributionDay[] = await res.json();
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error('No contribution data returned.');
  }
  return { days, demo: res.headers.get('X-Demo-Data') === '1' };
}
