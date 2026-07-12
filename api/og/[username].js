// Dynamic OG image: the user's contribution year as a skyline, 1200x630.
// Edge runtime — @vercel/og (satori) renders plain element objects, no JSX.

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount } }
      }
    }
  }
}`;

const e = (type, props = {}, ...children) => ({
  type,
  props: { ...props, children: children.length <= 1 ? children[0] : children },
});

// color relative to the user's own busiest week so every graph shows the ramp
const barColor = (count, max) => {
  const r = count / Math.max(max, 1);
  if (r <= 0.25) return '#f5e6c4';
  if (r <= 0.5) return '#f0a93a';
  if (r <= 0.75) return '#f2705a';
  return '#c93c2c';
};

async function weeklyTotals(username) {
  if (!process.env.GITHUB_TOKEN) return null;
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'skyline-run',
      },
      body: JSON.stringify({ query: QUERY, variables: { login: username } }),
    });
    const body = await res.json();
    const cal = body?.data?.user?.contributionsCollection?.contributionCalendar;
    if (!cal) return null;
    return {
      total: cal.totalContributions,
      weeks: cal.weeks.map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0)),
    };
  } catch {
    return null;
  }
}

export default async function handler(req) {
  const username = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || '')
    .trim()
    .slice(0, 39);
  const safe = /^[a-zA-Z0-9-]+$/.test(username) ? username : 'anshaneja5';

  const data = await weeklyTotals(safe);
  const weeks = data?.weeks ?? Array.from({ length: 52 }, (_, i) => 6 + ((i * 37) % 40));
  const maxWeek = Math.max(...weeks, 1);

  const bars = weeks.map((count, i) =>
    e('div', {
      key: String(i),
      style: {
        width: '17px',
        height: `${Math.max((count / maxWeek) * 300, 6)}px`,
        background: barColor(count, maxWeek),
        borderRadius: '3px 3px 0 0',
        marginRight: '4px',
      },
    })
  );

  return new ImageResponse(
    e(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, #3f9fe0 0%, #a5d8f5 70%, #fdeed2 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
        },
      },
      // header
      e(
        'div',
        { style: { display: 'flex', alignItems: 'center', padding: '52px 60px 0', gap: '24px' } },
        e('img', {
          src: `https://github.com/${safe}.png?size=120`,
          width: 96,
          height: 96,
          style: { borderRadius: '48px', border: '5px solid white' },
        }),
        e(
          'div',
          { style: { display: 'flex', flexDirection: 'column', color: 'white' } },
          e('div', { style: { fontSize: '54px', fontWeight: 800 } }, `✈️ @${safe}'s year in commits`),
          e(
            'div',
            { style: { fontSize: '30px', opacity: 0.92, marginTop: '6px' } },
            data ? `${data.total.toLocaleString()} contributions — now a city to fly through` : 'a year of commits — now a city to fly through'
          )
        )
      ),
      // skyline
      e(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'flex-end',
            flexGrow: 1,
            padding: '0 60px',
            marginTop: '20px',
          },
        },
        ...bars
      ),
      // road + footer
      e(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#5f636b',
            padding: '18px 60px',
            color: 'white',
            fontSize: '30px',
            fontWeight: 700,
          },
        },
        e('div', {}, 'skyline-run.vercel.app — crash into your busiest day'),
        e('div', {}, 'SKYLINE RUN')
      )
    ),
    { width: 1200, height: 630 }
  );
}
