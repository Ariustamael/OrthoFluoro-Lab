import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import type { CArmLocalGeometry } from "./cArmRigGeometry";
import type { CArmRigPreset, Vec3 } from "./geometryTypes";

export type Ring4 = readonly [number, number, number, number];
export type Triangle3 = readonly [number, number, number];

export interface IndexedMeshTopology {
  readonly positions: readonly Vec3[];
  readonly triangles: readonly Triangle3[];
}

export interface IntegratedRigTopology extends IndexedMeshTopology {
  /** Exact circular main-band samples, including source and taper start. */
  readonly centrelineSamples: readonly Vec3[];
  readonly mainArcRings: readonly Ring4[];
  readonly taperRings: readonly Ring4[];
  readonly mainArcEndRing: Ring4;
  readonly taperStartRing: Ring4;
  readonly taperEndRing: Ring4;
  readonly backingAttachmentProfile: Ring4;
}

export interface IntegratedRigMesh extends IntegratedRigTopology {
  readonly geometry: BufferGeometry;
}

export function buildArcHighlightGeometry(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  segments = 48,
): BufferGeometry {
  if (!Number.isInteger(segments) || segments < 8) {
    throw new RangeError(
      "C-arm highlight segments must be an integer of at least 8",
    );
  }
  const taperStart =
    local.arcEndRadians + (preset.taperSweepDegrees * Math.PI) / 180;
  const radius = local.arcRadius + preset.arcRadialThickness / 2;
  const z = preset.arcDepth / 2 + 0.25;
  const points = Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const theta =
      local.arcStartRadians + (taperStart - local.arcStartRadians) * t;
    return new Vector3(radius * Math.cos(theta), radius * Math.sin(theta), z);
  });
  const geometry = new BufferGeometry();
  geometry.setFromPoints(points);
  return geometry;
}

const EPSILON = 1e-9;

const tuple = (x: number, y: number, z: number): Vec3 =>
  Object.freeze([x, y, z]) as Vec3;

const ringTuple = (a: number, b: number, c: number, d: number): Ring4 =>
  Object.freeze([a, b, c, d]) as Ring4;

const triangleTuple = (a: number, b: number, c: number): Triangle3 =>
  Object.freeze([a, b, c]) as Triangle3;

function finitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
}

function validateInputs(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  radialSegments: number,
): void {
  if (!Number.isInteger(radialSegments) || radialSegments < 8) {
    throw new RangeError(
      "C-arm mesh segments must be an integer of at least 8",
    );
  }

  finitePositive("Source-detector distance", preset.sourceDetectorDistance);
  finitePositive("Detector width", preset.detectorWidth);
  finitePositive("Detector height", preset.detectorHeight);
  finitePositive("Detector backing thickness", preset.detectorBackingThickness);
  finitePositive("Arc radial thickness", preset.arcRadialThickness);
  finitePositive("Arc depth", preset.arcDepth);
  finitePositive("Tongue radial thickness", preset.tongueRadialThickness);
  finitePositive("Taper sweep", preset.taperSweepDegrees);
  finitePositive("Arc radius", local.arcRadius);

  if (
    Math.abs(preset.tongueRadialThickness - preset.detectorBackingThickness) >
    EPSILON
  ) {
    throw new RangeError(
      "Tongue and detector backing thickness must match at the attachment portal",
    );
  }
  if (preset.detectorBackingThickness > preset.detectorHeight) {
    throw new RangeError(
      "Detector backing portal must fit within detector height",
    );
  }

  const localValues = [
    ...local.source,
    ...local.detectorCenter,
    ...local.attachmentPoint,
    local.arcStartRadians,
    local.arcEndRadians,
    local.detectorDistance,
  ];
  if (localValues.some((value) => !Number.isFinite(value))) {
    throw new RangeError("C-arm local geometry must be finite");
  }
  const localSourceDetectorDistance = length(
    subtractVec(local.detectorCenter, local.source),
  );
  if (
    Math.abs(localSourceDetectorDistance - preset.sourceDetectorDistance) >
    EPSILON
  ) {
    throw new RangeError(
      "C-arm local geometry and preset source-detector distance must agree",
    );
  }

  const totalSweep = local.arcStartRadians - local.arcEndRadians;
  const taperSweep = (preset.taperSweepDegrees * Math.PI) / 180;
  if (totalSweep <= 0 || taperSweep >= totalSweep) {
    throw new RangeError(
      "Taper sweep must be smaller than the clockwise arc sweep",
    );
  }

  const expectedAttachment: Vec3 = [
    -preset.detectorWidth / 2,
    local.detectorDistance,
    0,
  ];
  if (
    local.attachmentPoint.some(
      (coordinate, axis) =>
        Math.abs(coordinate - expectedAttachment[axis]) > EPSILON,
    )
  ) {
    throw new RangeError(
      "C-arm attachment point does not match detector geometry",
    );
  }
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec(value: Vec3, scale: number): Vec3 {
  return [value[0] * scale, value[1] * scale, value[2] * scale];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: Vec3): Vec3 {
  const vectorLength = length(value);
  if (!Number.isFinite(vectorLength) || vectorLength <= EPSILON) {
    throw new RangeError("C-arm profile basis must be finite and non-zero");
  }
  return [
    value[0] / vectorLength,
    value[1] / vectorLength,
    value[2] / vectorLength,
  ];
}

function triangleArea(
  positions: readonly Vec3[],
  [a, b, c]: Triangle3,
): number {
  return (
    length(
      cross(
        subtractVec(positions[b], positions[a]),
        subtractVec(positions[c], positions[a]),
      ),
    ) / 2
  );
}

function signedVolume(topology: IndexedMeshTopology): number {
  return (
    topology.triangles.reduce((sum, [a, b, c]) => {
      return (
        sum +
        dot(
          topology.positions[a],
          cross(topology.positions[b], topology.positions[c]),
        )
      );
    }, 0) / 6
  );
}

function validateClosedTopology(topology: IndexedMeshTopology): void {
  const edgeUses = new Map<string, Array<readonly [number, number]>>();
  topology.positions.forEach((position) => {
    if (position.some((coordinate) => !Number.isFinite(coordinate))) {
      throw new Error("C-arm mesh contains a non-finite position");
    }
  });

  topology.triangles.forEach((triangle) => {
    triangle.forEach((index) => {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= topology.positions.length
      ) {
        throw new Error("C-arm mesh contains an out-of-range index");
      }
    });
    if (triangleArea(topology.positions, triangle) <= EPSILON) {
      throw new Error("C-arm mesh contains a zero-area triangle");
    }
    const [a, b, c] = triangle;
    [
      [a, b],
      [b, c],
      [c, a],
    ].forEach(([from, to]) => {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const uses = edgeUses.get(key) ?? [];
      uses.push([from, to]);
      edgeUses.set(key, uses);
    });
  });

  edgeUses.forEach((uses) => {
    if (
      uses.length !== 2 ||
      uses[0][0] !== uses[1][1] ||
      uses[0][1] !== uses[1][0]
    ) {
      throw new Error(
        "C-arm mesh is not a consistently oriented closed manifold",
      );
    }
  });
  if (!(signedVolume(topology) > EPSILON)) {
    throw new Error("C-arm mesh must have positive signed volume");
  }
}

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

function segmentDistanceSquared(
  firstStart: Vec3,
  firstEnd: Vec3,
  secondStart: Vec3,
  secondEnd: Vec3,
): number {
  const firstDirection = subtractVec(firstEnd, firstStart);
  const secondDirection = subtractVec(secondEnd, secondStart);
  const origins = subtractVec(firstStart, secondStart);
  const firstLengthSquared = dot(firstDirection, firstDirection);
  const secondLengthSquared = dot(secondDirection, secondDirection);
  const directionsDot = dot(firstDirection, secondDirection);
  const firstOriginDot = dot(firstDirection, origins);
  const secondOriginDot = dot(secondDirection, origins);
  const denominator =
    firstLengthSquared * secondLengthSquared - directionsDot * directionsDot;

  let firstParameter =
    denominator > EPSILON
      ? clampUnit(
          (directionsDot * secondOriginDot -
            secondLengthSquared * firstOriginDot) /
            denominator,
        )
      : 0;
  let secondParameter = clampUnit(
    (directionsDot * firstParameter + secondOriginDot) / secondLengthSquared,
  );
  firstParameter = clampUnit(
    (directionsDot * secondParameter - firstOriginDot) / firstLengthSquared,
  );
  secondParameter = clampUnit(
    (directionsDot * firstParameter + secondOriginDot) / secondLengthSquared,
  );
  const separation = subtractVec(
    addVec(firstStart, scaleVec(firstDirection, firstParameter)),
    addVec(secondStart, scaleVec(secondDirection, secondParameter)),
  );
  return dot(separation, separation);
}

export function areTaperProfilesDisjoint(
  positions: readonly Vec3[],
  taperRings: readonly Ring4[],
): boolean {
  const edges = (ring: Ring4): Array<readonly [number, number]> =>
    ring.map((index, edge) => [index, ring[(edge + 1) % 4]] as const);
  for (const ring of taperRings) {
    if (new Set(ring).size !== 4) return false;
    const ringEdges = edges(ring);
    if (
      ringEdges.some(
        ([start, end]) =>
          length(subtractVec(positions[end], positions[start])) <= EPSILON,
      )
    ) {
      return false;
    }
    for (const [firstEdge, secondEdge] of [
      [0, 2],
      [1, 3],
    ] as const) {
      const [a, b] = ringEdges[firstEdge];
      const [c, d] = ringEdges[secondEdge];
      if (
        segmentDistanceSquared(
          positions[a],
          positions[b],
          positions[c],
          positions[d],
        ) <=
        EPSILON * EPSILON
      ) {
        return false;
      }
    }
  }
  for (let first = 0; first < taperRings.length; first += 1) {
    for (let second = first + 2; second < taperRings.length; second += 1) {
      for (const [a, b] of edges(taperRings[first])) {
        for (const [c, d] of edges(taperRings[second])) {
          if (
            segmentDistanceSquared(
              positions[a],
              positions[b],
              positions[c],
              positions[d],
            ) <=
            EPSILON * EPSILON
          ) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

function geometryFromTopology(topology: IndexedMeshTopology): BufferGeometry {
  const geometry = new BufferGeometry();
  try {
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        topology.positions.flatMap((position) => position),
        3,
      ),
    );
    geometry.setIndex(topology.triangles.flatMap((triangle) => triangle));
    geometry.computeVertexNormals();
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const attributesAreFinite = [position, normal].every((attribute) =>
      Array.from(attribute.array).every(Number.isFinite),
    );
    if (!attributesAreFinite) {
      throw new RangeError(
        "C-arm mesh dimensions are not representable as finite Float32 attributes",
      );
    }
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

export function buildIntegratedRigTopology(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  radialSegments = 96,
): IntegratedRigTopology {
  validateInputs(local, preset, radialSegments);

  const positions: Vec3[] = [];
  const triangles: Triangle3[] = [];
  const pushPosition = (position: Vec3): number => {
    positions.push(tuple(position[0], position[1], position[2]));
    return positions.length - 1;
  };
  const pushTriangle = (a: number, b: number, c: number): void => {
    triangles.push(triangleTuple(a, b, c));
  };
  const pushRing = (
    center: Vec3,
    basis: Vec3,
    halfWidth: number,
    halfDepth: number,
  ): Ring4 => {
    const low = tuple(0, 0, -halfDepth);
    const high = tuple(0, 0, halfDepth);
    const width = scaleVec(basis, halfWidth);
    return ringTuple(
      pushPosition(addVec(subtractVec(center, width), low)),
      pushPosition(addVec(addVec(center, width), low)),
      pushPosition(addVec(addVec(center, width), high)),
      pushPosition(addVec(subtractVec(center, width), high)),
    );
  };
  const connectRings = (current: Ring4, next: Ring4): void => {
    for (let edge = 0; edge < 4; edge += 1) {
      const following = (edge + 1) % 4;
      pushTriangle(current[edge], current[following], next[following]);
      pushTriangle(current[edge], next[following], next[edge]);
    }
  };
  const pushQuad = (a: number, b: number, c: number, d: number): void => {
    pushTriangle(a, b, c);
    pushTriangle(a, c, d);
  };

  const taperSweep = (preset.taperSweepDegrees * Math.PI) / 180;
  const totalSweep = local.arcStartRadians - local.arcEndRadians;
  const taperStartRadians = local.arcEndRadians + taperSweep;
  const taperSegments = Math.max(
    2,
    Math.ceil((radialSegments * taperSweep) / totalSweep),
  );
  const mainSegments = radialSegments - taperSegments;
  if (mainSegments < 1) {
    throw new RangeError("C-arm mesh needs at least one main-band segment");
  }

  const centrelineSamples: Vec3[] = [];
  const mainArcRings: Ring4[] = [];
  for (let segment = 0; segment <= mainSegments; segment += 1) {
    const fraction = segment / mainSegments;
    const theta =
      local.arcStartRadians +
      (taperStartRadians - local.arcStartRadians) * fraction;
    const center =
      segment === 0
        ? local.source
        : tuple(
            local.arcRadius * Math.cos(theta),
            local.arcRadius * Math.sin(theta),
            0,
          );
    const basis = tuple(Math.cos(theta), Math.sin(theta), 0);
    centrelineSamples.push(center);
    mainArcRings.push(
      pushRing(
        center,
        basis,
        preset.arcRadialThickness / 2,
        preset.arcDepth / 2,
      ),
    );
  }

  const mainArcEndRing = mainArcRings.at(-1)!;
  const taperStartRing = mainArcEndRing;
  const taperRings: Ring4[] = [taperStartRing];
  const taperStartCenter = centrelineSamples.at(-1)!;
  const taperStartBasis = normalize([
    taperStartCenter[0] / local.arcRadius,
    taperStartCenter[1] / local.arcRadius,
    0,
  ]);
  const backingHalf = preset.detectorBackingThickness / 2;
  const portalCenter = tuple(
    -preset.detectorWidth / 2,
    local.detectorDistance + backingHalf,
    0,
  );

  for (let segment = 1; segment <= taperSegments; segment += 1) {
    const t = segment / taperSegments;
    const h = t * t * (3 - 2 * t);
    const isEnd = segment === taperSegments;
    const center = isEnd
      ? portalCenter
      : tuple(
          taperStartCenter[0] + (portalCenter[0] - taperStartCenter[0]) * h,
          taperStartCenter[1] + (portalCenter[1] - taperStartCenter[1]) * h,
          0,
        );
    const basis = isEnd
      ? tuple(0, 1, 0)
      : normalize([
          taperStartBasis[0] * (1 - h),
          taperStartBasis[1] * (1 - h) + h,
          0,
        ]);
    const halfWidth =
      preset.arcRadialThickness / 2 +
      (backingHalf - preset.arcRadialThickness / 2) * h;
    const halfDepth =
      preset.arcDepth / 2 + (backingHalf - preset.arcDepth / 2) * h;
    taperRings.push(pushRing(center, basis, halfWidth, halfDepth));
  }

  const allRings = [...mainArcRings, ...taperRings.slice(1)];
  for (let ringIndex = 0; ringIndex < allRings.length - 1; ringIndex += 1) {
    connectRings(allRings[ringIndex], allRings[ringIndex + 1]);
  }
  const sourceRing = mainArcRings[0];
  pushTriangle(sourceRing[0], sourceRing[2], sourceRing[1]);
  pushTriangle(sourceRing[0], sourceRing[3], sourceRing[2]);

  const taperEndRing = taperRings.at(-1)!;
  const backingAttachmentProfile = taperEndRing;
  const [portalFrontLow, portalBackLow, portalBackHigh, portalFrontHigh] =
    backingAttachmentProfile;
  const halfDetectorWidth = preset.detectorWidth / 2;
  const halfDetectorHeight = preset.detectorHeight / 2;
  const frontY = local.detectorDistance;
  const backY = frontY + preset.detectorBackingThickness;

  const leftFrontLow = pushPosition(
    tuple(-halfDetectorWidth, frontY, -halfDetectorHeight),
  );
  const leftBackLow = pushPosition(
    tuple(-halfDetectorWidth, backY, -halfDetectorHeight),
  );
  const leftBackHigh = pushPosition(
    tuple(-halfDetectorWidth, backY, halfDetectorHeight),
  );
  const leftFrontHigh = pushPosition(
    tuple(-halfDetectorWidth, frontY, halfDetectorHeight),
  );
  const rightFrontLow = pushPosition(
    tuple(halfDetectorWidth, frontY, -halfDetectorHeight),
  );
  const rightBackLow = pushPosition(
    tuple(halfDetectorWidth, backY, -halfDetectorHeight),
  );
  const rightBackHigh = pushPosition(
    tuple(halfDetectorWidth, backY, halfDetectorHeight),
  );
  const rightFrontHigh = pushPosition(
    tuple(halfDetectorWidth, frontY, halfDetectorHeight),
  );
  const frontCenter = pushPosition(tuple(0, frontY, 0));
  const backCenter = pushPosition(tuple(0, backY, 0));

  pushQuad(leftFrontLow, portalFrontLow, portalBackLow, leftBackLow);
  pushQuad(portalFrontHigh, leftFrontHigh, leftBackHigh, portalBackHigh);
  pushQuad(rightFrontLow, rightBackLow, rightBackHigh, rightFrontHigh);
  pushQuad(leftFrontLow, leftBackLow, rightBackLow, rightFrontLow);
  pushQuad(leftFrontHigh, rightFrontHigh, rightBackHigh, leftBackHigh);

  const frontBoundary = [
    leftFrontLow,
    rightFrontLow,
    rightFrontHigh,
    leftFrontHigh,
    portalFrontHigh,
    portalFrontLow,
  ];
  const backBoundary = [
    leftBackLow,
    portalBackLow,
    portalBackHigh,
    leftBackHigh,
    rightBackHigh,
    rightBackLow,
  ];
  for (let index = 0; index < frontBoundary.length; index += 1) {
    pushTriangle(
      frontCenter,
      frontBoundary[index],
      frontBoundary[(index + 1) % frontBoundary.length],
    );
    pushTriangle(
      backCenter,
      backBoundary[index],
      backBoundary[(index + 1) % backBoundary.length],
    );
  }

  const topology: IntegratedRigTopology = Object.freeze({
    positions: Object.freeze(positions),
    triangles: Object.freeze(triangles),
    centrelineSamples: Object.freeze(centrelineSamples),
    mainArcRings: Object.freeze(mainArcRings),
    taperRings: Object.freeze(taperRings),
    mainArcEndRing,
    taperStartRing,
    taperEndRing,
    backingAttachmentProfile,
  });
  if (!areTaperProfilesDisjoint(topology.positions, topology.taperRings)) {
    throw new Error(
      "C-arm taper profiles must be simple and disjoint from non-neighbours",
    );
  }
  validateClosedTopology(topology);
  return topology;
}

export function buildIntegratedRigMesh(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  radialSegments = 96,
): IntegratedRigMesh {
  const topology = buildIntegratedRigTopology(local, preset, radialSegments);
  return Object.freeze({
    ...topology,
    geometry: geometryFromTopology(topology),
  });
}

export function buildSquareBeamTopology(
  local: CArmLocalGeometry,
): IndexedMeshTopology {
  const topology: IndexedMeshTopology = Object.freeze({
    positions: Object.freeze([local.source, ...local.detectorCorners]),
    triangles: Object.freeze([
      triangleTuple(0, 1, 2),
      triangleTuple(0, 2, 3),
      triangleTuple(0, 3, 4),
      triangleTuple(0, 4, 1),
      triangleTuple(1, 3, 2),
      triangleTuple(1, 4, 3),
    ]),
  });
  validateClosedTopology(topology);
  return topology;
}

export function buildSquareBeamGeometry(
  local: CArmLocalGeometry,
): BufferGeometry {
  return geometryFromTopology(buildSquareBeamTopology(local));
}

export function rigShapeKey(preset: CArmRigPreset): string {
  return [
    preset.sourceDetectorDistance,
    preset.detectorWidth,
    preset.detectorHeight,
    preset.detectorBackingThickness,
    preset.arcRadialThickness,
    preset.arcDepth,
    preset.taperSweepDegrees,
    preset.tongueRadialThickness,
  ].join(":");
}

export function disposeCArmRigGeometries(
  ...geometries: readonly BufferGeometry[]
): void {
  new Set(geometries).forEach((geometry) => geometry.dispose());
}
