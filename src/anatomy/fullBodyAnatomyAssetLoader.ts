import {
  Group,
  LoadingManager,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from "three";
import {
  FULL_BODY_COMPLEMENT_GROUPS,
  JOINT_PIVOT_IDS,
  type AnatomySegmentId,
  type FullBodyAnatomyAssetLease,
  type FullBodyComplementGroup,
  type JointPivotDefinition,
  type JointPivotId,
  type LoadedFullBodyComplement,
} from "./fullBodyAnatomyTypes";
import {
  ANATOMY_ASSETS,
  FULL_BODY_COMPLEMENT_ASSET_ID,
} from "../content/assets/anatomyAssets";

interface CacheEntry {
  consumers: number;
  disposeWhenReady: boolean;
  promise: Promise<LoadedFullBodyComplement>;
  resource: LoadedFullBodyComplement | null;
}

const asset = ANATOMY_ASSETS[FULL_BODY_COMPLEMENT_ASSET_ID];
const TRANSFORM_EPSILON = 1e-9;
const BASIS_EPSILON = 1e-6;
const PIVOT_SEGMENTS: Readonly<
  Record<JointPivotId, readonly [AnatomySegmentId, AnatomySegmentId]>
> = Object.freeze({
  "left-shoulder": ["torso", "left-upper-arm"],
  "right-shoulder": ["torso", "right-upper-arm"],
  "left-elbow": ["left-upper-arm", "left-forearm"],
  "right-elbow": ["right-upper-arm", "right-forearm"],
  "left-wrist": ["left-forearm", "left-hand"],
  "right-wrist": ["right-forearm", "right-hand"],
  "left-hip": ["pelvis", "left-leg"],
  "right-hip": ["pelvis", "right-leg"],
});
let cacheEntry: CacheEntry | null = null;

function isFiniteTriplet(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (coordinate) =>
        typeof coordinate === "number" && Number.isFinite(coordinate),
    )
  );
}

function hasExactOrderedValues<T extends string>(
  value: unknown,
  expected: readonly T[],
): value is T[] {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function findMetadataRoot(scene: Group): Object3D {
  const matches: Object3D[] = [];
  scene.traverse((object) => {
    if (object.userData.orthoFluoro !== undefined) matches.push(object);
  });
  if (matches.length !== 1) {
    throw new Error(
      `Full-body complement must contain exactly one OrthoFluoro metadata root; found ${matches.length}.`,
    );
  }
  return matches[0];
}

function validateIdentityTransform(label: string, object: Object3D): void {
  const componentsAreIdentity =
    object.position.lengthSq() <= TRANSFORM_EPSILON * TRANSFORM_EPSILON &&
    Math.abs(object.quaternion.x) <= TRANSFORM_EPSILON &&
    Math.abs(object.quaternion.y) <= TRANSFORM_EPSILON &&
    Math.abs(object.quaternion.z) <= TRANSFORM_EPSILON &&
    Math.abs(object.quaternion.w - 1) <= TRANSFORM_EPSILON &&
    Math.abs(object.scale.x - 1) <= TRANSFORM_EPSILON &&
    Math.abs(object.scale.y - 1) <= TRANSFORM_EPSILON &&
    Math.abs(object.scale.z - 1) <= TRANSFORM_EPSILON;
  const matrixIsIdentity =
    object.matrixAutoUpdate ||
    object.matrix.elements.every(
      (value, index) =>
        Math.abs(value - (index % 5 === 0 ? 1 : 0)) <= TRANSFORM_EPSILON,
    );
  if (!componentsAreIdentity || !matrixIsIdentity) {
    throw new Error(
      `Full-body complement ${label} must have an identity transform in the declared coordinate frame.`,
    );
  }
}

function normalizeSemanticGroup(object: Object3D): Group {
  if (object instanceof Group) return object;
  const parent = object.parent;
  if (parent === null) {
    throw new Error(`Full-body complement group ${object.name} has no parent.`);
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

function validateSemanticGroups(
  scene: Group,
  metadataRoot: Object3D,
): Map<FullBodyComplementGroup, Group> {
  const semanticObjects: Object3D[] = [];
  scene.traverse((object) => {
    if (
      typeof object.userData.anatomyGroup === "string" &&
      !(object instanceof Mesh)
    ) {
      semanticObjects.push(object);
    }
  });
  const names = new Set<FullBodyComplementGroup>();
  semanticObjects.forEach((object) => {
    const name = object.userData.anatomyGroup as string;
    if (!FULL_BODY_COMPLEMENT_GROUPS.includes(name as FullBodyComplementGroup)) {
      throw new Error(`Full-body complement contains unknown group ${name}.`);
    }
    const semanticName = name as FullBodyComplementGroup;
    if (names.has(semanticName)) {
      throw new Error(`Full-body complement contains duplicate group ${name}.`);
    }
    names.add(semanticName);
  });
  FULL_BODY_COMPLEMENT_GROUPS.forEach((name) => {
    if (!names.has(name)) {
      throw new Error(`Full-body complement is missing semantic group ${name}.`);
    }
  });
  const directSemanticObjects = metadataRoot.children.filter(
    (object) =>
      typeof object.userData.anatomyGroup === "string" &&
      !(object instanceof Mesh),
  );
  if (
    semanticObjects.length !== FULL_BODY_COMPLEMENT_GROUPS.length ||
    directSemanticObjects.length !== FULL_BODY_COMPLEMENT_GROUPS.length ||
    directSemanticObjects.some(
      (object, index) =>
        object.userData.anatomyGroup !== FULL_BODY_COMPLEMENT_GROUPS[index],
    )
  ) {
    throw new Error(
      "Full-body complement groups must be direct children of the metadata root in declared order.",
    );
  }
  const groups = new Map<FullBodyComplementGroup, Group>();
  directSemanticObjects.forEach((object) => {
    const semanticName = object.userData
      .anatomyGroup as FullBodyComplementGroup;
    const group = normalizeSemanticGroup(object);
    validateIdentityTransform(`group ${semanticName}`, group);
    let meshCount = 0;
    group.traverse((descendant) => {
      if (descendant instanceof Mesh) meshCount += 1;
    });
    if (meshCount === 0) {
      throw new Error(
        `Full-body complement group ${semanticName} contains no meshes.`,
      );
    }
    groups.set(semanticName, group);
  });
  return groups;
}

function dot3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function validateBasis(
  id: JointPivotId,
  value: unknown,
): JointPivotDefinition["localBasis"] {
  if (value === null || typeof value !== "object") {
    throw new Error(`Full-body complement ${id} basis is invalid.`);
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isFiniteTriplet(candidate.x) ||
    !isFiniteTriplet(candidate.y) ||
    !isFiniteTriplet(candidate.z)
  ) {
    throw new Error(`Full-body complement ${id} basis is invalid.`);
  }
  const x = candidate.x;
  const y = candidate.y;
  const z = candidate.z;
  const unit = (axis: readonly [number, number, number]) =>
    Math.abs(dot3(axis, axis) - 1) <= BASIS_EPSILON;
  const orthogonal =
    Math.abs(dot3(x, y)) <= BASIS_EPSILON &&
    Math.abs(dot3(x, z)) <= BASIS_EPSILON &&
    Math.abs(dot3(y, z)) <= BASIS_EPSILON;
  if (!unit(x) || !unit(y) || !unit(z) || !orthogonal) {
    throw new Error(
      `Full-body complement ${id} basis must have finite, unit, orthogonal axes.`,
    );
  }
  if (dot3(cross3(x, y), z) < 1 - BASIS_EPSILON) {
    throw new Error(`Full-body complement ${id} basis must be right-handed.`);
  }
  return Object.freeze({
    x: Object.freeze([...x]) as [number, number, number],
    y: Object.freeze([...y]) as [number, number, number],
    z: Object.freeze([...z]) as [number, number, number],
  });
}

function validateJointPivots(
  value: unknown,
): Map<JointPivotId, JointPivotDefinition> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Full-body complement joint pivots are missing.");
  }
  const source = value as Record<string, unknown>;
  if (!hasExactOrderedValues(Object.keys(source).sort(), [...JOINT_PIVOT_IDS].sort())) {
    const missing = JOINT_PIVOT_IDS.find((id) => !(id in source));
    throw new Error(
      missing
        ? `Full-body complement is missing joint pivot ${missing}.`
        : "Full-body complement must contain exactly eight joint pivots.",
    );
  }
  const pivots = new Map<JointPivotId, JointPivotDefinition>();
  JOINT_PIVOT_IDS.forEach((id) => {
    const raw = source[id];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Full-body complement ${id} pivot is invalid.`);
    }
    const candidate = raw as Record<string, unknown>;
    const [parentSegment, childSegment] = PIVOT_SEGMENTS[id];
    if (
      candidate.id !== id ||
      candidate.parentSegment !== parentSegment ||
      candidate.childSegment !== childSegment
    ) {
      throw new Error(
        `Full-body complement ${id} parent and child segments are invalid.`,
      );
    }
    if (!isFiniteTriplet(candidate.positionMm)) {
      throw new Error(`Full-body complement ${id} pivot position is invalid.`);
    }
    if (
      typeof candidate.derivation !== "string" ||
      candidate.derivation.trim().length === 0
    ) {
      throw new Error(`Full-body complement ${id} derivation is missing.`);
    }
    pivots.set(
      id,
      Object.freeze({
        childSegment,
        derivation: candidate.derivation,
        localBasis: validateBasis(id, candidate.localBasis),
        parentSegment,
        positionMm: Object.freeze([...candidate.positionMm]) as [
          number,
          number,
          number,
        ],
      }),
    );
  });
  return pivots;
}

function disposeMaterial(material: Material): void {
  Object.values(material).forEach((value) => {
    if (value instanceof Texture) value.dispose();
  });
  material.dispose();
}

export function disposeLoadedFullBodyAnatomy(
  resource: LoadedFullBodyComplement,
): void {
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
  disposeLoadedFullBodyAnatomy({
    groups: new Map(),
    jointPivots: new Map(),
    scene,
  });
}

function prepareLoadedScene(scene: Group): LoadedFullBodyComplement {
  try {
    const metadataRoot = findMetadataRoot(scene);
    validateIdentityTransform("metadata root", metadataRoot);
    const metadata = metadataRoot.userData.orthoFluoro as Record<
      string,
      unknown
    >;
    const axes = metadata.axes as Record<string, unknown> | undefined;
    if (
      metadata.artifact !== FULL_BODY_COMPLEMENT_ASSET_ID ||
      metadata.units !== "millimetres" ||
      axes?.x !== "patient-left" ||
      axes?.y !== "anterior" ||
      axes?.z !== "headward" ||
      metadata.projectionEligible !== true
    ) {
      throw new Error(
        "Full-body complement metadata does not match the active asset and coordinate frame.",
      );
    }
    if (!hasExactOrderedValues(metadata.groups, FULL_BODY_COMPLEMENT_GROUPS)) {
      throw new Error(
        "Full-body complement metadata does not match the declared groups.",
      );
    }
    const groups = validateSemanticGroups(scene, metadataRoot);
    const jointPivots = validateJointPivots(metadata.jointPivots);
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
    return { groups, jointPivots, scene };
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

async function loadFreshFullBodyAnatomy(): Promise<LoadedFullBodyComplement> {
  const [{ DRACOLoader }, { GLTFLoader }] = await Promise.all([
    import("three/examples/jsm/loaders/DRACOLoader.js"),
    import("three/examples/jsm/loaders/GLTFLoader.js"),
  ]);
  const manager = createLocalLoadingManager();
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath(asset.dracoDecoderPath);
  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setDRACOLoader(dracoLoader);
  try {
    const gltf = await gltfLoader.loadAsync(asset.filePath);
    if (!(gltf.scene instanceof Group)) {
      throw new Error("Full-body complement GLB did not contain a group scene.");
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
    disposeWhenReady: false,
    promise: Promise.resolve(null as never),
    resource: null,
  };
  entry.promise = loadFreshFullBodyAnatomy()
    .then((resource) => {
      entry.resource = resource;
      if (entry.disposeWhenReady) {
        disposeLoadedFullBodyAnatomy(resource);
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

export function acquireFullBodyAnatomy(): FullBodyAnatomyAssetLease {
  const entry = getOrCreateCacheEntry();
  entry.consumers += 1;
  let released = false;
  return {
    promise: entry.promise,
    release() {
      if (released) return;
      released = true;
      entry.consumers = Math.max(0, entry.consumers - 1);
      if (entry.consumers > 0) return;
      if (cacheEntry === entry) cacheEntry = null;
      if (entry.resource === null) {
        entry.disposeWhenReady = true;
        return;
      }
      disposeLoadedFullBodyAnatomy(entry.resource);
      entry.resource = null;
    },
  };
}

export function clearFullBodyAnatomyAssetCacheForTests(): void {
  const entry = cacheEntry;
  cacheEntry = null;
  if (entry === null) return;
  if (entry.resource === null) {
    entry.disposeWhenReady = true;
    return;
  }
  disposeLoadedFullBodyAnatomy(entry.resource);
  entry.resource = null;
}
