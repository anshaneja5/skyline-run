import * as THREE from 'three';

// Procedural crash explosion: debris chunks, a fireball flash, smoke puffs
// and a decaying orange light. Self-contained — create, update, dispose.

const DEBRIS_COUNT = 42;
const SMOKE_COUNT = 12;
const FIRE_COUNT = 9;

const texCache = new Map<string, THREE.CanvasTexture>();
function puffTexture(inner: string, outer: string): THREE.CanvasTexture {
  const key = inner + outer;
  const cached = texCache.get(key);
  if (cached) return cached;
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

interface Puff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  growth: number;
  fade: number;
  baseScale: number;
  speed: number;
}

export class Explosion {
  group = new THREE.Group();
  private debris: THREE.InstancedMesh;
  private debrisVel: THREE.Vector3[] = [];
  private debrisSpin: THREE.Vector3[] = [];
  private debrisPos: THREE.Vector3[] = [];
  private puffs: Puff[] = [];
  private light: THREE.PointLight;
  private age = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  /** Built once (dormant, far below the city) so shaders compile at load,
   *  then reset() teleports it to each crash — no first-use jank. */
  constructor() {
    const center = new THREE.Vector3(0, -999, 0);
    // debris: chunks of plane + building in reds/grays
    const geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 });
    this.debris = new THREE.InstancedMesh(geo, mat, DEBRIS_COUNT);
    this.debris.frustumCulled = false;
    const colors = [0xc93c2c, 0x8a2f22, 0x54606f, 0x2b3a55, 0xf0a93a];
    const tint = new THREE.Color();
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      this.debrisPos.push(center.clone());
      this.debrisVel.push(new THREE.Vector3());
      this.debrisSpin.push(new THREE.Vector3());
      tint.setHex(colors[i % colors.length]);
      this.debris.setColorAt(i, tint);
    }
    this.group.add(this.debris);

    // fireball + smoke sprites
    const fireTex = puffTexture('rgba(255,235,160,1)', 'rgba(255,90,20,0)');
    const smokeTex = puffTexture('rgba(70,70,75,0.85)', 'rgba(60,60,65,0)');
    const spawnPuffs = (tex: THREE.CanvasTexture, count: number, scale: number, speed: number, growth: number, fade: number) => {
      for (let i = 0; i < count; i++) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })
        );
        sprite.position.copy(center);
        this.group.add(sprite);
        this.puffs.push({
          sprite,
          vel: new THREE.Vector3(),
          growth,
          fade,
          baseScale: scale,
          speed,
        });
      }
    };
    spawnPuffs(fireTex, FIRE_COUNT, 2.2, 4, 6, 1.8); // quick bright fireball
    spawnPuffs(smokeTex, SMOKE_COUNT, 1.6, 2.5, 3.2, 0.55); // lingering smoke

    // hot flash that dies down to embers
    this.light = new THREE.PointLight(0xff7a30, 0, 60, 2);
    this.light.position.copy(center);
    this.group.add(this.light);
  }

  /** Render everything almost-invisibly in front of the camera for a frame
   *  so sprite/light shader variants compile during takeoff, not on impact. */
  warmup(center: THREE.Vector3) {
    for (const p of this.puffs) {
      p.sprite.position.copy(center);
      p.sprite.scale.setScalar(0.05);
      (p.sprite.material as THREE.SpriteMaterial).opacity = 0.02;
    }
    this.debrisPos.forEach((pos) => pos.copy(center));
    this.debris.instanceMatrix.needsUpdate = true;
    this.light.position.copy(center);
    this.light.intensity = 0.01;
  }

  /** Park the effect out of sight after warmup. */
  hide() {
    for (const p of this.puffs) {
      p.sprite.position.set(0, -999, 0);
      (p.sprite.material as THREE.SpriteMaterial).opacity = 0;
    }
    this.light.intensity = 0;
  }

  /** Arm the explosion at a crash site. */
  reset(center: THREE.Vector3) {
    this.age = 0;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      this.debrisPos[i].copy(center);
      this.debrisVel[i].set((Math.random() - 0.5) * 16, Math.random() * 12 + 2, (Math.random() - 0.5) * 16);
      this.debrisSpin[i].set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    }
    for (const p of this.puffs) {
      p.sprite.position.copy(center).add(
        new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5)
      );
      p.sprite.scale.setScalar(p.baseScale * (0.7 + Math.random() * 0.6));
      p.vel.set((Math.random() - 0.5) * p.speed, Math.random() * p.speed * 0.7 + 1, (Math.random() - 0.5) * p.speed);
      (p.sprite.material as THREE.SpriteMaterial).opacity = 1;
    }
    this.light.position.copy(center);
    this.light.intensity = 60;
  }

  /** Advance the effect; returns false once fully burned out. */
  update(dt: number): boolean {
    this.age += dt;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const pos = this.debrisPos[i];
      const vel = this.debrisVel[i];
      vel.y -= 22 * dt; // gravity
      pos.addScaledVector(vel, dt);
      if (pos.y < 0.15) {
        pos.y = 0.15;
        vel.set(vel.x * 0.5, -vel.y * 0.3, vel.z * 0.5); // bounce & settle
      }
      const spin = this.debrisSpin[i];
      this.e.set(spin.x * this.age, spin.y * this.age, spin.z * this.age);
      this.q.setFromEuler(this.e);
      this.m4.compose(pos, this.q, new THREE.Vector3(1, 1, 1));
      this.debris.setMatrixAt(i, this.m4);
    }
    this.debris.instanceMatrix.needsUpdate = true;

    for (const p of this.puffs) {
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.addScalar(p.growth * dt);
      const mat = p.sprite.material as THREE.SpriteMaterial;
      mat.opacity = Math.max(mat.opacity - p.fade * dt, 0);
    }

    this.light.intensity = Math.max(60 * (1 - this.age * 1.6), 0);
    return this.age < 2.5;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.debris.geometry.dispose();
    (this.debris.material as THREE.Material).dispose();
    for (const p of this.puffs) {
      const mat = p.sprite.material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  }
}
