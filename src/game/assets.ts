import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GameAssets {
  plane: THREE.Group | null;
  cityBuildings: THREE.Group[]; // background skyline variants
  trees: THREE.Group[]; // roadside tree variants
  bush: THREE.Group | null;
  acUnit: THREE.Group | null;
}

const MODEL_DIR = '/assets/models';

async function loadOne(loader: GLTFLoader, file: string): Promise<THREE.Group | null> {
  try {
    const gltf = await loader.loadAsync(`${MODEL_DIR}/${file}`);
    // assets are cached and reused across worlds — never dispose their GPU resources
    gltf.scene.traverse((o) => (o.userData.noDispose = true));
    return gltf.scene;
  } catch {
    console.warn(`Asset ${file} unavailable — using procedural fallback.`);
    return null;
  }
}

/** Quaternius' FBX-converted plane ships with gray materials — recolor by name. */
function recolorPlane(plane: THREE.Group) {
  const colors: Record<string, number> = {
    Body: 0xd94a38, // coral red fuselage
    Bottom: 0xf6f1e7, // cream underside
    Windows: 0x35506e, // dark glass
    'Material.004': 0x2b3a55, // props/struts
  };
  plane.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      const hex = colors[std.name];
      if (hex !== undefined) std.color.setHex(hex);
      std.metalness = 0.05;
      std.roughness = 0.75;
      std.flatShading = true;
      std.needsUpdate = true;
    }
    mesh.castShadow = true;
  });
}

let cached: GameAssets | null = null;

export async function loadAssets(onProgress?: (done: number, total: number) => void): Promise<GameAssets> {
  if (cached) return cached;
  const loader = new GLTFLoader();
  const files = [
    'plane.glb',
    'b_small.glb',
    'b_medium.glb',
    'b_large.glb',
    'prop_ac.glb',
    'tree1.glb',
    'tree2.glb',
    'tree3.glb',
    'bush.glb',
  ];
  let done = 0;
  const tick = () => onProgress?.(++done, files.length);
  const [plane, small, medium, large, ac, tree1, tree2, tree3, bush] = await Promise.all(
    files.map((f) => loadOne(loader, f).then((g) => (tick(), g)))
  );
  if (plane) recolorPlane(plane);
  cached = {
    plane,
    cityBuildings: [small, medium, large].filter((g): g is THREE.Group => g !== null),
    trees: [tree1, tree2, tree3].filter((g): g is THREE.Group => g !== null),
    bush,
    acUnit: ac,
  };
  return cached;
}
