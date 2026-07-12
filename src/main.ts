import './style.css';
import * as THREE from 'three';
import { fetchConfig, fetchContributions } from './api';
import type { ContributionDay } from './game/types';
import { buildWorld, type World } from './game/world';
import { loadAssets, type GameAssets } from './game/assets';
import { Game } from './game/game';
import { tilt } from './game/tilt';
import { track } from './analytics';
import { GameAudio } from './game/audio';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root')!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// 1.5x is visually near-identical to 2x retina but renders ~44% fewer pixels
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
window.addEventListener('resize', () => renderer.setSize(window.innerWidth, window.innerHeight));

const screens = new Screens(uiRoot);
const hud = new Hud(uiRoot);
const audio = new GameAudio();

// mute button lives outside HUD so it works on every screen
const muteBtn = document.createElement('button');
muteBtn.id = 'mute-btn';
muteBtn.textContent = '🔊';
muteBtn.addEventListener('click', () => {
  audio.init();
  muteBtn.textContent = audio.toggleMute() ? '🔇' : '🔊';
});
uiRoot.appendChild(muteBtn);

const bestScoreKey = (user: string) => `skyline-run-best:${user.toLowerCase()}`;
const getBest = (user: string): number | null => {
  const v = localStorage.getItem(bestScoreKey(user));
  return v ? parseInt(v, 10) : null;
};
const saveBest = (user: string, score: number): boolean => {
  const best = getBest(user);
  if (best === null || score > best) {
    localStorage.setItem(bestScoreKey(user), String(score));
    return true;
  }
  return false;
};

// ---------- cinematic orbit preview behind the start card ----------

let previewWorld: World | null = null;
let previewRaf = 0;

function startPreview(days: ContributionDay[]) {
  stopPreview();
  previewWorld = buildWorld(days, assets);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
  const center = new THREE.Vector3(0, 0, -previewWorld.cityLength * 0.25);
  const start = performance.now();
  let last = start;
  const loop = (now: number) => {
    previewRaf = requestAnimationFrame(loop);
    const t = (now - start) / 1000;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    previewWorld!.update(dt, t);
    const angle = t * 0.12;
    camera.position.set(
      center.x + Math.sin(angle) * 90,
      38 + Math.sin(t * 0.3) * 6,
      center.z + Math.cos(angle) * 90
    );
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    camera.lookAt(center.x, 8, center.z);
    renderer.render(previewWorld!.scene, camera);
  };
  previewRaf = requestAnimationFrame(loop);
}

function stopPreview() {
  cancelAnimationFrame(previewRaf);
  previewWorld?.dispose();
  previewWorld = null;
}

// ---------- app flow ----------

let game: Game | null = null;
let assets: GameAssets | null = null;
let currentUser = '';
let currentDays: ContributionDay[] = [];
let currentDemo = false;

async function boot() {
  const setProgress = screens.loading();
  setProgress(0.1);
  const config = await fetchConfig();
  currentUser = config.defaultUser;
  setProgress(0.2, 'Loading 3D assets…');
  try {
    // assets and contribution data load in parallel; assets failing is fine
    const [loadedAssets, result] = await Promise.all([
      loadAssets((done, total) => setProgress(0.2 + (done / total) * 0.45)),
      fetchContributions(currentUser),
    ]);
    assets = loadedAssets;
    currentDays = result.days;
    currentDemo = result.demo;
    setProgress(0.8, 'Building the city…');
    startPreview(currentDays);
    setProgress(1);
    showStart();
  } catch (err) {
    screens.error((err as Error).message || 'Could not reach GitHub.', boot);
  }
}

function yearStats() {
  if (!currentDays.length) return undefined;
  let total = 0;
  let busiest = currentDays[0];
  let streak = 0;
  let bestStreak = 0;
  for (const d of currentDays) {
    total += d.count;
    if (d.count > busiest.count) busiest = d;
    streak = d.count > 0 ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  return { total, busiestCount: busiest.count, busiestDate: busiest.date, streak: bestStreak };
}

function showStart(errorMsg?: string) {
  screens.start({
    defaultUser: currentUser,
    demo: currentDemo,
    bestScore: getBest(currentUser),
    yearStats: yearStats(),
    onTakeOff: takeOff,
  });
  if (errorMsg) screens.setStartError(errorMsg);
  if (!previewWorld && currentDays.length) startPreview(currentDays);
}

async function takeOff(username: string) {
  audio.init(); // user gesture — safe to create AudioContext now
  // gyroscope steering on phones; must be requested inside the tap gesture (iOS)
  if (window.matchMedia('(pointer: coarse)').matches) void tilt.requestEnable();

  if (username.toLowerCase() !== currentUser.toLowerCase() || currentDays.length === 0) {
    const setProgress = screens.loading(`Fetching @${username}'s year of commits…`);
    setProgress(0.4);
    try {
      const result = await fetchContributions(username);
      currentDays = result.days;
      currentDemo = result.demo;
      currentUser = username;
      setProgress(1);
    } catch (err) {
      showStart((err as Error).message);
      return;
    }
  }
  currentUser = username;

  stopPreview();
  screens.clear();
  game?.dispose();
  track('take_off', { flown_user: currentUser, demo_data: currentDemo });
  game = new Game(renderer, currentDays, assets, audio, hud, onGameEnd, onGamePause);
  game.start();
}

function onGameEnd(end: { kind: 'crash' | 'win'; stats: import('./game/types').RunStats }) {
  const isBest = saveBest(currentUser, end.stats.score);
  track(end.kind === 'crash' ? 'crash' : 'year_survived', {
    score: end.stats.score,
    best_combo: end.stats.bestCombo,
    days_survived: end.stats.daysSurvived,
    pct_survived: Math.round((end.stats.daysSurvived / end.stats.totalDays) * 100),
    new_best: isBest,
  });
  const retry = () => takeOff(currentUser);
  const menu = () => {
    game?.dispose();
    game = null;
    showStart();
  };
  if (end.kind === 'crash') {
    const crashDate = end.stats.crashedInto!.date;
    const idx = currentDays.findIndex((d) => d.date === crashDate);
    const week = currentDays
      .slice(Math.max(idx - 3, 0), idx + 4)
      .map((d) => ({ date: d.date, count: d.count, crash: d.date === crashDate }));
    screens.crash(end.stats, isBest, week, retry, menu);
  } else {
    screens.win(end.stats, isBest, retry, menu);
  }
}

function onGamePause(paused: boolean) {
  if (paused) {
    screens.pause(
      () => {
        screens.clear();
        game?.resume();
      },
      () => {
        screens.clear();
        game?.dispose();
        game = null;
        showStart();
      }
    );
  } else {
    screens.clear();
  }
}

boot();
