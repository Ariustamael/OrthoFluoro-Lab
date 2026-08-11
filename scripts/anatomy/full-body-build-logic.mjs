import { fitSphere, pointBounds } from "./anatomy-build-logic.mjs";

export const COMPLEMENT_GROUPS = Object.freeze([
  "head-neck",
  "torso",
  "left-upper-arm",
  "left-forearm",
  "left-hand",
  "right-upper-arm",
  "right-forearm",
  "right-hand",
]);

const SIDES = Object.freeze(["right", "left"]);
const SOURCE_SUFFIX = Object.freeze({ right: ".r", left: ".l" });

const PAIRED_DETAILED_REPLACEMENTS = Object.freeze([
  "Calcaneus",
  "Cuboid bone",
  "Distal phalanx of fifth finger of foot",
  "Distal phalanx of first finger of foot",
  "Distal phalanx of fourth finger of foot",
  "Distal phalanx of second finger of foot",
  "Distal phalanx of third finger of foot",
  "Femur",
  "Fibula",
  "Fifth metatarsal bone",
  "First metatarsal bone",
  "Fourth metatarsal bone",
  "Hip bone",
  "Intermediate cuneiform bone",
  "Lateral cuneiform bone",
  "Medial cuneiform bone",
  "Middle phalanx of fifth finger of foot",
  "Middle phalanx of fourth finger of foot",
  "Middle phalanx of second finger of foot",
  "Middle phalanx of third finger of foot",
  "Navicular bone",
  "Patella",
  "Proximal phalanx of fifth finger of foot",
  "Proximal phalanx of first finger of foot",
  "Proximal phalanx of fourth finger of foot",
  "Proximal phalanx of second finger of foot",
  "Proximal phalanx of third finger of foot",
  "Second metatarsal bone",
  "Sesamoid bones of foot",
  "Talus",
  "Third metatarsal bone",
  "Tibia",
]);

export const DETAILED_REPLACEMENT_SOURCE_NAMES = Object.freeze([
  "Coccyx",
  "Sacrum",
  ...PAIRED_DETAILED_REPLACEMENTS.flatMap((name) =>
    SIDES.map((side) => `${name}${SOURCE_SUFFIX[side]}`),
  ),
]);

const HEAD_NECK_MIDLINE_NAMES = Object.freeze([
  "Atlas (C1)",
  "Axis (C2)",
  ...Array.from({ length: 5 }, (_, index) =>
    `Cervical vertebrae (C${index + 3})`,
  ),
  "Ethmoid Bone",
  "Frontal bone",
  "Mandible bone",
  "Occipital bone",
  "Parietal bone left",
  "Parietal bone right",
  "Sphenoid bone",
  "Vomer",
]);

const HEAD_NECK_PAIRED_NAMES = Object.freeze([
  "Inferior nasal concha bone",
  "Lacrimal bone",
  "Lower canine",
  "Lower first molar tooth",
  "Lower first premolar",
  "Lower lateral incisor",
  "Lower medial incisor",
  "Lower second molar tooth",
  "Lower second premolar",
  "Maxilla bone",
  "Nasal bone",
  "Palatine bone",
  "Temporal bone",
  "Upper canine",
  "Upper first molar tooth",
  "Upper first premolar",
  "Upper lateral incisor",
  "Upper medial incisor",
  "Upper second molar tooth",
  "Upper second premolar",
  "Zygomatic bone",
]);

const TORSO_MIDLINE_NAMES = Object.freeze([
  "Body of sternum",
  "Manubrium of sternum",
  ...Array.from({ length: 5 }, (_, index) =>
    `Lumbar vertebrae (L${index + 1})`,
  ),
  ...Array.from({ length: 12 }, (_, index) =>
    `Thoracic vertebrae (T${index + 1})`,
  ),
]);

const RIB_ORDINALS = Object.freeze([
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
  "11th",
  "12th",
]);

const HAND_BONE_NAMES = Object.freeze([
  ...Array.from({ length: 5 }, (_, index) =>
    `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} metacarpal bone`,
  ),
  "Distal phalanx of 1st finger",
  "Distal phalanx of 2d finger",
  "Distal phalanx of 3d finger",
  "Distal phalanx of 4th finger",
  "Distal phalanx of 5th finger",
  "Middle phalanx of 2d finger",
  "Middle phalanx of 3rd finger",
  "Middle phalanx of 4th finger",
  "Middle phalanx of 5th finger",
  "Proximal phalanx of 1st finger",
  "Proximal phalanx of 2d finger",
  "Proximal phalanx of 3rd finger",
  "Proximal phalanx of 4th finger",
  "Proximal phalanx of 5th finger",
  "Capitate",
  "Hamate",
  "Lunate bone",
  "Pisiform",
  "Scaphoid",
  "Sesamoid_bones_of_hand",
  "Trapezium",
  "Trapezoid",
  "Triquetrum",
]);

const CLASSIFICATION_BY_SOURCE_NAME = new Map();

function registerClassification(names, classification) {
  for (const name of names) {
    if (CLASSIFICATION_BY_SOURCE_NAME.has(name)) {
      throw new Error(`Duplicate overview classification: ${name}`);
    }
    CLASSIFICATION_BY_SOURCE_NAME.set(name, Object.freeze(classification));
  }
}

function pairedSourceNames(names) {
  return names.flatMap((name) =>
    SIDES.map((side) => `${name}${SOURCE_SUFFIX[side]}`),
  );
}

registerClassification(DETAILED_REPLACEMENT_SOURCE_NAMES, {
  disposition: "replace-with-detailed",
});
registerClassification(
  [...HEAD_NECK_MIDLINE_NAMES, ...pairedSourceNames(HEAD_NECK_PAIRED_NAMES)],
  { disposition: "include", group: "head-neck", segment: "head-neck" },
);
registerClassification(
  [
    ...TORSO_MIDLINE_NAMES,
    ...pairedSourceNames(["Clavicle"]),
    "Scapula.r.",
    "Scapula.l",
    ...RIB_ORDINALS.flatMap((ordinal) =>
      SIDES.map((side) => `Rib (${ordinal})${SOURCE_SUFFIX[side]}`),
    ),
  ],
  { disposition: "include", group: "torso", segment: "torso" },
);

for (const side of SIDES) {
  registerClassification([`Humerus${SOURCE_SUFFIX[side]}`], {
    disposition: "include",
    group: `${side}-arm`,
    segment: `${side}-upper-arm`,
  });
  registerClassification(
    ["Radius", "Ulna"].map((name) => `${name}${SOURCE_SUFFIX[side]}`),
    {
      disposition: "include",
      group: `${side}-arm`,
      segment: `${side}-forearm`,
    },
  );
  registerClassification(
    HAND_BONE_NAMES.map((name) => `${name}${SOURCE_SUFFIX[side]}`),
    {
      disposition: "include",
      group: `${side}-arm`,
      segment: `${side}-hand`,
    },
  );
}

export function classifyOverviewBone(sourceName) {
  if (typeof sourceName !== "string" || sourceName.length === 0) {
    throw new TypeError("Overview source name must be a non-empty string");
  }
  const classification = CLASSIFICATION_BY_SOURCE_NAME.get(sourceName);
  if (!classification) {
    throw new Error(`Unclassified overview bone: ${sourceName}`);
  }
  return { ...classification };
}

function vector3(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((coordinate) => !Number.isFinite(coordinate))
  ) {
    throw new TypeError(`${label} must contain three finite coordinates`);
  }
  return value;
}

function cleanZero(value) {
  return value === 0 ? 0 : value;
}

function normalize3(value, label) {
  const vector = vector3(value, label);
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new Error(`${label} must have non-zero length`);
  }
  return vector.map((coordinate) => cleanZero(coordinate / length));
}

function cross3([ax, ay, az], [bx, by, bz]) {
  return [
    cleanZero(ay * bz - az * by),
    cleanZero(az * bx - ax * bz),
    cleanZero(ax * by - ay * bx),
  ];
}

function dot3(left, right) {
  return left.reduce((sum, value, axis) => sum + value * right[axis], 0);
}

function subtract3(left, right) {
  return left.map((coordinate, axis) => coordinate - right[axis]);
}

export function jointBasis(longAxis, anterior = [0, 1, 0]) {
  const z = normalize3(longAxis, "Joint long axis");
  const anteriorDirection = normalize3(anterior, "Patient anterior axis");
  const transverse = cross3(anteriorDirection, z);
  if (Math.hypot(...transverse) <= 1e-8) {
    throw new Error("Patient anterior axis is parallel to the joint long axis");
  }
  const x = normalize3(transverse, "Joint basis x axis");
  const y = normalize3(cross3(z, x), "Joint basis y axis");

  const axes = [x, y, z];
  if (
    axes.some((axis) => Math.abs(Math.hypot(...axis) - 1) > 1e-8) ||
    Math.abs(dot3(x, y)) > 1e-8 ||
    Math.abs(dot3(y, z)) > 1e-8 ||
    Math.abs(dot3(z, x)) > 1e-8
  ) {
    throw new Error("Joint basis must contain unit orthogonal axes");
  }
  if (dot3(cross3(x, y), z) < 1 - 1e-6) {
    throw new Error("Joint basis must be right-handed");
  }

  return { x, y, z };
}

function validatedPointCloud(points, label, minimumSamples = 1) {
  if (!Array.isArray(points) || points.length < minimumSamples) {
    throw new Error(
      `${label} requires at least ${minimumSamples} ${minimumSamples === 1 ? "sample" : "samples"}`,
    );
  }
  for (const point of points) {
    vector3(point, `${label} sample`);
  }
  return points;
}

function centroid(points, label) {
  const samples = validatedPointCloud(points, label);
  return [0, 1, 2].map(
    (axis) =>
      samples.reduce((sum, point) => sum + point[axis], 0) / samples.length,
  );
}

function meanCloudCentres(clouds) {
  const centres = clouds.map(({ points, label }) => centroid(points, label));
  return [0, 1, 2].map(
    (axis) =>
      centres.reduce((sum, centre) => sum + centre[axis], 0) / centres.length,
  );
}

export function assertPivotWithinAdjacentBounds(
  pivot,
  adjacentPointClouds,
  marginMm = 5,
) {
  const position = vector3(pivot, "Joint pivot");
  if (!Number.isFinite(marginMm) || marginMm < 0) {
    throw new RangeError("Joint bounds margin must be a finite non-negative value");
  }
  if (!Array.isArray(adjacentPointClouds) || adjacentPointClouds.length === 0) {
    throw new Error("Joint pivot validation requires adjacent bone samples");
  }
  for (const [index, cloud] of adjacentPointClouds.entries()) {
    const points = validatedPointCloud(cloud, `Adjacent bone ${index + 1}`);
    const { min, max } = pointBounds(points);
    const isInside = position.every(
      (coordinate, axis) =>
        coordinate >= min[axis] - marginMm &&
        coordinate <= max[axis] + marginMm,
    );
    if (!isInside) {
      throw new Error(
        `Joint pivot lies outside adjacent bone bounds plus margin: bone ${index + 1}`,
      );
    }
  }
}

function pivotDefinition({
  id,
  side,
  positionMm,
  localBasis,
  parentSegment,
  childSegment,
  derivation,
}) {
  return {
    id,
    side,
    positionMm,
    localBasis,
    parentSegment,
    childSegment,
    derivation,
  };
}

export function deriveUpperLimbJointPivots({
  side,
  glenoid,
  humeralHead,
  distalHumerus,
  proximalRadius,
  proximalUlna,
  distalRadius,
  distalUlna,
  proximalCarpals,
  anteriorAxis = [0, 1, 0],
  boundsMarginMm = 5,
}) {
  if (!SIDES.includes(side)) {
    throw new Error(`Upper-limb side must be left or right: ${side}`);
  }

  if (!Array.isArray(humeralHead)) {
    throw new TypeError("Humeral head samples must be an array");
  }
  const shoulderPosition = fitSphere(humeralHead).center;
  assertPivotWithinAdjacentBounds(
    shoulderPosition,
    [glenoid, humeralHead],
    boundsMarginMm,
  );

  const elbowClouds = [
    { points: distalHumerus, label: "Distal humerus" },
    { points: proximalRadius, label: "Proximal radius" },
    { points: proximalUlna, label: "Proximal ulna" },
  ];
  const elbowPosition = meanCloudCentres(elbowClouds);
  assertPivotWithinAdjacentBounds(
    elbowPosition,
    elbowClouds.map(({ points }) => points),
    boundsMarginMm,
  );

  const wristClouds = [
    { points: distalRadius, label: "Distal radius" },
    { points: distalUlna, label: "Distal ulna" },
    { points: proximalCarpals, label: "Proximal carpals" },
  ];
  const wristPosition = meanCloudCentres(wristClouds);
  assertPivotWithinAdjacentBounds(
    wristPosition,
    wristClouds.map(({ points }) => points),
    boundsMarginMm,
  );

  const shoulderBasis = jointBasis(
    subtract3(elbowPosition, shoulderPosition),
    anteriorAxis,
  );
  const distalAxis = subtract3(wristPosition, elbowPosition);
  const elbowBasis = jointBasis(distalAxis, anteriorAxis);
  const wristBasis = jointBasis(distalAxis, anteriorAxis);

  return {
    shoulder: pivotDefinition({
      id: `${side}-shoulder`,
      side,
      positionMm: shoulderPosition,
      localBasis: shoulderBasis,
      parentSegment: "torso",
      childSegment: `${side}-upper-arm`,
      derivation: "least-squares sphere fit of proximal humeral-head samples",
    }),
    elbow: pivotDefinition({
      id: `${side}-elbow`,
      side,
      positionMm: elbowPosition,
      localBasis: elbowBasis,
      parentSegment: `${side}-upper-arm`,
      childSegment: `${side}-forearm`,
      derivation:
        "equal-weight mean of distal humerus and proximal radius/ulna landmark centres",
    }),
    wrist: pivotDefinition({
      id: `${side}-wrist`,
      side,
      positionMm: wristPosition,
      localBasis: wristBasis,
      parentSegment: `${side}-forearm`,
      childSegment: `${side}-hand`,
      derivation:
        "equal-weight mean of distal radius/ulna and proximal carpal landmark centres",
    }),
  };
}
