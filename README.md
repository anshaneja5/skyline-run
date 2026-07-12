<div align="center">

# ✈️ Skyline Run

**Fly a plane through a year of your GitHub commits.**

Every day you committed becomes a building. Busy days become skyscrapers.
Crash into one and it tells you exactly which date killed you.

**[▶ Play it live](https://skyline-run.vercel.app)**

![Cockpit view flying through the commit city](docs/flight.jpg)

</div>

---

## What is this?

Skyline Run turns your GitHub contribution graph into a 3D city and puts you in the
cockpit of a small plane flying through it — starting at your first contribution day
twelve months ago and ending today.

- **One day = one building.** Height is exact: `2 + commits × 1.2` units. A 40-commit
  day is a tower; a lazy Sunday is a gap you can dive through.
- **Seven lanes, one per weekday.** Sunday is the leftmost lane, Saturday the
  rightmost — so your weekly rhythm becomes the city's shape. Month boundaries are
  race-checkpoint arches.
- **Crashing is informative.** The crash screen names the date, its commit count, and
  a mini bar-chart of that week. Blame your past self.
- **Surviving the whole year is the win.** The scoring pushes you to do it the
  dangerous way.

Type any GitHub username on the start screen to fly someone else's year instead.

![Start screen with the city preview](docs/start.jpg)

## How scoring works

Flying safely above the city earns **nothing**. The points live down in the canyon:

| Action | Points |
| --- | --- |
| Passing a building below rooftop level | its commit count |
| **Near-miss** (within 1.5 units of a wall or roof) | commit count × 3 |
| Chaining near-misses within 3 s | combo multiplier ×2, ×3 … up to **×8** |
| Cruising high above everything | 0 — and your combo resets |

**Boost** (1.6× speed, wider FOV) and **slow-mo** (0.45× time, tape-warped audio)
share one meter that refills over time. Best score per username is kept in
`localStorage`. A pulsing beacon marks your busiest day of the year.

## Controls

| Input | Action |
| --- | --- |
| `A` `D` / `←` `→` | steer, with banking roll |
| `W` `S` / `↑` `↓` | climb / dive |
| `Shift` (hold) | boost |
| `Space` (hold) | slow-mo |
| `Esc` / `P` | pause |
| 📱 **Tilt** | roll the phone to steer, pitch it like a yoke to climb — the angle you hold it at on take-off becomes level flight |
| 📱 Touch | left/right half steers, top/bottom third climbs/dives, two-finger tap toggles boost |

## Running it locally

**1. Get a GitHub token** — [create a classic token](https://github.com/settings/tokens)
with just the `read:user` scope.

**2. Configure:**

```sh
cp .env.example .env   # then paste your token into GITHUB_TOKEN
```

**3. Run:**

```sh
npm install
npm run dev            # Express proxy on :3001 + Vite on :5173
```

Open <http://localhost:5173>. No token? The game still runs on clearly-labeled demo
data so you can try it before setting anything up.

## How it's built

**Stack:** Vite + vanilla TypeScript + Three.js. No framework, no game engine.
A tiny API layer keeps the GitHub token server-side — the browser never sees it.

```
server/index.js         local dev proxy (Express) — GitHub GraphQL, 1 h cache/user
api/                    the same proxy as Vercel serverless functions
src/game/
  world.ts              city generation, lighting, sky, traffic, pedestrians, birds
  plane.ts              cockpit, flight physics, camera feel
  collisions.ts         moving-cursor AABB checks (~2 buildings tested per frame)
  scoring.ts            near-miss detection and combo chain
  audio.ts              procedural Web Audio: engine, whooshes, chimes, music
  input.ts / tilt.ts    keyboard, touch zones, gyroscope steering
  assets.ts             GLB loading with procedural fallbacks
src/ui/                 HUD (instrument cluster), start/pause/crash/win screens
public/assets/models    CC0 models, ~6.7 MB total
```

Details that matter:

- **The data buildings are one draw call.** All ~250 towers are merged into a single
  mesh with a procedurally generated window-facade texture, per-building tint, and
  fake ambient occlusion baked into vertex colors. Their dimensions are data — models
  would lie, boxes don't.
- **Everything else is instanced** — background city blocks, trees, bushes, cars,
  pedestrians, crows. The whole scene stays at 60 fps on a mid-range laptop, and an
  adaptive quality system steps down pixel ratio, then shadows, if a weaker device
  can't hold ~45 fps.
- **The game runs with zero downloaded assets.** Every model has a primitive
  fallback; all sound is synthesized with the Web Audio API at runtime.
- **`prefers-reduced-motion`** disables camera shake, idle bobbing, and speed-line
  effects.

## Deploying your own

The repo deploys to Vercel as-is: the Vite build is served statically and `api/`
becomes serverless functions. Set two environment variables in your Vercel project:

| Variable | Value |
| --- | --- |
| `GITHUB_TOKEN` | classic token, `read:user` scope |
| `DEFAULT_USER` | username pre-filled on the start screen |

## Credits

All bundled 3D assets are **CC0** by [Quaternius](https://quaternius.com) — the
plane, city buildings, trees, and props. Full list in [CREDITS.md](CREDITS.md).
Sound and music are procedural, so nothing else to credit — except your commit
history, which did all the level design.
