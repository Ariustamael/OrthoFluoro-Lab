import type { Object3D } from "three";

export const REGIONAL_BODY_REGIONS = Object.freeze([
  "torso",
  "pelvis",
  "left-leg",
  "right-leg",
] as const);

export type RegionalBodyRegion = (typeof REGIONAL_BODY_REGIONS)[number];

export interface RegionalRuntimeAssignment {
  readonly runtimeKey: string;
  readonly bodyRegion: RegionalBodyRegion;
  readonly suppressedDuplicateBone: boolean;
}

export interface RegionalBodyRegionLookup {
  readonly schemaVersion: 1;
  readonly assignments: ReadonlyMap<string, RegionalRuntimeAssignment>;
}

const EXPECTED_RUNTIME_MESH_COUNT = 817;
const EXPECTED_SUPPRESSED_RUNTIME_KEYS = Object.freeze([
  "Bones/Lumbar vertebra (L1)|midline",
  "Bones/Lumbar vertebra (L2)|midline",
  "Bones/Lumbar vertebra (L3)|midline",
  "Bones/Lumbar vertebra (L4)|midline",
  "Bones/Lumbar vertebra (L5)|midline",
  "Bones/Thoracic vertebra (T12)|midline",
]);
const EXPECTED_SUPPRESSED_RUNTIME_KEY_SET = new Set(
  EXPECTED_SUPPRESSED_RUNTIME_KEYS,
);

class ImmutableAssignmentMap implements ReadonlyMap<
  string,
  RegionalRuntimeAssignment
> {
  readonly #assignments: Map<string, RegionalRuntimeAssignment>;

  constructor(entries: readonly RegionalRuntimeAssignment[]) {
    this.#assignments = new Map(
      entries.map((entry) => [entry.runtimeKey, entry]),
    );
    Object.freeze(this);
  }

  get size(): number {
    return this.#assignments.size;
  }

  entries(): MapIterator<[string, RegionalRuntimeAssignment]> {
    return this.#assignments.entries();
  }

  forEach(
    callbackfn: (
      value: RegionalRuntimeAssignment,
      key: string,
      map: ReadonlyMap<string, RegionalRuntimeAssignment>,
    ) => void,
    thisArg?: unknown,
  ): void {
    this.#assignments.forEach((value, key) => {
      callbackfn.call(thisArg, value, key, this);
    });
  }

  get(key: string): RegionalRuntimeAssignment | undefined {
    return this.#assignments.get(key);
  }

  has(key: string): boolean {
    return this.#assignments.has(key);
  }

  keys(): MapIterator<string> {
    return this.#assignments.keys();
  }

  values(): MapIterator<RegionalRuntimeAssignment> {
    return this.#assignments.values();
  }

  [Symbol.iterator](): MapIterator<[string, RegionalRuntimeAssignment]> {
    return this.#assignments[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return "RegionalBodyRegionAssignments";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAssignment(value: unknown): RegionalRuntimeAssignment {
  if (!isRecord(value)) {
    throw new Error("Regional body-region entry must be an object.");
  }
  const { bodyRegion, runtimeKey, suppressedDuplicateBone } = value;
  if (typeof runtimeKey !== "string" || runtimeKey.length === 0) {
    throw new Error("Regional body-region entry has an invalid runtime key.");
  }
  if (
    typeof bodyRegion !== "string" ||
    !REGIONAL_BODY_REGIONS.includes(bodyRegion as RegionalBodyRegion)
  ) {
    throw new Error(
      `Regional body-region entry has unknown region ${bodyRegion}.`,
    );
  }
  if (typeof suppressedDuplicateBone !== "boolean") {
    throw new Error(
      `Regional body-region entry ${runtimeKey} has an invalid suppression flag.`,
    );
  }
  return Object.freeze({
    runtimeKey,
    bodyRegion: bodyRegion as RegionalBodyRegion,
    suppressedDuplicateBone,
  });
}

export function parseRegionalBodyRegions(
  text: string,
): RegionalBodyRegionLookup {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error("Regional body-region sidecar is invalid JSON.", {
      cause: error,
    });
  }
  if (!isRecord(payload) || payload.schemaVersion !== 1) {
    throw new Error("Regional body-region sidecar must use schema version 1.");
  }
  if (
    !Array.isArray(payload.entries) ||
    payload.entries.length !== EXPECTED_RUNTIME_MESH_COUNT
  ) {
    throw new Error(
      `Regional body-region sidecar must contain ${EXPECTED_RUNTIME_MESH_COUNT} assignments.`,
    );
  }
  const entries = payload.entries.map(parseAssignment);
  const runtimeKeys = new Set(entries.map((entry) => entry.runtimeKey));
  if (runtimeKeys.size !== EXPECTED_RUNTIME_MESH_COUNT) {
    throw new Error(
      "Regional body-region sidecar contains duplicate runtime keys.",
    );
  }
  const suppressedKeys = entries
    .filter((entry) => entry.suppressedDuplicateBone)
    .map((entry) => entry.runtimeKey);
  if (
    suppressedKeys.length !== EXPECTED_SUPPRESSED_RUNTIME_KEYS.length ||
    suppressedKeys.some(
      (runtimeKey) => !EXPECTED_SUPPRESSED_RUNTIME_KEY_SET.has(runtimeKey),
    )
  ) {
    throw new Error(
      "Regional body-region sidecar must suppress exactly the six declared vertebral duplicates.",
    );
  }
  return Object.freeze({
    assignments: new ImmutableAssignmentMap(entries),
    schemaVersion: 1 as const,
  });
}

export function regionalRuntimeKey(object: Object3D): string {
  return (
    String(object.userData.sourceKey) +
    "|" +
    String(object.userData.anatomySide)
  );
}
