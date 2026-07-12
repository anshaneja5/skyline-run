import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingRecord, ContributionDay } from './types';
import type { GameAssets } from './assets';

export const BLOCK_DEPTH = 5; // one day of city depth
export const LANE_WIDTH = 6; // one weekday lane
export const BUILDING_SIZE = 4.2; // footprint
export const START_Z = 40; // plane spawn, city starts at z=0 heading -Z
const ROAD_WIDTH = 7 * LANE_WIDTH + 4;

export const heightFor = (count: number) => 2 + count * 1.2;
export const dayCenterZ = (dayIndex: number) => -dayIndex * BLOCK_DEPTH;
export const laneCenterX = (weekday: number) => (weekday - 3) * LANE_WIDTH;

// Bright daytime ramp: cream → amber → coral → deep red
const PALETTE = [0xf5e6c4, 0xf0a93a, 0xf2705a, 0xc93c2c];

export function bucketFor(count: number): number {
  if (count <= 2) return 0;
  if (count <= 5) return 1;
  if (count <= 9) return 2;
  return 3;
}

export const PALETTE_CSS = PALETTE.map((c) => '#' + c.toString(16).padStart(6, '0'));
export const BUCKET_LABELS = ['1–2', '3–5', '6–9', '10+'];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export interface World {
  scene: THREE.Scene;
  buildings: BuildingRecord[];
  maxBuildingHeight: number;
  cityLength: number;
  sun: THREE.DirectionalLight;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

// deterministic pseudo-random so preview and game render the same city
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ---------------------------------------------------------------- textures

/** Tileable facade: 2 window columns × 2 rows per tile, near-white base so
 *  per-building vertex colors tint it. */
function makeFacadeTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  // wall
  ctx.fillStyle = '#f7f3ec';
  ctx.fillRect(0, 0, S, S);
  // subtle horizontal floor line
  ctx.fillStyle = 'rgba(120,110,100,0.16)';
  ctx.fillRect(0, 0, S, 3);
  ctx.fillRect(0, S / 2, S, 3);
  const winW = 74;
  const winH = 82;
  const glassColors = ['#31485f', '#2b4256', '#3a5468', '#ffe9b0'];
  let i = 0;
  for (const wy of [22, 22 + S / 2]) {
    for (const wx of [24, 24 + S / 2]) {
      // frame
      ctx.fillStyle = 'rgba(60,55,50,0.75)';
      ctx.fillRect(wx - 5, wy - 5, winW + 10, winH + 10);
      // glass (one warm lit window per tile)
      const glass = glassColors[i === 3 ? 3 : i % 3];
      ctx.fillStyle = glass;
      ctx.fillRect(wx, wy, winW, winH);
      // sky reflection on the upper part of the glass
      const grad = ctx.createLinearGradient(0, wy, 0, wy + winH);
      grad.addColorStop(0, 'rgba(255,255,255,0.4)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      grad.addColorStop(1, 'rgba(0,0,20,0.15)');
      ctx.fillStyle = grad;
      ctx.fillRect(wx, wy, winW, winH);
      // mullions
      ctx.fillStyle = 'rgba(70,65,60,0.5)';
      ctx.fillRect(wx + winW / 2 - 2, wy, 4, winH);
      ctx.fillRect(wx, wy + winH / 2 - 2, winW, 4);
      i++;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Road tile: full width × one block of depth. Lane separators + edge lines. */
function makeRoadTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5f636b';
  ctx.fillRect(0, 0, W, H);
  // asphalt speckle + tire wear bands
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(10,10,18,0.09)';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  ctx.fillStyle = 'rgba(20,20,26,0.1)';
  for (let lane = 0; lane < 7; lane++) {
    const cx = ((lane + 0.5) / 7) * W;
    ctx.fillRect(cx - 14, 0, 10, H);
    ctx.fillRect(cx + 4, 0, 10, H);
  }
  // edge lines
  ctx.fillStyle = 'rgba(235,235,225,0.85)';
  ctx.fillRect(6, 0, 5, H);
  ctx.fillRect(W - 11, 0, 5, H);
  // 6 dashed separators between 7 lanes
  ctx.fillStyle = 'rgba(225,222,208,0.8)';
  for (let lane = 1; lane < 7; lane++) {
    const x = Math.round((lane / 7) * W);
    ctx.fillRect(x - 2, 8, 4, 44);
    ctx.fillRect(x - 2, 72, 4, 44);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Natural grass: layered multi-tone noise, no cartoon stripes. */
function makeGrassTexture(): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#75a058';
  ctx.fillRect(0, 0, S, S);
  // large soft patches of lighter/darker turf
  for (let i = 0; i < 26; i++) {
    const r = 20 + Math.random() * 46;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const tone = Math.random();
    const color = tone > 0.6 ? '124,164,90' : tone > 0.3 ? '100,140,74' : '88,124,66';
    g.addColorStop(0, `rgba(${color},0.5)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.save();
    ctx.translate(Math.random() * S, Math.random() * S);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  // fine blade speckle
  for (let i = 0; i < 1600; i++) {
    const bright = Math.random();
    ctx.fillStyle =
      bright > 0.75 ? 'rgba(170,200,120,0.25)' : bright > 0.4 ? 'rgba(70,105,52,0.28)' : 'rgba(50,80,40,0.22)';
    ctx.fillRect(Math.random() * S, Math.random() * S, 1.5, 2.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeBannerTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 28);
  ctx.fill();
  ctx.strokeStyle = '#c93c2c';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = '#2b3a55';
  ctx.font = '900 68px "Nunito", "Arial Rounded MT Bold", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- helpers

/** Baked cumulus textures: overlapping soft puffs with a flatter, shaded base. */
const cloudTextures: THREE.CanvasTexture[] = [];
function cloudTexture(variant: number): THREE.CanvasTexture {
  if (cloudTextures[variant]) return cloudTextures[variant];
  const W = 256;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const puffs = 6 + variant * 2;
  for (let i = 0; i < puffs; i++) {
    const px = W * (0.18 + hash(variant * 100 + i * 3) * 0.64);
    // puffy tops, flatter bottom line
    const py = H * (0.62 - hash(variant * 100 + i * 7) * 0.28);
    const r = H * (0.16 + hash(variant * 100 + i * 11) * 0.22);
    const g = ctx.createRadialGradient(px, py, r * 0.1, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(252,253,255,0.55)');
    g.addColorStop(1, 'rgba(250,252,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // soft warm-gray shading along the underside
  const shade = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.85);
  shade.addColorStop(0, 'rgba(190,200,215,0)');
  shade.addColorStop(1, 'rgba(175,185,205,0.25)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cloudTextures[variant] = tex;
  return tex;
}

function makeCloud(scale: number, variant: number): THREE.Object3D {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: cloudTexture(variant % 3),
      transparent: true,
      opacity: 0.82 + (variant % 4) * 0.045,
      depthWrite: false,
    })
  );
  sprite.scale.set(scale * 6, scale * 2.6, 1);
  return sprite;
}

/** Per-building box with UVs sized so window rows stay square regardless of height. */
function buildingGeometry(
  x: number,
  z: number,
  h: number,
  tint: THREE.Color,
  w = BUILDING_SIZE,
  d = BUILDING_SIZE
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, h / 2, z);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const uRepeat = Math.max(Math.round(w / 2.1), 1); // one texture tile ≈ 2.1 units wide
  const vRepeat = Math.max(Math.round(h / 2.4), 1); // one tile ≈ 2.4 units tall
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z — 4 uvs per face
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      if (f === 2 || f === 3) {
        // top/bottom face: pin into the frame-colored corner of the texture
        uv.setXY(idx, 0.001, 0.999);
      } else {
        uv.setXY(idx, uv.getX(idx) * uRepeat, uv.getY(idx) * vRepeat);
      }
    }
  }
  // vertex colors carry the bucket tint plus fake ambient occlusion at the base
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const vy = posAttr.getY(i);
    const ao = vy < 0.8 ? 0.62 : vy < 2.6 ? 0.62 + ((vy - 0.8) / 1.8) * 0.38 : 1;
    colors[i * 3] = tint.r * ao;
    colors[i * 3 + 1] = tint.g * ao;
    colors[i * 3 + 2] = tint.b * ao;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// ---------------------------------------------------------------- instancing

interface Spot {
  x: number;
  z: number;
  s: number;
  rotY: number;
}

/** Instance every mesh of a model at each placement, keeping node transforms
 *  and resting the model's bounding-box bottom on the ground. */
function instanceModel(
  scene: THREE.Scene,
  model: THREE.Group,
  spots: Spot[],
  normalizeHeight: number,
  opts: { jitterColor?: boolean; castShadow?: boolean } = {}
) {
  if (!spots.length) return;
  model.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(model);
  const baseScale = normalizeHeight / Math.max(bbox.max.y - bbox.min.y, 0.001);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material; local: THREE.Matrix4 }[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) parts.push({ geo: mesh.geometry, mat: mesh.material as THREE.Material, local: mesh.matrixWorld.clone() });
  });
  const place = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const part of parts) {
    const inst = new THREE.InstancedMesh(part.geo, part.mat, spots.length);
    spots.forEach((spot, i) => {
      const s = baseScale * spot.s;
      q.setFromAxisAngle(up, spot.rotY);
      pos.set(spot.x, -bbox.min.y * s, spot.z);
      scl.setScalar(s);
      place.compose(pos, q, scl).multiply(part.local);
      inst.setMatrixAt(i, place);
      if (opts.jitterColor) {
        const v = 0.85 + hash(i * 7) * 0.25;
        inst.setColorAt(i, new THREE.Color(v, v, v * (0.95 + hash(i * 9) * 0.1)));
      }
    });
    inst.castShadow = opts.castShadow ?? false;
    inst.userData.noDispose = true; // geometry/material belong to the cached asset
    scene.add(inst);
  }
}

// ---------------------------------------------------------------- world

export function buildWorld(days: ContributionDay[], assets?: GameAssets | null): World {
  const scene = new THREE.Scene();

  scene.background = new THREE.Color(0x7ec8f2);
  scene.fog = new THREE.Fog(0xa8dcf7, 90, 320);

  const skyGeo = new THREE.SphereGeometry(900, 16, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3f9fe0) },
      mid: { value: new THREE.Color(0xa5d8f5) },
      horizon: { value: new THREE.Color(0xfdeed2) },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
      void main(){
        float h = clamp(vPos.y/450.0 + 0.35, 0.0, 1.0);
        vec3 c = h < 0.45 ? mix(horizon, mid, smoothstep(0.0, 0.45, h))
                          : mix(mid, top, smoothstep(0.45, 1.0, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // warm sun with soft shadows following the plane (game moves it)
  const sun = new THREE.DirectionalLight(0xfff0da, 2.3);
  sun.position.set(50, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 360;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x9db888, 0.9));

  const cityLength = days.length * BLOCK_DEPTH;

  // --- ground ---
  const grassTex = makeGrassTexture();
  grassTex.repeat.set(50, 160);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, cityLength + 600),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -cityLength / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- road along the flight corridor ---
  const roadTex = makeRoadTexture();
  roadTex.repeat.set(1, Math.ceil(cityLength / 10));
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_WIDTH, cityLength + 120),
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -cityLength / 2 + 30);
  road.receiveShadow = true;
  scene.add(road);

  // sidewalk curbs on both road edges
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xe4ddcf, flatShading: true, roughness: 1 });
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(3, 0.22, cityLength + 120), curbMat);
    curb.position.set(side * (ROAD_WIDTH / 2 + 1.5), 0.11, -cityLength / 2 + 30);
    curb.receiveShadow = true;
    scene.add(curb);
  }

  // --- data buildings: merged facade-textured towers ---
  const records: BuildingRecord[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const tint = new THREE.Color();
  let maxBuildingHeight = 4;

  days.forEach((day, dayIndex) => {
    if (day.count === 0) return;
    const h = heightFor(day.count);
    maxBuildingHeight = Math.max(maxBuildingHeight, h);
    const x = laneCenterX(day.weekday);
    const z = dayCenterZ(dayIndex);
    tint.setHex(PALETTE[bucketFor(day.count)]);
    geos.push(buildingGeometry(x, z, h, tint));
    records.push({
      dayIndex,
      date: day.date,
      count: day.count,
      weekday: day.weekday,
      minX: x - BUILDING_SIZE / 2,
      maxX: x + BUILDING_SIZE / 2,
      minZ: z - BUILDING_SIZE / 2,
      maxZ: z + BUILDING_SIZE / 2,
      height: h,
      passed: false,
      minClearance: Infinity,
      wasLow: false,
    });
  });

  if (geos.length) {
    const merged = mergeGeometries(geos, false)!;
    geos.forEach((g) => g.dispose());
    const facadeMat = new THREE.MeshStandardMaterial({
      map: makeFacadeTexture(),
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
    });
    const towers = new THREE.Mesh(merged, facadeMat);
    towers.castShadow = true;
    towers.receiveShadow = true;
    scene.add(towers);
  }

  // roof slabs (cornice lip) — instanced, tinted darker than the facade
  const slabGeo = new THREE.BoxGeometry(BUILDING_SIZE + 0.5, 0.35, BUILDING_SIZE + 0.5);
  const slabMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
  const slabs = new THREE.InstancedMesh(slabGeo, slabMat, Math.max(records.length, 1));
  const m4 = new THREE.Matrix4();
  records.forEach((rec, i) => {
    m4.makeTranslation((rec.minX + rec.maxX) / 2, rec.height + 0.17, (rec.minZ + rec.maxZ) / 2);
    slabs.setMatrixAt(i, m4);
    tint.setHex(PALETTE[bucketFor(rec.count)]).multiplyScalar(0.72);
    slabs.setColorAt(i, tint);
  });
  slabs.count = records.length;
  slabs.castShadow = true;
  scene.add(slabs);

  // rooftop AC units on busier buildings (instanced from the Quaternius prop)
  if (assets?.acUnit) {
    let acGeo: THREE.BufferGeometry | null = null;
    let acMat: THREE.Material | null = null;
    assets.acUnit.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !acGeo) {
        acGeo = mesh.geometry;
        acMat = mesh.material as THREE.Material;
      }
    });
    if (acGeo && acMat) {
      const busy = records.filter((r) => r.count >= 6);
      const acs = new THREE.InstancedMesh(acGeo, acMat, Math.max(busy.length, 1));
      busy.forEach((rec, i) => {
        const cx = (rec.minX + rec.maxX) / 2 + (rec.dayIndex % 3 - 1) * 0.9;
        const cz = (rec.minZ + rec.maxZ) / 2 + ((rec.dayIndex * 7) % 3 - 1) * 0.9;
        m4.makeRotationY(((rec.dayIndex * 37) % 4) * (Math.PI / 2));
        m4.setPosition(cx, rec.height + 0.35, cz);
        acs.setMatrixAt(i, m4);
      });
      acs.count = busy.length;
      acs.userData.noDispose = true; // geometry/material belong to the cached asset
      scene.add(acs);
    }
  }

  // antennas on the 10+ towers
  const tallOnes = records.filter((r) => bucketFor(r.count) === 3);
  if (tallOnes.length) {
    const antGeo = new THREE.CylinderGeometry(0.05, 0.09, 3.4, 5);
    const antMat = new THREE.MeshStandardMaterial({ color: 0x44506a, flatShading: true });
    const ants = new THREE.InstancedMesh(antGeo, antMat, tallOnes.length);
    tallOnes.forEach((rec, i) => {
      m4.makeTranslation((rec.minX + rec.maxX) / 2 + 1.2, rec.height + 1.9, (rec.minZ + rec.maxZ) / 2 - 1.2);
      ants.setMatrixAt(i, m4);
    });
    scene.add(ants);
  }

  // --- dense city beyond the road ---
  // front row: detailed Quaternius buildings, instanced per variant (few draw calls)
  if (assets?.cityBuildings.length) {
    const variants = assets.cityBuildings;
    const buckets: Spot[][] = variants.map(() => []);
    let vi = 0;
    for (let z = 10; z < cityLength + 60; z += 30) {
      for (const side of [-1, 1]) {
        const targetH = 10 + ((z * 13 + (side + 1) * 57) % 26);
        buckets[vi++ % variants.length].push({
          x: side * (ROAD_WIDTH / 2 + 14 + ((z * 7) % 10)),
          z: -z,
          s: targetH / 18,
          rotY: (Math.floor(z / 30 + side) % 4) * (Math.PI / 2),
        });
      }
    }
    variants.forEach((v, i) => instanceModel(scene, v, buckets[i], 18));
  }

  // back rows: hundreds of merged facade towers in muted city tones
  {
    const FILLER_TONES = [0xd8cfc0, 0xc9b8a6, 0xb5c4cc, 0xd6d6d0, 0xc9a189, 0xa9b8ab, 0xbfae9d];
    const fillerGeos: THREE.BufferGeometry[] = [];
    const fillerTint = new THREE.Color();
    let n = 0;
    for (let z = 6; z < cityLength + 80; z += 15) {
      for (const side of [-1, 1]) {
        for (let col = 0; col < 3; col++) {
          n++;
          if (hash(n) < 0.28) continue; // leave gaps like real blocks
          const bx = side * (ROAD_WIDTH / 2 + 30 + col * 19 + hash(n * 3) * 8);
          const bz = -z - hash(n * 7) * 6;
          const h = 5 + hash(n * 13) * (10 + col * 9);
          const w = 5 + hash(n * 19) * 7;
          const d = 5 + hash(n * 31) * 7;
          fillerTint.setHex(FILLER_TONES[n % FILLER_TONES.length]);
          fillerGeos.push(buildingGeometry(bx, bz, h, fillerTint, w, d));
        }
      }
    }
    if (fillerGeos.length) {
      const mergedFiller = mergeGeometries(fillerGeos, false)!;
      fillerGeos.forEach((g) => g.dispose());
      const fillerMat = new THREE.MeshStandardMaterial({
        map: makeFacadeTexture(),
        vertexColors: true,
        roughness: 0.9,
      });
      const fillerMesh = new THREE.Mesh(mergedFiller, fillerMat);
      scene.add(fillerMesh);
    }
  }

  // --- side streets with traffic between the sidewalk and the city blocks ---
  const CAR_COUNT = Math.min(34, Math.floor(cityLength / 55));
  const carStreetX = ROAD_WIDTH / 2 + 9;
  const sideStreetMat = new THREE.MeshStandardMaterial({ color: 0x565a61, roughness: 1 });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(5, cityLength + 120), sideStreetMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(side * carStreetX, 0.005, -cityLength / 2 + 30);
    scene.add(strip);
  }
  const CAR_COLORS = [0xc4372f, 0x2f5fc4, 0xe0dedb, 0x3c4048, 0xd9a13b, 0x4d7a4a];
  const carBodyGeo = new THREE.BoxGeometry(1.6, 0.55, 3.2);
  const carCabinGeo = new THREE.BoxGeometry(1.4, 0.42, 1.6);
  const carBodyMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6, metalness: 0.25 });
  const carCabinMat = new THREE.MeshStandardMaterial({ color: 0x2c3646, flatShading: true, roughness: 0.35, metalness: 0.3 });
  const carBodies = new THREE.InstancedMesh(carBodyGeo, carBodyMat, CAR_COUNT);
  const carCabins = new THREE.InstancedMesh(carCabinGeo, carCabinMat, CAR_COUNT);
  carBodies.frustumCulled = false;
  carCabins.frustumCulled = false;
  const cars = Array.from({ length: CAR_COUNT }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const dir = i % 4 < 2 ? 1 : -1; // two directions per side street
    return {
      x: side * (carStreetX + dir * 1.1),
      z0: hash(i * 37) * cityLength,
      speed: dir * (7 + hash(i * 43) * 6),
    };
  });
  cars.forEach((_, i) => {
    tint.setHex(CAR_COLORS[i % CAR_COLORS.length]);
    carBodies.setColorAt(i, tint);
  });
  scene.add(carBodies, carCabins);

  // --- pedestrians strolling the sidewalks ---
  const PED_COLORS = [0xd94a38, 0x3a7bd5, 0x3fa66a, 0xf0a93a, 0x8a5fbf, 0x2b3a55, 0xe27ba0];
  const PED_COUNT = Math.min(90, Math.floor(cityLength / 18));
  const pedBodyGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.62, 6);
  const pedHeadGeo = new THREE.SphereGeometry(0.15, 6, 5);
  const pedBodyMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 });
  const pedHeadMat = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, flatShading: true, roughness: 1 });
  const pedBodies = new THREE.InstancedMesh(pedBodyGeo, pedBodyMat, PED_COUNT);
  const pedHeads = new THREE.InstancedMesh(pedHeadGeo, pedHeadMat, PED_COUNT);
  pedBodies.frustumCulled = false;
  pedHeads.frustumCulled = false;
  const peds = Array.from({ length: PED_COUNT }, (_, i) => ({
    x: (i % 2 === 0 ? 1 : -1) * (ROAD_WIDTH / 2 + 1.2 + hash(i * 5) * 2.2),
    z0: hash(i * 11) * cityLength,
    speed: (hash(i * 17) > 0.5 ? 1 : -1) * (0.8 + hash(i * 23) * 1.2),
    phase: hash(i * 29) * Math.PI * 2,
  }));
  peds.forEach((_, i) => {
    tint.setHex(PED_COLORS[i % PED_COLORS.length]);
    pedBodies.setColorAt(i, tint);
  });
  scene.add(pedBodies, pedHeads);

  // --- crow flocks crossing the sky ---
  const BIRD_COUNT = 42;
  const birdGeo = new THREE.BufferGeometry();
  // simple chevron: two wing triangles meeting at the body
  birdGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, 0, 0.35, -0.9, 0.42, -0.25, 0, 0, -0.1, 0, 0, 0.35, 0.9, 0.42, -0.25, 0, 0, -0.1],
      3
    )
  );
  birdGeo.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x22283a, side: THREE.DoubleSide });
  const birdMesh = new THREE.InstancedMesh(birdGeo, birdMat, BIRD_COUNT);
  birdMesh.frustumCulled = false;
  const flocks = Array.from({ length: 6 }, (_, f) => ({
    x0: (hash(f * 41) - 0.5) * 200,
    y: 26 + hash(f * 43) * 26,
    z0: -hash(f * 47) * cityLength,
    vx: (hash(f * 53) > 0.5 ? 1 : -1) * (3 + hash(f * 59) * 3),
    vz: 2 + hash(f * 61) * 3,
  }));
  scene.add(birdMesh);

  // --- sun disc with glow ---
  {
    const sc = document.createElement('canvas');
    sc.width = 128;
    sc.height = 128;
    const sctx = sc.getContext('2d')!;
    const grad = sctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,252,235,1)');
    grad.addColorStop(0.18, 'rgba(255,244,200,0.95)');
    grad.addColorStop(0.45, 'rgba(255,230,160,0.28)');
    grad.addColorStop(1, 'rgba(255,225,150,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);
    const sunTex = new THREE.CanvasTexture(sc);
    sunTex.colorSpace = THREE.SRGBColorSpace;
    const sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false })
    );
    sunSprite.scale.setScalar(220);
    sunSprite.position.set(320, 380, -cityLength * 0.55);
    scene.add(sunSprite);
  }

  // distant soft hills
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x638f4e, flatShading: true, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(30 + (i % 4) * 14, 1), hillMat);
    const side = i % 2 === 0 ? -1 : 1;
    hill.position.set(side * (130 + ((i * 53) % 80)), -14, -(i / 10) * cityLength - 40);
    hill.scale.y = 0.45;
    scene.add(hill);
  }

  // --- pulsing beacon on the busiest day of the year ---
  let beaconMat: THREE.MeshBasicMaterial | null = null;
  const busiest = records.reduce((a, b) => (b.count > a.count ? b : a), records[0]);
  if (busiest) {
    beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.5, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 14, 8, 1, true), beaconMat);
    beam.position.set((busiest.minX + busiest.maxX) / 2, busiest.height + 7, (busiest.minZ + busiest.maxZ) / 2);
    scene.add(beam);
  }

  // --- month boundary banners ---
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, flatShading: true });
  const barMat = new THREE.MeshStandardMaterial({ color: 0xc93c2c, flatShading: true });
  days.forEach((day, dayIndex) => {
    if (!day.date.endsWith('-01') || dayIndex === 0) return;
    const [y, mo] = day.date.split('-');
    const label = `${MONTHS[parseInt(mo, 10) - 1]} ${y}`;
    const z = dayCenterZ(dayIndex) + BLOCK_DEPTH / 2;
    const arch = new THREE.Group();
    const halfSpan = ROAD_WIDTH / 2 + 2;
    const barY = 17;
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, barY, 6), pillarMat);
      pillar.position.set(side * halfSpan, barY / 2, 0);
      arch.add(pillar);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2, 1.3, 1), barMat);
    bar.position.set(0, barY, 0);
    arch.add(bar);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 4.5),
      new THREE.MeshBasicMaterial({ map: makeBannerTexture(label), transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(0, barY + 3.5, 0);
    arch.add(sign);
    arch.position.z = z;
    scene.add(arch);
  });

  // --- clouds: a full sky of soft cumulus billboards ---
  const clouds: THREE.Object3D[] = [];
  for (let i = 0; i < 44; i++) {
    const big = i % 3 === 0;
    const cloud = makeCloud(big ? 7 + hash(i * 3) * 6 : 3 + hash(i * 5) * 3.5, i);
    cloud.position.set(
      (hash(i * 7) - 0.5) * 460,
      big ? 75 + hash(i * 11) * 70 : 45 + hash(i * 13) * 32,
      -hash(i * 17) * (cityLength + 200) + 80
    );
    (cloud as any).driftSpeed = 0.4 + hash(i * 19) * 1.2;
    scene.add(cloud);
    clouds.push(cloud);
  }

  // --- roadside trees & bushes (real models, instanced per source mesh) ---
  const treeCount = Math.min(110, Math.floor(days.length / 3.4));
  const treeSpots: { x: number; z: number; s: number; rotY: number }[] = [];
  for (let i = 0; i < treeCount; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    // most trees hug the sidewalk, some scatter between the back blocks
    const deep = hash(i * 71) > 0.72;
    // sidewalk trees stay clear of the side streets (which sit at ~6.5–11.5 out)
    const tx = side * (ROAD_WIDTH / 2 + (deep ? 26 + hash(i * 73) * 40 : 4.2 + hash(i * 31) * 1.8));
    const tz = -hash(i * 97) * cityLength;
    treeSpots.push({ x: tx, z: tz, s: 0.8 + hash(i * 13) * 0.9, rotY: hash(i * 51) * Math.PI * 2 });
  }

  if (assets?.trees.length) {
    const variants = assets.trees;
    const buckets: Spot[][] = variants.map(() => []);
    treeSpots.forEach((spot, i) => buckets[i % variants.length].push(spot));
    variants.forEach((tree, vi) =>
      instanceModel(scene, tree, buckets[vi], 5.5 + vi * 1.2, { jitterColor: true, castShadow: true })
    );
    if (assets.bush) {
      const bushSpots = Array.from({ length: 70 }, (_, i) => ({
        x: (i % 2 === 0 ? 1 : -1) * (ROAD_WIDTH / 2 + 3.2 + hash(i * 61) * 2),
        z: -hash(i * 67) * cityLength,
        s: 0.7 + hash(i * 83) * 0.8,
        rotY: hash(i * 89) * Math.PI * 2,
      }));
      instanceModel(scene, assets.bush, bushSpots, 1.1, { jitterColor: true });
    }
  } else {
    // fallback: simple cone trees
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.6, 5);
    const topGeo = new THREE.ConeGeometry(1.4, 3, 6);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x9a6b3f, flatShading: true }), treeSpots.length);
    const tops = new THREE.InstancedMesh(topGeo, new THREE.MeshStandardMaterial({ color: 0x55a866, flatShading: true }), treeSpots.length);
    treeSpots.forEach((spot, i) => {
      m4.makeScale(spot.s, spot.s, spot.s);
      m4.setPosition(spot.x, 0.8 * spot.s, spot.z);
      trunks.setMatrixAt(i, m4);
      m4.makeScale(spot.s, spot.s, spot.s);
      m4.setPosition(spot.x, 3 * spot.s, spot.z);
      tops.setMatrixAt(i, m4);
    });
    scene.add(trunks, tops);
  }

  let worldElapsed = 0;
  const pm = new THREE.Matrix4();
  const bm = new THREE.Matrix4();
  const rot = new THREE.Matrix4();

  return {
    scene,
    buildings: records,
    maxBuildingHeight,
    cityLength,
    sun,
    update(dt: number) {
      worldElapsed += dt;
      const t = worldElapsed;

      for (const cloud of clouds) {
        cloud.position.x += (cloud as any).driftSpeed * dt;
        if (cloud.position.x > 220) cloud.position.x = -220;
      }

      // cars cruise the side streets
      cars.forEach((c, i) => {
        let z = (c.z0 + c.speed * t) % cityLength;
        if (z < 0) z += cityLength;
        pm.makeRotationY(c.speed > 0 ? Math.PI : 0);
        pm.setPosition(c.x, 0.33, -z);
        carBodies.setMatrixAt(i, pm);
        pm.setPosition(c.x, 0.8, -z + (c.speed > 0 ? 0.25 : -0.25));
        carCabins.setMatrixAt(i, pm);
      });
      carBodies.instanceMatrix.needsUpdate = true;
      carCabins.instanceMatrix.needsUpdate = true;

      // pedestrians shuffle along the sidewalks with a little bob
      peds.forEach((p, i) => {
        let z = (p.z0 + p.speed * t) % cityLength;
        if (z < 0) z += cityLength;
        const bob = Math.abs(Math.sin(t * 6 + p.phase)) * 0.05;
        pm.makeRotationY(p.speed > 0 ? 0 : Math.PI);
        pm.setPosition(p.x, 0.31 + bob, -z);
        pedBodies.setMatrixAt(i, pm);
        pm.setPosition(p.x, 0.76 + bob, -z);
        pedHeads.setMatrixAt(i, pm);
      });
      pedBodies.instanceMatrix.needsUpdate = true;
      pedHeads.instanceMatrix.needsUpdate = true;

      // crow flocks: V formations, flapping via vertical wing squash
      for (let i = 0; i < BIRD_COUNT; i++) {
        const flock = flocks[Math.floor(i / 7)];
        const k = i % 7;
        const row = Math.ceil(k / 2);
        const side = k % 2 === 0 ? 1 : -1;
        let x = flock.x0 + flock.vx * t + side * row * 1.6;
        x = ((x + 260) % 520) - 260; // wrap across the sky
        let z = (flock.z0 - flock.vz * t - row * 1.4) % cityLength;
        if (z > 0) z -= cityLength;
        const flap = 0.4 + Math.abs(Math.sin(t * 7 + i)) * 1.1;
        rot.makeRotationY(Math.atan2(flock.vx, -flock.vz));
        bm.makeScale(1, flap, 1).multiply(rot);
        bm.setPosition(x, flock.y + Math.sin(t * 1.5 + i) * 0.6, z);
        birdMesh.setMatrixAt(i, bm);
      }
      birdMesh.instanceMatrix.needsUpdate = true;

      if (beaconMat) beaconMat.opacity = 0.35 + 0.25 * Math.sin(t * 3);
    },
    dispose() {
      scene.traverse((obj) => {
        if (obj.userData.noDispose) return;
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
        else if (mat) mat.dispose();
      });
    },
  };
}
