import * as THREE from 'three';
import type { ContributionDay } from '../game/types';

export interface HudFrame {
  date: string;
  speed: number; // km/h
  altitude: number; // 0..1 of allowed range
  score: number;
  progress: number; // 0..1
  meter: number; // 0..100
  boosting: boolean;
}

const fmtDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const MAX_SPEED_KMH = 170;

export class Hud {
  private el: HTMLElement;
  private dateEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private needleEl!: SVGLineElement;
  private altFill!: HTMLElement;
  private scoreEl!: HTMLElement;
  private progressFill!: HTMLElement;
  private progressTicks!: HTMLElement;
  private meterFill!: HTMLElement;
  private comboEl!: HTMLElement;
  private vignette!: HTMLElement;
  private speedlines!: HTMLElement;
  private v = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="hud-date"></div>
        <div class="progress-track"><div class="ticks"></div><div class="fill"></div></div>
      </div>
      <div class="combo-badge"></div>
      <div class="hud-dash">
        <div class="gauge speed-gauge">
          <svg viewBox="0 0 100 60" class="dial">
            <path d="M 10 55 A 45 45 0 0 1 90 55" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="7" stroke-linecap="round"/>
            <path d="M 10 55 A 45 45 0 0 1 38 14" fill="none" stroke="rgba(126,242,184,0.6)" stroke-width="7" stroke-linecap="round"/>
            <line class="needle" x1="50" y1="55" x2="50" y2="18" stroke="#ff9d8a" stroke-width="4" stroke-linecap="round"/>
            <circle cx="50" cy="55" r="5" fill="#eef4ff"/>
          </svg>
          <div class="g-value speed">0</div>
          <div class="g-label">km/h</div>
        </div>
        <div class="gauge"><div class="g-value score">0</div><div class="g-label">Score</div></div>
        <div class="gauge alt-gauge">
          <div class="alt-track"><div class="alt-fill"></div></div>
          <div class="g-label">Alt</div>
        </div>
        <div class="gauge"><div class="g-value">⚡</div><div class="g-label">Boost</div>
          <div class="meter-track"><div class="fill"></div></div></div>
      </div>
      <div class="speedlines"></div>
      <div class="vignette"></div>`;
    root.appendChild(this.el);
    this.dateEl = this.el.querySelector('.hud-date')!;
    this.speedEl = this.el.querySelector('.speed')!;
    this.needleEl = this.el.querySelector<SVGLineElement>('.needle')!;
    this.altFill = this.el.querySelector('.alt-fill')!;
    this.scoreEl = this.el.querySelector('.score')!;
    this.progressFill = this.el.querySelector('.progress-track .fill')!;
    this.progressTicks = this.el.querySelector('.progress-track .ticks')!;
    this.meterFill = this.el.querySelector('.meter-track .fill')!;
    this.comboEl = this.el.querySelector('.combo-badge')!;
    this.vignette = this.el.querySelector('.vignette')!;
    this.speedlines = this.el.querySelector('.speedlines')!;
  }

  /** Month tick marks on the year progress bar. */
  setup(days: ContributionDay[]) {
    this.progressTicks.innerHTML = '';
    days.forEach((d, i) => {
      if (i === 0 || !d.date.endsWith('-01')) return;
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.style.left = `${((i / days.length) * 100).toFixed(2)}%`;
      this.progressTicks.appendChild(tick);
    });
  }

  show() {
    this.el.classList.add('visible');
  }

  hide() {
    this.el.classList.remove('visible');
    this.setCombo(1);
    this.speedlines.classList.remove('on');
    this.vignette.classList.remove('slowmo');
  }

  update(f: HudFrame) {
    this.dateEl.textContent = fmtDate(f.date);
    this.speedEl.textContent = String(f.speed);
    // needle sweeps -80°..80° across 0..MAX_SPEED
    const angle = -80 + Math.min(f.speed / MAX_SPEED_KMH, 1) * 160;
    this.needleEl.setAttribute('transform', `rotate(${angle.toFixed(1)} 50 55)`);
    this.altFill.style.height = `${(f.altitude * 100).toFixed(0)}%`;
    this.scoreEl.textContent = f.score.toLocaleString();
    this.progressFill.style.width = `${(f.progress * 100).toFixed(1)}%`;
    this.meterFill.style.width = `${f.meter.toFixed(0)}%`;
    this.meterFill.style.background = f.meter < 25 ? '#ff9d8a' : '#7ef2b8';
    this.speedlines.classList.toggle('on', f.boosting);
  }

  setCombo(combo: number) {
    if (combo > 1) {
      this.comboEl.textContent = `x${combo} COMBO`;
      this.comboEl.classList.add('visible');
    } else {
      this.comboEl.classList.remove('visible');
    }
  }

  setSlowmo(on: boolean) {
    this.vignette.classList.toggle('slowmo', on);
  }

  /** Floating score popup anchored to a world position. */
  popupAt(text: string, x: number, y: number, z: number, camera: THREE.Camera, gold = false) {
    this.v.set(x, y, z).project(camera);
    if (this.v.z > 1) return; // behind the camera
    const sx = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    const div = document.createElement('div');
    div.className = gold ? 'popup gold' : 'popup';
    div.textContent = text;
    div.style.left = `${THREE.MathUtils.clamp(sx, 60, window.innerWidth - 60)}px`;
    div.style.top = `${THREE.MathUtils.clamp(sy, 60, window.innerHeight - 100)}px`;
    this.el.appendChild(div);
    setTimeout(() => div.remove(), 950);
  }
}
