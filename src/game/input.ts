import { tilt } from './tilt';

export interface InputState {
  steer: number; // -1 left .. 1 right
  climb: number; // -1 dive .. 1 climb
  boostHeld: boolean;
  slowmoHeld: boolean;
  pausePressed: boolean; // edge-triggered, consume with consumePause()
}

export class Input {
  private keys = new Set<string>();
  private touchSteer = 0;
  private touchClimb = 0;
  private touchBoostToggle = false;
  private pauseQueued = false;
  private activeTouches = new Map<number, { x: number; y: number }>();

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    element.addEventListener('touchstart', this.onTouchStart, { passive: false });
    element.addEventListener('touchmove', this.onTouchMove, { passive: false });
    element.addEventListener('touchend', this.onTouchEnd);
    element.addEventListener('touchcancel', this.onTouchEnd);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.pauseQueued = true;
      return;
    }
    this.keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length >= 2) {
      this.touchBoostToggle = !this.touchBoostToggle;
    }
    for (const t of Array.from(e.changedTouches)) {
      this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    this.recomputeTouchSteer();
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (this.activeTouches.has(t.identifier))
        this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    this.recomputeTouchSteer();
  };

  private onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      this.activeTouches.delete(t.identifier);
    }
    this.recomputeTouchSteer();
  };

  private recomputeTouchSteer() {
    if (this.activeTouches.size === 0) {
      this.touchSteer = 0;
      this.touchClimb = 0;
      return;
    }
    const midX = window.innerWidth / 2;
    const h = window.innerHeight;
    let steer = 0;
    let climb = 0;
    for (const { x, y } of this.activeTouches.values()) {
      steer += x < midX ? -1 : 1;
      // top third climbs, bottom third dives, middle band is neutral
      if (y < h * 0.34) climb += 1;
      else if (y > h * 0.66) climb -= 1;
    }
    this.touchSteer = Math.max(-1, Math.min(1, steer));
    this.touchClimb = Math.max(-1, Math.min(1, climb));
  }

  read(): InputState {
    const k = this.keys;
    let steer = 0;
    let climb = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) climb += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) climb -= 1;
    // keyboard wins; then gyroscope tilt (when enabled); touch zones as fallback
    if (steer === 0) steer = tilt.enabled ? tilt.steer : this.touchSteer;
    if (climb === 0) climb = tilt.enabled ? tilt.climb : this.touchClimb;

    return {
      steer,
      climb,
      boostHeld: k.has('ShiftLeft') || k.has('ShiftRight') || this.touchBoostToggle,
      slowmoHeld: k.has('Space'),
      pausePressed: this.pauseQueued,
    };
  }

  consumePause(): boolean {
    const p = this.pauseQueued;
    this.pauseQueued = false;
    return p;
  }

  resetTouchBoost() {
    this.touchBoostToggle = false;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.element.removeEventListener('touchstart', this.onTouchStart);
    this.element.removeEventListener('touchmove', this.onTouchMove);
    this.element.removeEventListener('touchend', this.onTouchEnd);
    this.element.removeEventListener('touchcancel', this.onTouchEnd);
  }
}
