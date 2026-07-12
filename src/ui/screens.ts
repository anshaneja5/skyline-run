import type { RunStats } from '../game/types';
import { PALETTE_CSS, BUCKET_LABELS } from '../game/world';
import { track } from '../analytics';

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const fmtDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

export class Screens {
  private current: HTMLElement | null = null;

  constructor(private root: HTMLElement) {}

  clear() {
    this.current?.remove();
    this.current = null;
  }

  private mount(html: string): HTMLElement {
    this.clear();
    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.innerHTML = html;
    this.root.appendChild(screen);
    this.current = screen;
    screen.querySelectorAll('.gh-link').forEach((a) =>
      a.addEventListener('click', () => track('github_click'))
    );
    return screen;
  }

  loading(label = 'Fetching your year of commits…'): (pct: number, msg?: string) => void {
    const screen = this.mount(`
      <div class="card">
        <h1><span class="plane-emoji">✈️</span> Skyline Run</h1>
        <p class="subtitle loading-label">${label}</p>
        <div class="loading-bar"><div class="fill"></div></div>
      </div>`);
    const fill = screen.querySelector<HTMLElement>('.fill')!;
    const labelEl = screen.querySelector<HTMLElement>('.loading-label')!;
    return (pct, msg) => {
      fill.style.width = `${Math.round(pct * 100)}%`;
      if (msg) labelEl.textContent = msg;
    };
  }

  start(opts: {
    defaultUser: string;
    demo: boolean;
    bestScore: number | null;
    yearStats?: { total: number; busiestCount: number; busiestDate: string; streak: number };
    onTakeOff: (username: string) => void;
  }) {
    const s = opts.yearStats;
    const fmtShort = (iso: string) =>
      new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const profile = s
      ? `<div class="profile-row">
          <img class="avatar" src="https://github.com/${encodeURIComponent(opts.defaultUser)}.png?size=96"
               alt="" onerror="this.style.display='none'" />
          <div class="year-stats">
            <span><b>${s.total.toLocaleString()}</b> commits this year</span>
            <span>busiest: <b>${s.busiestCount}</b> on ${fmtShort(s.busiestDate)} · streak <b>${s.streak}d</b></span>
          </div>
        </div>`
      : '';
    const colorLegend = PALETTE_CSS.map(
      (c, i) =>
        `<span class="swatch"><span class="chip" style="background:${c}"></span>${BUCKET_LABELS[i]} commits</span>`
    ).join('');
    const screen = this.mount(`
      <div class="card">
        <h1><span class="plane-emoji">✈️</span> Skyline Run</h1>
        <p class="subtitle">Fly through a year of your GitHub commits.<br/>Crash into a busy day and it's over.</p>
        ${opts.demo ? '<div class="demo-badge">⚠ demo data — set GITHUB_TOKEN in .env for real contributions</div><br/>' : ''}
        ${profile}
        <input type="text" id="username-input" value="${opts.defaultUser}" placeholder="GitHub username" spellcheck="false" autocomplete="off" />
        <div class="error-text" id="start-error"></div>
        <button class="btn" id="takeoff-btn">Take off ✈</button>
        ${opts.bestScore !== null ? `<div class="best-score">Best score: <b>${opts.bestScore.toLocaleString()}</b></div>` : ''}
        <div class="legend kbd-legend">
          <b>Steer</b> <kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd><br/>
          <b>Climb/Dive</b> <kbd>W</kbd><kbd>S</kbd> or <kbd>↑</kbd><kbd>↓</kbd><br/>
          <b>Boost</b> hold <kbd>Shift</kbd> &nbsp; <b>Slow-mo</b> hold <kbd>Space</kbd><br/>
          <b>Pause</b> <kbd>Esc</kbd> / <kbd>P</kbd>
        </div>
        <div class="touch-hint">📱 Tilt your phone to steer &amp; climb (hold it comfy — that angle becomes level).<br/>Or touch: left/right half steers, top/bottom third climbs/dives. Two-finger tap = boost.</div>
        <div class="color-legend">${colorLegend}</div>
        ${this.ghLink('Star on GitHub — anshaneja5/skyline-run')}
      </div>`);
    const input = screen.querySelector<HTMLInputElement>('#username-input')!;
    const btn = screen.querySelector<HTMLButtonElement>('#takeoff-btn')!;
    const go = () => {
      const name = input.value.trim();
      if (!name) {
        this.setStartError('Enter a GitHub username first.');
        return;
      }
      opts.onTakeOff(name);
    };
    btn.addEventListener('click', go);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
      e.stopPropagation();
    });
  }

  setStartError(msg: string) {
    const el = this.current?.querySelector<HTMLElement>('#start-error');
    if (el) el.textContent = msg;
  }

  private ghLink(text: string): string {
    return `<a class="gh-link" href="https://github.com/anshaneja5/skyline-run" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
        ${text}
      </a>`;
  }

  private statsGrid(stats: RunStats, extra = ''): string {
    const pct = Math.round((stats.daysSurvived / stats.totalDays) * 100);
    return `
      <div class="stats">
        <div class="stat"><div class="value">${stats.score.toLocaleString()}</div><div class="label">Score</div></div>
        <div class="stat"><div class="value">x${stats.bestCombo}</div><div class="label">Best combo</div></div>
        <div class="stat"><div class="value">${pct}%</div><div class="label">Year survived</div></div>
        <div class="stat"><div class="value">${stats.commitsDodged.toLocaleString()}</div><div class="label">Commits dodged</div></div>
        ${extra}
      </div>`;
  }

  /** Mini bar chart of the week around the crash day. */
  private weekChart(week: { date: string; count: number; crash: boolean }[]): string {
    const max = Math.max(...week.map((d) => d.count), 1);
    const bars = week
      .map((d) => {
        const h = Math.max((d.count / max) * 100, 6);
        const dayNum = parseInt(d.date.slice(8), 10);
        return `<div class="wc-col${d.crash ? ' crash' : ''}">
            <div class="wc-count">${d.count}</div>
            <div class="wc-bar" style="height:${h.toFixed(0)}%"></div>
            <div class="wc-day">${dayNum}</div>
          </div>`;
      })
      .join('');
    return `<div class="week-chart">${bars}</div>`;
  }

  crash(
    stats: RunStats,
    isBest: boolean,
    week: { date: string; count: number; crash: boolean }[],
    onRetry: () => void,
    onMenu: () => void
  ) {
    const b = stats.crashedInto!;
    const screen = this.mount(`
      <div class="card">
        <h1>💥 Crashed!</h1>
        <div class="crash-building">
          You flew into <span class="date">${fmtDate(b.date)}</span><br/>
          a day with <b>${b.count} commit${b.count === 1 ? '' : 's'}</b>
          ${week.length ? this.weekChart(week) : ''}
        </div>
        ${this.statsGrid(stats)}
        ${isBest ? '<div class="demo-badge">🏆 New best score!</div>' : ''}
        <div>
          <button class="btn" id="retry-btn">Fly again</button>
          <button class="btn secondary" id="menu-btn">Menu</button>
        </div>
        ${this.ghLink('Enjoyed the flight? Star it on GitHub ⭐')}
      </div>`);
    screen.querySelector('#retry-btn')!.addEventListener('click', onRetry);
    screen.querySelector('#menu-btn')!.addEventListener('click', onMenu);
  }

  win(stats: RunStats, isBest: boolean, onRetry: () => void, onMenu: () => void) {
    const timeStat = `<div class="stat" style="grid-column: span 2"><div class="value">${fmtTime(
      stats.flightTimeMs
    )}</div><div class="label">Flight time</div></div>`;
    const screen = this.mount(`
      <div class="card">
        <h1>🏁 You survived the year!</h1>
        <p class="subtitle">All ${stats.totalDays} days, start to finish.</p>
        ${this.statsGrid(stats, timeStat)}
        ${isBest ? '<div class="demo-badge">🏆 New best score!</div>' : ''}
        <div>
          <button class="btn" id="retry-btn">Fly again</button>
          <button class="btn secondary" id="menu-btn">Menu</button>
        </div>
        ${this.ghLink('Survived the year? Star it on GitHub ⭐')}
      </div>`);
    screen.querySelector('#retry-btn')!.addEventListener('click', onRetry);
    screen.querySelector('#menu-btn')!.addEventListener('click', onMenu);
  }

  error(message: string, onRetry: () => void) {
    const screen = this.mount(`
      <div class="card">
        <h1>🌧 Turbulence</h1>
        <p class="subtitle">${message}</p>
        <button class="btn" id="retry-btn">Try again</button>
      </div>`);
    screen.querySelector('#retry-btn')!.addEventListener('click', onRetry);
  }

  pause(onResume: () => void, onQuit: () => void) {
    const screen = this.mount(`
      <div class="card">
        <h1>⏸ Paused</h1>
        <div>
          <button class="btn" id="resume-btn">Resume</button>
          <button class="btn secondary" id="quit-btn">Quit to menu</button>
        </div>
      </div>`);
    screen.querySelector('#resume-btn')!.addEventListener('click', onResume);
    screen.querySelector('#quit-btn')!.addEventListener('click', onQuit);
  }
}
