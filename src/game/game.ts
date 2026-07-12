import * as THREE from 'three';
import type { ContributionDay, RunStats } from './types';
import { buildWorld, BLOCK_DEPTH, START_Z, type World } from './world';
import { createPlane, BASE_SPEED, BOOST_MULT, type Plane } from './plane';
import type { GameAssets } from './assets';
import { CollisionSystem } from './collisions';
import { Scoring, NEAR_MISS_DISTANCE } from './scoring';
import { Input } from './input';
import { GameAudio } from './audio';
import type { Hud } from '../ui/hud';

export type GameEnd = { kind: 'crash' | 'win'; stats: RunStats };

const BOOST_DRAIN = 22; // per second
const SLOWMO_DRAIN = 38;
const METER_REFILL = 13;
const SLOWMO_SCALE = 0.45;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private world: World;
  private plane: Plane;
  private collisions: CollisionSystem;
  private scoring = new Scoring();
  private input: Input;
  private raf = 0;
  private lastTime = 0;
  private elapsed = 0;
  private flightMs = 0;
  private paused = false;
  private ended = false;
  private meter = 100;
  private maxAltitude: number;
  private comboCeiling: number;
  private lastMonthKey: string;
  private reducedMotion: boolean;
  // adaptive quality: 0 = full, 1 = 1x pixel ratio, 2 = also no shadows
  private perfTier = 0;
  private perfFrames = 0;
  private perfTime = 0;
  private perfWarmup = 3; // seconds to ignore while shaders/textures warm up

  constructor(
    renderer: THREE.WebGLRenderer,
    private days: ContributionDay[],
    assets: GameAssets | null,
    private audio: GameAudio,
    private hud: Hud,
    private onEnd: (end: GameEnd) => void,
    private onPause: (paused: boolean) => void
  ) {
    this.renderer = renderer;
    this.world = buildWorld(days, assets);
    this.plane = createPlane(window.innerWidth / window.innerHeight, assets);
    this.world.scene.add(this.plane.camera);

    this.maxAltitude = Math.max(this.world.maxBuildingHeight * 3, 30);
    this.comboCeiling = this.world.maxBuildingHeight + 4;
    this.collisions = new CollisionSystem(this.world.buildings, this.comboCeiling);
    this.input = new Input(document.body);
    this.lastMonthKey = days[0].date.slice(0, 7);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.plane.camera.aspect = window.innerWidth / window.innerHeight;
    this.plane.camera.updateProjectionMatrix();
  };

  start() {
    this.audio.startEngine();
    this.audio.startMusic();
    this.lastTime = performance.now();
    this.hud.setup(this.days);
    this.hud.show();
    document.body.classList.add('playing');
    this.loop(this.lastTime);
  }

  private currentDayIndex(): number {
    return Math.max(0, Math.floor((-this.plane.position.z + BLOCK_DEPTH / 2) / BLOCK_DEPTH));
  }

  private stats(crashedInto?: { date: string; count: number }): RunStats {
    const dayIdx = Math.min(this.currentDayIndex(), this.days.length - 1);
    return {
      score: this.scoring.score,
      bestCombo: this.scoring.bestCombo,
      commitsDodged: this.scoring.commitsDodged,
      daysSurvived: dayIdx + (crashedInto ? 0 : 1),
      totalDays: this.days.length,
      flightTimeMs: this.flightMs,
      crashedInto,
    };
  }

  private loop = (now: number) => {
    if (this.ended) return;
    this.raf = requestAnimationFrame(this.loop);

    const rawDt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    // adaptive quality: measure fps over ~2s windows, degrade if struggling
    if (this.perfWarmup > 0) {
      this.perfWarmup -= rawDt;
    } else if (this.perfTier < 2) {
      this.perfTime += rawDt;
      this.perfFrames++;
      if (this.perfTime >= 2) {
        const fps = this.perfFrames / this.perfTime;
        this.perfFrames = 0;
        this.perfTime = 0;
        if (fps < 45) {
          this.perfTier++;
          if (this.perfTier === 1) {
            this.renderer.setPixelRatio(1);
            console.info('Skyline Run: fps low — dropping to 1x pixel ratio');
          } else {
            this.world.sun.castShadow = false;
            console.info('Skyline Run: fps still low — disabling shadows');
          }
        }
      }
    }

    if (this.input.consumePause()) {
      this.paused = !this.paused;
      this.onPause(this.paused);
    }
    if (this.paused) return;

    const state = this.input.read();

    // meter: boost & slow-mo share it, slow-mo drains faster
    let boosting = state.boostHeld && this.meter > 0;
    let slowmo = state.slowmoHeld && this.meter > 0 && !boosting;
    if (boosting) this.meter -= BOOST_DRAIN * rawDt;
    else if (slowmo) this.meter -= SLOWMO_DRAIN * rawDt;
    else this.meter = Math.min(this.meter + METER_REFILL * rawDt, 100);
    if (this.meter <= 0) {
      this.meter = 0;
      boosting = false;
      slowmo = false;
      this.input.resetTouchBoost();
    }

    const timeScale = slowmo ? SLOWMO_SCALE : 1;
    const dt = rawDt * timeScale;
    this.elapsed += dt;
    this.flightMs += rawDt * 1000;
    this.audio.setTimeScale(timeScale);
    this.hud.setSlowmo(slowmo);

    // forward motion
    const speed = BASE_SPEED * (boosting ? BOOST_MULT : 1);
    this.plane.position.z -= speed * dt;
    this.plane.update(dt, { steer: state.steer, climb: state.climb, boosting }, this.elapsed, this.maxAltitude, this.reducedMotion);
    this.audio.setEngineSpeed((boosting ? BOOST_MULT : 1) * (0.9 + 0.1 * Math.sin(this.elapsed * 2)));

    // world animation (clouds) + shadow camera follows the plane
    this.world.update(dt, this.elapsed);
    const pp = this.plane.position;
    this.world.sun.position.set(pp.x + 45, pp.y + 85, pp.z + 35);
    this.world.sun.target.position.set(pp.x, 0, pp.z - 30);
    this.world.sun.target.updateMatrixWorld();

    // collisions & scoring
    const p = this.plane.position;
    const result = this.collisions.step(p.x, p.y, p.z);
    const nowMs = performance.now();

    for (const pass of result.passes) {
      const ev = this.scoring.buildingPassed(pass.building.count, pass.clearance, !pass.wasLow, nowMs);
      if (!ev) continue;
      if (ev.nearMiss) {
        this.audio.whoosh();
        if (!this.reducedMotion) this.plane.addShake(0.35);
        if (ev.combo > 1) this.audio.comboChime(ev.combo);
        const b = pass.building;
        this.hud.popupAt(`CLOSE! +${ev.points}`, (b.minX + b.maxX) / 2, b.height + 1, (b.minZ + b.maxZ) / 2, this.plane.camera);
        this.hud.setCombo(ev.combo);
      } else {
        this.hud.setCombo(this.scoring.combo);
      }
    }

    this.scoring.tick(nowMs);
    this.hud.setCombo(this.scoring.combo);

    if (result.crashed) {
      const b = result.crashed;
      this.audio.crash();
      this.endRun({ kind: 'crash', stats: this.stats({ date: b.date, count: b.count }) });
      return;
    }

    // month checkpoint ding
    const dayIdx = this.currentDayIndex();
    if (dayIdx < this.days.length) {
      const monthKey = this.days[dayIdx].date.slice(0, 7);
      if (monthKey !== this.lastMonthKey) {
        this.lastMonthKey = monthKey;
        this.audio.checkpointDing();
      }
    }

    // win: past the final day block
    if (-p.z > this.days.length * BLOCK_DEPTH + BLOCK_DEPTH) {
      this.endRun({ kind: 'win', stats: this.stats() });
      return;
    }

    // HUD
    this.hud.update({
      date: this.days[Math.min(dayIdx, this.days.length - 1)].date,
      speed: Math.round(speed * 3.6),
      altitude: THREE.MathUtils.clamp(p.y / this.maxAltitude, 0, 1),
      score: this.scoring.score,
      progress: THREE.MathUtils.clamp(-p.z / (this.days.length * BLOCK_DEPTH), 0, 1),
      meter: this.meter,
      boosting,
    });

    this.renderer.render(this.world.scene, this.plane.camera);
  };

  private endRun(end: GameEnd) {
    this.ended = true;
    cancelAnimationFrame(this.raf);
    this.audio.stopEngine();
    this.audio.stopMusic();
    this.audio.setTimeScale(1);
    this.hud.hide();
    document.body.classList.remove('playing');
    this.onEnd(end);
  }

  resume() {
    this.paused = false;
    this.lastTime = performance.now();
    this.onPause(false);
  }

  dispose() {
    this.ended = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.audio.stopEngine();
    this.audio.stopMusic();
    this.world.dispose();
    document.body.classList.remove('playing');
  }
}
