import * as THREE from 'three';
import type { GameAssets } from './assets';

export const BASE_SPEED = 26;
export const BOOST_MULT = 1.6;
export const STEER_SPEED = 22;
export const CLIMB_SPEED = 14;
export const MIN_ALT = 2.3; // keeps the plane model's belly above the asphalt

const BASE_FOV = 65;
const BOOST_FOV = 78;

export interface Plane {
  position: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
  cockpit: THREE.Group;
  velocityX: number;
  velocityY: number;
  bank: number;
  pitch: number;
  update(
    dt: number,
    input: { steer: number; climb: number; boosting: boolean },
    elapsed: number,
    maxAlt: number,
    reducedMotion: boolean
  ): void;
  addShake(amount: number): void;
}

/** Cockpit interior from primitives + the Quaternius plane body around the
 *  camera when the asset loaded, plus a spinning propeller. */
function buildCockpit(assets?: GameAssets | null): { group: THREE.Group; propeller: THREE.Object3D } {
  const g = new THREE.Group();
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x37475f, flatShading: true, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xc93c2c, flatShading: true, roughness: 0.8 });
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x2b3a55, flatShading: true });

  // dashboard: slim sloped panel at the bottom of the view
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.26, 0.42), dashMat);
  dash.position.set(0, -0.68, -0.9);
  dash.rotation.x = -0.45;
  g.add(dash);

  // instrument dials
  const dialFaceMat = new THREE.MeshStandardMaterial({ color: 0xeef2f7, roughness: 0.4 });
  for (const dx of [-0.34, 0, 0.34]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12), trimMat);
    rim.rotation.x = Math.PI / 2 - 0.45;
    rim.position.set(dx, -0.6, -0.82);
    g.add(rim);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.032, 12), dialFaceMat);
    face.rotation.x = Math.PI / 2 - 0.45;
    face.position.set(dx, -0.601, -0.819);
    g.add(face);
  }

  // control yoke
  const yoke = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 6), strutMat);
  stick.rotation.x = 0.5;
  yoke.add(stick);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 12, Math.PI), strutMat);
  wheel.position.set(0, 0.15, -0.07);
  wheel.rotation.x = -0.4;
  yoke.add(wheel);
  yoke.position.set(0, -0.82, -0.62);
  g.add(yoke);

  // canopy struts on the screen edges
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.6, 0.07), strutMat);
    strut.position.set(side * 0.95, 0.15, -0.95);
    strut.rotation.z = side * 0.42;
    strut.rotation.x = 0.15;
    g.add(strut);
  }
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.07), strutMat);
  topBar.position.set(0, 0.78, -0.95);
  g.add(topBar);

  // plane body around the camera: real model if available, primitives otherwise
  let noseZ = -2.6;
  if (assets?.plane) {
    const model = assets.plane.clone();
    // SmallPlane spans roughly x±4.3, y −1..1.4, z −5.7..3.1 (nose toward −z)
    model.position.set(0, -1.25, 0.4);
    g.add(model);
    noseZ = -4.6;
  } else {
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e7, flatShading: true, roughness: 0.9 });
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.6), trimMat);
    nose.position.set(0, -0.75, -1.9);
    nose.rotation.x = 0.12;
    g.add(nose);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.09, 1.0), wingMat);
      wing.position.set(side * 2.5, -0.5, -1.2);
      wing.rotation.z = side * 0.06;
      g.add(wing);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 1.0), trimMat);
      tip.position.set(side * 3.75, -0.46, -1.2);
      g.add(tip);
    }
  }

  // spinning propeller at the nose: thin blades + translucent blur disc
  const propeller = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2b3a55, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.03), bladeMat);
    blade.position.y = 0.4;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.add(blade);
    propeller.add(holder);
  }
  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 24),
    new THREE.MeshBasicMaterial({ color: 0x9aa8c0, transparent: true, opacity: 0.07, depthWrite: false })
  );
  propeller.add(blurDisc);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 8), trimMat);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.1;
  propeller.add(spinner);
  propeller.position.set(0, -1.05, noseZ);
  g.add(propeller);

  return { group: g, propeller };
}

export function createPlane(aspect: number, assets?: GameAssets | null): Plane {
  const camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 1200);
  const { group: cockpit, propeller } = buildCockpit(assets);
  camera.add(cockpit);

  const position = new THREE.Vector3(0, 8, 40);
  let bank = 0;
  let pitch = 0;
  let shake = 0;
  let fov = BASE_FOV;

  return {
    position,
    camera,
    cockpit,
    velocityX: 0,
    velocityY: 0,
    bank: 0,
    pitch: 0,

    addShake(amount: number) {
      shake = Math.min(shake + amount, 1);
    },

    update(dt, input, elapsed, maxAlt, reducedMotion) {
      // lateral / vertical motion
      this.velocityX = THREE.MathUtils.damp(this.velocityX, input.steer * STEER_SPEED, 6, dt);
      this.velocityY = THREE.MathUtils.damp(this.velocityY, input.climb * CLIMB_SPEED, 6, dt);
      position.x += this.velocityX * dt;
      position.y += this.velocityY * dt;
      // clamp inside the outer buildings' footprint (they span to ±20.1) so
      // hugging the edge rail is a crash, not a free ride
      position.x = THREE.MathUtils.clamp(position.x, -19.5, 19.5);
      position.y = THREE.MathUtils.clamp(position.y, MIN_ALT, maxAlt);

      // banking + pitch attitude
      bank = THREE.MathUtils.damp(bank, -input.steer * 0.55, 5, dt);
      pitch = THREE.MathUtils.damp(pitch, input.climb * 0.22, 5, dt);
      this.bank = bank;
      this.pitch = pitch;

      // propeller spin, faster with boost
      propeller.rotation.z += dt * (input.boosting ? 55 : 34);

      // idle bobbing
      let bobY = 0;
      let bobR = 0;
      if (!reducedMotion) {
        bobY = Math.sin(elapsed * 1.7) * 0.06 + Math.sin(elapsed * 3.1) * 0.025;
        bobR = Math.sin(elapsed * 1.3) * 0.012;
      }

      // FOV toward boost target
      const targetFov = input.boosting ? BOOST_FOV : BASE_FOV;
      fov = THREE.MathUtils.damp(fov, targetFov, 4, dt);
      camera.fov = fov;
      camera.updateProjectionMatrix();

      // camera shake decay
      let sx = 0;
      let sy = 0;
      if (shake > 0.001 && !reducedMotion) {
        sx = (Math.random() - 0.5) * shake * 0.35;
        sy = (Math.random() - 0.5) * shake * 0.35;
      }
      shake = THREE.MathUtils.damp(shake, 0, 7, dt);

      camera.position.set(position.x + sx, position.y + bobY + sy, position.z);
      camera.rotation.set(pitch, 0, bank + bobR, 'YXZ');
    },
  };
}
