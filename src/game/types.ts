export interface ContributionDay {
  date: string;
  count: number;
  weekday: number;
}

export interface BuildingRecord {
  dayIndex: number;
  date: string;
  count: number;
  weekday: number;
  // AABB in world space
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  // scoring state
  passed: boolean;
  minClearance: number;
  wasLow: boolean; // dipped below the combo ceiling while alongside this building
}

export interface RunStats {
  score: number;
  bestCombo: number;
  commitsDodged: number;
  daysSurvived: number;
  totalDays: number;
  flightTimeMs: number;
  crashedInto?: { date: string; count: number };
}
