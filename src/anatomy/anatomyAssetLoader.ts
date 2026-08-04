import {
  Group,
  LoadingManager,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
  Vector3,
} from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  HIP_ANATOMY_GROUPS,
  type AnatomySide,
  type HipAnatomyGroup,
} from "./anatomyTypes";
import {
  ACTIVE_HIP_ANATOMY_ASSET_ID,
  ANATOMY_ASSETS,
} from "../content/assets/anatomyAssets";

export interface LoadedHipAnatomy {
  readonly scene: Group;
  readonly groups: ReadonlyMap<HipAnatomyGroup, Group>;
  readonly hipPivots: Readonly<Record<AnatomySide, Vector3>>;
}

export interface HipAnatomyAssetLease {
  readonly promise: Promise<LoadedHipAnatomy>;
  release(): void;
}

interface CacheEntry {
  consumers: number;
  directCacheRetained: boolean;
  disposeWhenReady: boolean;
  promise: Promise<LoadedHipAnatomy>;
  resource: LoadedHipAnatomy | null;
}

const asset = ANATOMY_ASSETS[ACTIVE_HIP_ANATOMY_ASSET_ID];
const PIVOT_EPSILON_MM = 1e-6;
let cacheEntry: CacheEntry | null = null;

function isFiniteTriplet(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((coordinate) =>
      typeof coordinate === "number" && Number.isFinite(coordinate),
    )
  );
}

function validatePivot(
  side: AnatomySide,
  value: unknown,
): [number, number, number] {
  if (!isFiniteTriplet(value)) {
    throw new Error(`Hip anatomy is missing a valid ${side} hip pivot.`);
  }
  if (
    Math.abs(value[1]) > PIVOT_EPSILON_MM ||
    Math.abs(value[2]) > PIVOT_EPSILON_MM ||
    (side === "left" ? value[0] <= 0 : value[0] >= 0)
  ) {
    throw new Error(
      `Hip anatomy ${side} pivot is not a centred hip pivot in application coordinates.`,
    );
  }
  return value;
}

function findMetadataRoot(scene: Group): Object3D {
  const matches: Object3D[] = [];
  scene.traverse((object) => {
    if (object.userData.orthoFluoro !== undefined) {
      matches.push(object);
    }
  });
  if (matches.length !== 1) {
    throw new Error(
      `Hip anatomy must contain exactly one OrthoFluoro metadata root; found ${matches.length}.`,
    );
  }
  return matches[0];
}

function normalizeSemanticGroup(object: Object3D): Group {
  if (object instanceof Group) return object;
  const parent = object.parent;
  if (parent === null) {
    throw new Error(`Hip anatomy group ${object.name} has no parent.`);
  }
  const childIndex = parent.children.indexOf(object);
  const group = new Group();
  group.name = object.name;
  group.userData = { ...object.userData };
  group.position.copy(object.position);
  group.quaternion.copy(object.quaternion);
  group.scale.copy(object.scale);
  group.matrix.copy(object.matrix);
  group.matrixAutoUpdate = object.matrixAutoUpdate;
  group.visible = object.visible;
  group.renderOrder = object.renderOrder;
  group.layers.mask = object.layers.mask;
  [...object.children].forEach((child) => group.add(child));
  parent.remove(object);
  parent.add(group);
  if (childIndex >= 0) {
    parent.children.splice(parent.children.indexOf(group), 1);
    parent.children.splice(childIndex, 0, group);
  }
  return group;
}

function validateSemanticGroups(scene: Group): Map<HipAnatomyGroup, Group> {
  const groups = new Map<HipAnatomyGroup, Group>();
  const semanticObjects: Object3D[] = [];
  scene.traverse((object) => {
    const semanticName = object.userData.anatomyGroup;
    if (typeof semanticName !== "string" || object instanceof Mesh) return;
    semanticObjects.push(object);
  });
  semanticObjects.forEach((object) => {
    const semanticName = object.userData.anatomyGroup as string;
    if (!HIP_ANATOMY_GROUPS.includes(semanticName as HipAnatomyGroup)) {
      throw new Error(`Hip anatomy contains unknown group ${semanticName}.`);
    }
    if (groups.has(semanticName as HipAnatomyGroup)) {
      throw new Error(`Hip anatomy contains duplicate group ${semanticName}.`);
    }
    let meshCount = 0;
    const group = normalizeSemanticGroup(object);
    group.traverse((descendant) => {
      if (descendant === group) return;
      if (descendant instanceof Mesh) {
        meshCount += 1;
        return;
      }
      if (!(descendant instanceof Group)) {
        throw new Error(
          `Hip anatomy group ${semanticName} contains non-mesh scene content.`,
        );
      }
    });
    if (meshCount === 0) {
      throw new Error(`Hip anatomy group ${semanticName} contains no meshes.`);
    }
    groups.set(semanticName as HipAnatomyGroup, group);
  });
  HIP_ANATOMY_GROUPS.forEach((name) => {
    if (!groups.has(name)) {
      throw new Error(`Hip anatomy is missing semantic group ${name}.`);
    }
  });
  return groups;
}

function disposeMaterial(material: Material): void {
  Object.values(material).forEach((value) => {
    if (value instanceof Texture) value.dispose();
  });
  material.dispose();
}

export function disposeLoadedHipAnatomy(resource: LoadedHipAnatomy): void {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  resource.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach(disposeMaterial);
}

function disposeUnvalidatedScene(scene: Group): void {
  disposeLoadedHipAnatomy({
    groups: new Map(),
    hipPivots: {
      left: new Vector3(),
      right: new Vector3(),
    },
    scene,
  });
}

function prepareLoadedScene(scene: Group): LoadedHipAnatomy {
  try {
    const metadataRoot = findMetadataRoot(scene);
    const metadata = metadataRoot.userData.orthoFluoro as Record<
      string,
      unknown
    >;
    if (
      metadata.artifact !== ACTIVE_HIP_ANATOMY_ASSET_ID ||
      metadata.units !== "millimetres"
    ) {
      throw new Error("Hip anatomy metadata does not match the active asset.");
    }
    const pivots = metadata.hipPivots as
      | Record<AnatomySide, unknown>
      | undefined;
    const leftPivot = validatePivot("left", pivots?.left);
    const rightPivot = validatePivot("right", pivots?.right);
    if (Math.abs(leftPivot[0] + rightPivot[0]) > PIVOT_EPSILON_MM) {
      throw new Error("Hip anatomy centred hip pivots are not symmetric.");
    }
    const groups = validateSemanticGroups(scene);
    const replacedMaterials = new Set<Material>();
    const neutralMaterial = new MeshStandardMaterial({
      color: "#d9cbb5",
      metalness: 0,
      roughness: 0.72,
    });
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const currentMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      currentMaterials.forEach((material) => replacedMaterials.add(material));
      object.material = neutralMaterial;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;
    });
    replacedMaterials.forEach(disposeMaterial);

    return {
      groups,
      hipPivots: {
        left: new Vector3(...leftPivot),
        right: new Vector3(...rightPivot),
      },
      scene,
    };
  } catch (error) {
    disposeUnvalidatedScene(scene);
    throw error;
  }
}

function createLocalLoadingManager(): LoadingManager {
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url === asset.filePath || url.startsWith(asset.dracoDecoderPath)) {
      return url;
    }
    throw new Error(`External anatomy dependency is not permitted: ${url}`);
  });
  return manager;
}

async function loadFreshHipAnatomy(): Promise<LoadedHipAnatomy> {
  const manager = createLocalLoadingManager();
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath(asset.dracoDecoderPath);
  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setDRACOLoader(dracoLoader);
  try {
    const gltf = await gltfLoader.loadAsync(asset.filePath);
    if (!(gltf.scene instanceof Group)) {
      throw new Error("Hip anatomy GLB did not contain a group scene.");
    }
    return prepareLoadedScene(gltf.scene);
  } finally {
    dracoLoader.dispose();
  }
}

function getOrCreateCacheEntry(): CacheEntry {
  if (cacheEntry !== null) return cacheEntry;

  const entry: CacheEntry = {
    consumers: 0,
    directCacheRetained: false,
    disposeWhenReady: false,
    promise: Promise.resolve(null as never),
    resource: null,
  };
  entry.promise = loadFreshHipAnatomy()
    .then((resource) => {
      entry.resource = resource;
      if (entry.disposeWhenReady) {
        disposeLoadedHipAnatomy(resource);
        entry.resource = null;
      }
      return resource;
    })
    .catch((error: unknown) => {
      if (cacheEntry === entry) cacheEntry = null;
      throw error;
    });
  cacheEntry = entry;
  return entry;
}

export function loadHipAnatomy(): Promise<LoadedHipAnatomy> {
  const entry = getOrCreateCacheEntry();
  entry.directCacheRetained = true;
  return entry.promise;
}

export function acquireHipAnatomy(): HipAnatomyAssetLease {
  const entry = getOrCreateCacheEntry();
  entry.consumers += 1;
  let released = false;
  return {
    promise: entry.promise,
    release() {
      if (released) return;
      released = true;
      entry.consumers = Math.max(0, entry.consumers - 1);
      if (entry.consumers > 0 || entry.directCacheRetained) return;
      if (cacheEntry === entry) cacheEntry = null;
      if (entry.resource === null) {
        entry.disposeWhenReady = true;
        return;
      }
      disposeLoadedHipAnatomy(entry.resource);
      entry.resource = null;
    },
  };
}

export function clearAnatomyAssetCacheForTests(): void {
  const entry = cacheEntry;
  cacheEntry = null;
  if (entry === null) return;
  if (entry.resource === null) {
    entry.disposeWhenReady = true;
    return;
  }
  disposeLoadedHipAnatomy(entry.resource);
  entry.resource = null;
}
