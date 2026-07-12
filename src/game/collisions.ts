import type { BuildingRecord } from './types';

export const PLANE_RADIUS = 0.75;

export interface PassEvent {
  building: BuildingRecord;
  clearance: number;
  wasLow: boolean;
}

export interface CollisionResult {
  crashed: BuildingRecord | null;
  passes: PassEvent[];
}

/**
 * Buildings arrive sorted by day index (z strictly decreasing along the flight
 * path), so a moving cursor keeps the per-frame check to the couple of
 * buildings actually near the plane instead of all ~250.
 */
export class CollisionSystem {
  private cursor = 0;

  constructor(
    private buildings: BuildingRecord[],
    private comboCeiling: number
  ) {}

  step(px: number, py: number, pz: number): CollisionResult {
    const passes: PassEvent[] = [];
    const r = PLANE_RADIUS;

    // finalize buildings the plane has fully flown past
    while (this.cursor < this.buildings.length) {
      const b = this.buildings[this.cursor];
      if (pz < b.minZ - r) {
        b.passed = true;
        passes.push({ building: b, clearance: b.minClearance, wasLow: b.wasLow });
        this.cursor++;
      } else {
        break;
      }
    }

    // check active buildings (z-ranges near the plane)
    for (let i = this.cursor; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.maxZ + r < pz) break; // beyond reach — everything after is farther ahead
      // z-overlap window: track clearance + altitude
      const dx = Math.max(b.minX - px, 0, px - b.maxX);
      const dy = Math.max(py - b.height, 0);
      const dz = Math.max(b.minZ - pz, 0, pz - b.maxZ);
      if (dz === 0) {
        const lateral = Math.hypot(dx, dy);
        b.minClearance = Math.min(b.minClearance, Math.max(lateral - r, 0));
        if (py <= this.comboCeiling) b.wasLow = true;
      }
      const dist = Math.hypot(dx, dy, dz);
      if (dist < r) {
        return { crashed: b, passes };
      }
    }

    return { crashed: null, passes };
  }
}
