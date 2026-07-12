export const NEAR_MISS_DISTANCE = 1.5;
export const COMBO_WINDOW_MS = 3000;
export const COMBO_CAP = 8;

export interface ScoreEvent {
  points: number;
  nearMiss: boolean;
  combo: number;
}

export class Scoring {
  score = 0;
  combo = 1;
  bestCombo = 1;
  commitsDodged = 0;
  private lastNearMissAt = -Infinity;

  /**
   * Called once when a building has been fully passed without a crash.
   * `clearance` is the minimum distance kept from the building while overlapping
   * its z-range; `highAbove` means the plane was cruising above the combo ceiling.
   */
  buildingPassed(count: number, clearance: number, highAbove: boolean, now: number): ScoreEvent | null {
    if (highAbove) {
      this.combo = 1;
      return null; // flying over everything awards nothing
    }
    this.commitsDodged += count;
    const nearMiss = clearance <= NEAR_MISS_DISTANCE;
    if (nearMiss) {
      if (now - this.lastNearMissAt <= COMBO_WINDOW_MS) {
        this.combo = Math.min(this.combo + 1, COMBO_CAP);
      } else {
        this.combo = 2;
      }
      this.lastNearMissAt = now;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const points = count * 3 * this.combo;
      this.score += points;
      return { points, nearMiss: true, combo: this.combo };
    }
    // plain pass: base points, combo expires if window elapsed
    if (now - this.lastNearMissAt > COMBO_WINDOW_MS) this.combo = 1;
    this.score += count;
    return { points: count, nearMiss: false, combo: this.combo };
  }

  /** Combo also decays in real time even without passes. */
  tick(now: number) {
    if (this.combo > 1 && now - this.lastNearMissAt > COMBO_WINDOW_MS) this.combo = 1;
  }
}
