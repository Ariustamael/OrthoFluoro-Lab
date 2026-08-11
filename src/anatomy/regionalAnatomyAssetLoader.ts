import {
  Group,
  LoadingManager,
  Material,
  Mesh,
  Object3D,
  Texture,
  Vector3,
} from "three";
import type { AnatomySide } from "./anatomyTypes";
import {
  REGIONAL_ANATOMY_GROUPS,
  RegionalAnatomyAssetError,
  type LoadedRegionalAnatomy,
  type RegionalAnatomyAssetLease,
  type RegionalAnatomyGroup,
} from "./regionalAnatomyTypes";
import {
  ANATOMY_ASSETS,
  REGIONAL_HIP_ANATOMY_ASSET_ID,
} from "../content/assets/anatomyAssets";
import {
  parseRegionalBodyRegions,
  regionalRuntimeKey,
  type RegionalRuntimeAssignment,
} from "./regionalBodyRegions";

interface CacheEntry {
  consumers: number;
  disposeWhenReady: boolean;
  promise: Promise<LoadedRegionalAnatomy>;
  resource: LoadedRegionalAnatomy | null;
}

const asset = ANATOMY_ASSETS[REGIONAL_HIP_ANATOMY_ASSET_ID];
const PIVOT_EPSILON_MM = 1e-6;
const TRANSFORM_EPSILON = 1e-9;
const EXPECTED_BODY_REGION_MAP_CHECKSUM =
  "B55F721E8F166258F700960D905529813D879525FDD6699F5C5B948C8B521E3F";
let cacheEntry: CacheEntry | null = null;

function typedError(
  message: string,
  cause?: unknown,
): RegionalAnatomyAssetError {
  return new RegionalAnatomyAssetError(message, { cause });
}

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

function hasDeclaredRegionalGroups(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === REGIONAL_ANATOMY_GROUPS.length &&
    value.every((group, index) => group === REGIONAL_ANATOMY_GROUPS[index])
  );
}

function validatePivot(
  side: AnatomySide,
  value: unknown,
): [number, number, number] {
  if (!isFiniteTriplet(value)) {
    throw typedError(`Regional anatomy is missing a valid ${side} hip pivot.`);
  }
  if (
    Math.abs(value[1]) > PIVOT_EPSILON_MM ||
    Math.abs(value[2]) > PIVOT_EPSILON_MM ||
    (side === "left" ? value[0] <= 0 : value[0] >= 0)
  ) {
    throw typedError(
      `Regional anatomy ${side} pivot is not a centred hip pivot in application coordinates.`,
    );
  }
  return value;
}

function findMetadataRoot(scene: Group): Object3D {
  const matches: Object3D[] = [];
  scene.traverse((object) => {
    if (object.userData.orthoFluoro !== undefined) matches.push(object);
  });
  if (matches.length !== 1) {
    throw typedError(
      `Regional anatomy must contain exactly one OrthoFluoro metadata root; found ${matches.length}.`,
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
    throw typedError(
      `Regional anatomy ${label} must have an identity transform in the declared coordinate frame.`,
    );
  }
}

function normalizeSemanticGroup(object: Object3D): Group {
  if (object instanceof Group) return object;
  const parent = object.parent;
  if (parent === null) {
    throw typedError(`Regional anatomy group ${object.name} has no parent.`);
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
): Record<RegionalAnatomyGroup, Group> {
  const groups = new Map<RegionalAnatomyGroup, Group>();
  const semanticObjects: Object3D[] = [];
  scene.traverse((object) => {
    const semanticName = object.userData.anatomyGroup;
    if (typeof semanticName === "string" && !(object instanceof Mesh)) {
      semanticObjects.push(object);
    }
  });
  semanticObjects.forEach((object) => {
    const name = object.userData.anatomyGroup as string;
    if (!REGIONAL_ANATOMY_GROUPS.includes(name as RegionalAnatomyGroup)) {
      throw typedError(`Regional anatomy contains unknown group ${name}.`);
    }
    const semanticName = name as RegionalAnatomyGroup;
    if (groups.has(semanticName)) {
      throw typedError(`Regional anatomy contains duplicate group ${name}.`);
    }
    let meshCount = 0;
    const group = normalizeSemanticGroup(object);
    validateIdentityTransform(`group ${name}`, group);
    group.traverse((descendant) => {
      if (descendant instanceof Mesh) meshCount += 1;
    });
    if (meshCount === 0) {
      throw typedError(`Regional anatomy group ${name} contains no meshes.`);
    }
    groups.set(semanticName, group);
  });
  REGIONAL_ANATOMY_GROUPS.forEach((name) => {
    if (!groups.has(name)) {
      throw typedError(`Regional anatomy is missing semantic group ${name}.`);
    }
  });
  return Object.freeze(
    Object.fromEntries(groups) as Record<RegionalAnatomyGroup, Group>,
  );
}

function disposeMaterial(material: Material): void {
  Object.values(material).forEach((value) => {
    if (value instanceof Texture) value.dispose();
  });
  material.dispose();
}

export function disposeLoadedRegionalAnatomy(
  resource: LoadedRegionalAnatomy,
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
  disposeLoadedRegionalAnatomy({
    assignments: new Map<string, RegionalRuntimeAssignment>(),
    groups: {} as LoadedRegionalAnatomy["groups"],
    hipPivots: { left: new Vector3(), right: new Vector3() },
    scene,
  });
}

function validateRuntimeAssignments(
  groups: Readonly<Record<RegionalAnatomyGroup, Group>>,
  assignments: ReadonlyMap<string, RegionalRuntimeAssignment>,
): void {
  const runtimeKeys: string[] = [];
  Object.values(groups).forEach((group) => {
    group.traverse((object) => {
      if (object instanceof Mesh) runtimeKeys.push(regionalRuntimeKey(object));
    });
  });
  const uniqueRuntimeKeys = new Set(runtimeKeys);
  if (
    runtimeKeys.length !== 817 ||
    uniqueRuntimeKeys.size !== 817 ||
    assignments.size !== 817 ||
    runtimeKeys.some((runtimeKey) => !assignments.has(runtimeKey))
  ) {
    throw typedError(
      "Regional anatomy body-region map must cover all 817 unique runtime meshes.",
    );
  }
}

function prepareLoadedScene(
  scene: Group,
  assignments: ReadonlyMap<string, RegionalRuntimeAssignment>,
): LoadedRegionalAnatomy {
  try {
    const metadataRoot = findMetadataRoot(scene);
    validateIdentityTransform("metadata root", metadataRoot);
    const metadata = metadataRoot.userData.orthoFluoro as Record<
      string,
      unknown
    >;
    const axes = metadata.axes as Record<string, unknown> | undefined;
    if (
      metadata.artifact !== REGIONAL_HIP_ANATOMY_ASSET_ID ||
      metadata.units !== "millimetres" ||
      axes?.x !== "patient-left" ||
      axes?.y !== "anterior" ||
      axes?.z !== "headward" ||
      !hasDeclaredRegionalGroups(metadata.groups) ||
      metadata.projectionEligible !== false
    ) {
      throw typedError(
        "Regional anatomy metadata does not match the active asset, declared groups, and coordinate frame.",
      );
    }
    const pivots = metadata.hipPivots as
      Record<AnatomySide, unknown> | undefined;
    const leftPivot = validatePivot("left", pivots?.left);
    const rightPivot = validatePivot("right", pivots?.right);
    if (Math.abs(leftPivot[0] + rightPivot[0]) > PIVOT_EPSILON_MM) {
      throw typedError(
        "Regional anatomy centred hip pivots are not symmetric.",
      );
    }
    const groups = validateSemanticGroups(scene);
    validateRuntimeAssignments(groups, assignments);
    return {
      assignments,
      groups,
      hipPivots: {
        left: new Vector3(...leftPivot),
        right: new Vector3(...rightPivot),
      },
      scene,
    };
  } catch (error) {
    disposeUnvalidatedScene(scene);
    throw error instanceof RegionalAnatomyAssetError
      ? error
      : typedError("Regional anatomy validation failed.", error);
  }
}

export function validateRegionalBodyRegionMapPath(
  path: string,
  baseUrl = typeof globalThis.location === "undefined"
    ? "http://localhost/"
    : globalThis.location.href,
): string {
  let resolved: URL;
  try {
    resolved = new URL(path, baseUrl);
  } catch (error) {
    throw typedError(
      `External anatomy dependency is not permitted: ${path}`,
      error,
    );
  }
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    resolved.origin !== new URL(baseUrl).origin
  ) {
    throw typedError(`External anatomy dependency is not permitted: ${path}`);
  }
  return path;
}

function bodyRegionMapPath(): string {
  if (asset.bodyRegionMapChecksum !== EXPECTED_BODY_REGION_MAP_CHECKSUM) {
    throw typedError(
      "Regional anatomy body-region map manifest checksum is not the validated checksum.",
    );
  }
  return validateRegionalBodyRegionMapPath(asset.bodyRegionMapPath);
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function loadBodyRegionAssignments(
  path: string,
): Promise<ReadonlyMap<string, RegionalRuntimeAssignment>> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch (error) {
    throw typedError(
      "Regional anatomy body-region sidecar could not be fetched.",
      error,
    );
  }
  if (!response.ok) {
    throw typedError(
      `Regional anatomy body-region sidecar request failed with status ${response.status}.`,
    );
  }
  const bytes = await response.arrayBuffer();
  let actualChecksum: string;
  try {
    actualChecksum = await sha256Hex(bytes);
  } catch (error) {
    throw typedError(
      "Regional anatomy body-region sidecar checksum could not be verified.",
      error,
    );
  }
  if (actualChecksum !== EXPECTED_BODY_REGION_MAP_CHECKSUM) {
    throw typedError(
      `Regional anatomy body-region sidecar checksum mismatch: expected ${EXPECTED_BODY_REGION_MAP_CHECKSUM}, received ${actualChecksum}.`,
    );
  }
  try {
    return parseRegionalBodyRegions(new TextDecoder().decode(bytes))
      .assignments;
  } catch (error) {
    throw typedError(
      "Regional anatomy body-region sidecar could not be parsed.",
      error,
    );
  }
}

function createLocalLoadingManager(): LoadingManager {
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url === asset.filePath || url.startsWith(asset.dracoDecoderPath)) {
      return url;
    }
    throw typedError(`External anatomy dependency is not permitted: ${url}`);
  });
  return manager;
}

async function loadFreshRegionalAnatomy(): Promise<LoadedRegionalAnatomy> {
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
    const mapPath = bodyRegionMapPath();
    const [gltfResult, assignmentsResult] = await Promise.allSettled([
      gltfLoader.loadAsync(asset.filePath),
      loadBodyRegionAssignments(mapPath),
    ]);
    if (gltfResult.status === "rejected") throw gltfResult.reason;
    const gltf = gltfResult.value;
    if (!(gltf.scene instanceof Group)) {
      throw typedError("Regional anatomy GLB did not contain a group scene.");
    }
    if (assignmentsResult.status === "rejected") {
      disposeUnvalidatedScene(gltf.scene);
      throw assignmentsResult.reason;
    }
    return prepareLoadedScene(gltf.scene, assignmentsResult.value);
  } catch (error) {
    throw error instanceof RegionalAnatomyAssetError
      ? error
      : typedError("Regional anatomy GLB could not be loaded.", error);
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
  entry.promise = loadFreshRegionalAnatomy()
    .then((resource) => {
      entry.resource = resource;
      if (entry.disposeWhenReady) {
        disposeLoadedRegionalAnatomy(resource);
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

export function acquireRegionalAnatomy(): RegionalAnatomyAssetLease {
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
      disposeLoadedRegionalAnatomy(entry.resource);
      entry.resource = null;
    },
  };
}

export function clearRegionalAnatomyAssetCacheForTests(): void {
  const entry = cacheEntry;
  cacheEntry = null;
  if (entry === null) return;
  if (entry.resource === null) {
    entry.disposeWhenReady = true;
    return;
  }
  disposeLoadedRegionalAnatomy(entry.resource);
  entry.resource = null;
}
