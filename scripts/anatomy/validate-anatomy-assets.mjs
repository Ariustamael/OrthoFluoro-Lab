import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";

const EXPECTED_HIP_GROUPS = [
  "pelvis",
  "left-femur",
  "left-patella",
  "left-tibia-fibula",
  "left-foot",
  "right-femur",
  "right-patella",
  "right-tibia-fibula",
  "right-foot",
];
const EXPECTED_REGIONAL_GROUPS = [
  "regional-midline",
  "regional-left",
  "regional-right",
];
const EXPECTED_REGIONAL_SOURCE_CATEGORY_COUNTS = Object.freeze({
  Bones: 6,
  Cartilages: 36,
  Ligaments: 72,
  Muscles: 71,
  Fascia: 14,
  Arteries: 46,
  Veins: 42,
  Nerves: 47,
  Bursae: 38,
  Overlays: 46,
});
const EXPECTED_REGIONAL_RUNTIME_CATEGORY_COUNTS = Object.freeze({
  Bones: 6,
  Cartilages: 63,
  Ligaments: 142,
  Muscles: 142,
  Fascia: 28,
  Arteries: 92,
  Veins: 84,
  Nerves: 94,
  Bursae: 76,
  Overlays: 90,
});
const EXPECTED_REGIONAL_SOURCE_MANIFEST_SHA256 =
  "A2CC25BB6AC07014CBE1955310B835A486625972407BC4E2A19E7A431E1BC7F4";
const EXPECTED_REGIONAL_MATERIALS = Object.freeze({
  Cartilages: [0.42, 0.72, 0.82, 1],
  Ligaments: [0.82, 0.75, 0.61, 1],
  Muscles: [0.58, 0.18, 0.2, 1],
  Fascia: [0.76, 0.7, 0.59, 1],
  Arteries: [0.72, 0.08, 0.1, 1],
  Veins: [0.12, 0.28, 0.58, 1],
  Nerves: [0.88, 0.63, 0.12, 1],
  Bursae: [0.12, 0.55, 0.55, 1],
  Overlays: [0.55, 0.48, 0.42, 1],
  Bones: [0.82, 0.79, 0.7, 1],
});
const EXPECTED_SOURCES = [
  {
    id: "open3dmodel-overview-skeleton",
    archiveUrl:
      "https://caskanatomy.info/open3dmodelfiles/overview-skeleton/overview-skeleton-glb.zip",
    archiveBytes: 3102294,
    sha256: "A6E0803EC66EC236979DDD35945FC2033FA7CDBCD0AB1B4FE06B47E848706364",
    member: "overview-skeleton.glb",
    memberBytes: 3422276,
    memberSha256:
      "E83543ABB5C8DE013A4BDCBF2C0536AE1CE92980C7AA7951C6AA3DDEA804D10F",
  },
  {
    id: "open3dmodel-lower-limb",
    archiveUrl:
      "https://caskanatomy.info/open3dmodelfiles/lower-limb/lower-limb-glb.zip",
    archiveBytes: 5492015,
    sha256: "E080EBEF16B2A3F53C7F6005515FAC39EDD941FB0AEBC79FF4B9F59FFFF8D416",
    member: "lower-limb.glb",
    memberBytes: 6184984,
    memberSha256:
      "5A889D5CAE00421885AAF1841E72364E5F215F0C29FB0116CA5E9844EC4C5FE7",
  },
];
const BOUNDS_TOLERANCE_MM = 1;
const DRACO_LICENSE = Object.freeze({
  bytes: 13_898,
  id: "Apache-2.0",
  sha256: "D3709B0FB4B8A94BBB1D02B8A2E484F258B0D9C5C5A01F940391F3FE662CD1A4",
  sourceUrl: "https://raw.githubusercontent.com/google/draco/1.5.7/LICENSE",
});

export const EXPECTED_ASSET_BASELINES = Object.freeze({
  hip: Object.freeze({
    meshCount: 66,
    triangleCount: 141_572,
    overallBounds: {
      min: [-148.18582, -90.032, -849.88715],
      max: [148.18582, 142.3464, 152.31914],
    },
    groupBounds: {
      pelvis: {
        min: [-134.83551, -90.032, -61.0207],
        max: [134.83551, 60.95746, 152.31914],
      },
      "left-femur": {
        min: [32.30605, -53.71032, -426.59407],
        max: [148.18582, 23.72658, 24.88231],
      },
      "left-patella": {
        min: [62.74948, -0.11431, -434.72969],
        max: [105.79638, 20.33579, -394.31559],
      },
      "left-tibia-fibula": {
        min: [37.58101, -55.10567, -802.00829],
        max: [124.24651, 8.35061, -424.46464],
      },
      "left-foot": {
        min: [51.62287, -88.30101, -849.88715],
        max: [146.12411, 142.3464, -773.65068],
      },
      "right-femur": {
        min: [-148.18582, -53.71032, -426.59407],
        max: [-32.30605, 23.72658, 24.88231],
      },
      "right-patella": {
        min: [-105.79638, -0.11431, -434.72969],
        max: [-62.74948, 20.33579, -394.31559],
      },
      "right-tibia-fibula": {
        min: [-124.24651, -55.10567, -802.00829],
        max: [-37.58101, 8.35061, -424.46464],
      },
      "right-foot": {
        min: [-146.12411, -88.30101, -849.88715],
        max: [-51.62287, 142.3464, -773.65068],
      },
    },
  }),
  overview: Object.freeze({
    meshCount: 232,
    triangleCount: 725_968,
    overallBounds: {
      min: [-335.52463, -117.13336, 9.14125],
      max: [335.52463, 137.06049, 1705.11267],
    },
    groupBounds: {
      "overview-midline": {
        min: [-74.3315, -103.36007, 830.57813],
        max: [74.15393, 112.3345, 1705.11267],
      },
      "overview-left": {
        min: [-0.70512, -117.13336, 9.14125],
        max: [335.52463, 137.06049, 1622.34241],
      },
      "overview-right": {
        min: [-335.52463, -117.13336, 9.14125],
        max: [0.70512, 137.06049, 1622.34241],
      },
    },
  }),
  regional: Object.freeze({
    meshCount: 817,
    triangleCount: 2_164_568,
    overallBounds: {
      min: [-161.54712, -110.18267, -855.14313],
      max: [161.54712, 140.20723, 306.82874],
    },
    groupBounds: {
      "regional-midline": {
        min: [-52.80121, -77.84384, -36.81254],
        max: [52.80115, 62.79745, 306.82868],
      },
      "regional-left": {
        min: [-62.06957, -110.18267, -855.14313],
        max: [161.54712, 140.20723, 297.71478],
      },
      "regional-right": {
        min: [-161.54712, -110.18267, -855.14313],
        max: [62.06957, 140.20723, 297.71478],
      },
    },
  }),
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

export function validateRegionalSourceManifest(entries) {
  if (!Array.isArray(entries) || entries.length !== 418) {
    return ["Regional source-name and side manifest has an invalid length"];
  }
  const rows = entries.map((entry) => `${entry?.key}\t${entry?.side}`).sort();
  const digest = sha256(new TextEncoder().encode(rows.join("\n")));
  return digest === EXPECTED_REGIONAL_SOURCE_MANIFEST_SHA256
    ? []
    : ["Regional source-name and side manifest differs from the pinned source"];
}

export function validateRecordedBuildHashes(recorded, actualSha256) {
  const errors = [];
  if (recorded?.firstBuildSha256 !== actualSha256)
    errors.push("First-build hash differs from the committed artifact hash");
  if (recorded?.secondBuildSha256 !== actualSha256)
    errors.push("Second-build hash differs from the committed artifact hash");
  if (recorded?.committedSha256 !== actualSha256)
    errors.push(
      "Committed-build hash differs from the actual committed artifact hash",
    );
  return errors;
}

export function validateBoundsAgainstBaselines(assetName, actualGroupBounds) {
  const expected = EXPECTED_ASSET_BASELINES[assetName];
  if (!expected) return [`Unknown asset baseline: ${assetName}`];
  const actual = actualGroupBounds.groupBounds || actualGroupBounds;
  const errors = [];
  for (const [groupName, expectedBounds] of Object.entries(
    expected.groupBounds,
  )) {
    const bounds = actual[groupName];
    if (
      !bounds ||
      !approximatelyEqual(
        bounds.min,
        expectedBounds.min,
        BOUNDS_TOLERANCE_MM,
      ) ||
      !approximatelyEqual(bounds.max, expectedBounds.max, BOUNDS_TOLERANCE_MM)
    ) {
      errors.push(
        `${assetName} ${groupName} bounds differ from the pinned baseline: ${JSON.stringify(bounds)}`,
      );
    }
  }
  if (
    actualGroupBounds.overallBounds &&
    (!approximatelyEqual(
      actualGroupBounds.overallBounds.min,
      expected.overallBounds.min,
      BOUNDS_TOLERANCE_MM,
    ) ||
      !approximatelyEqual(
        actualGroupBounds.overallBounds.max,
        expected.overallBounds.max,
        BOUNDS_TOLERANCE_MM,
      ))
  ) {
    errors.push(
      `${assetName} overall bounds differ from the pinned baseline: ${JSON.stringify(actualGroupBounds.overallBounds)}`,
    );
  }
  return errors;
}

export function validatePivotCandidateRegion(pivot, femurBounds, side) {
  if (
    !pivot ||
    !femurBounds ||
    ![...pivot, ...femurBounds.min, ...femurBounds.max].every(Number.isFinite)
  )
    return false;
  const proximalThreshold =
    femurBounds.min[2] + 0.86 * (femurBounds.max[2] - femurBounds.min[2]);
  const medialThreshold =
    femurBounds.min[0] + 0.5 * (femurBounds.max[0] - femurBounds.min[0]);
  const inside = pivot.every(
    (value, axis) =>
      value >= femurBounds.min[axis] - BOUNDS_TOLERANCE_MM &&
      value <= femurBounds.max[axis] + BOUNDS_TOLERANCE_MM,
  );
  const medial =
    side === "right"
      ? pivot[0] >= medialThreshold
      : pivot[0] <= medialThreshold;
  return inside && pivot[2] >= proximalThreshold && medial;
}

export function validateLateralityEvidence({
  sourceRightPivot,
  rightPivot,
  leftPivot,
  rightBounds,
  leftBounds,
}) {
  const valid =
    sourceRightPivot?.[0] < 0 &&
    rightPivot?.[0] < 0 &&
    leftPivot?.[0] > 0 &&
    rightBounds?.max[0] < 0 &&
    leftBounds?.min[0] > 0;
  return valid ? [] : ["Spatial laterality evidence is inconsistent"];
}

export function computeSignedVolume(positions, indices) {
  let volume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = [indices[index], indices[index + 1], indices[index + 2]];
    volume +=
      (positions[3 * a] *
        (positions[3 * b + 1] * positions[3 * c + 2] -
          positions[3 * b + 2] * positions[3 * c + 1]) +
        positions[3 * a + 1] *
          (positions[3 * b + 2] * positions[3 * c] -
            positions[3 * b] * positions[3 * c + 2]) +
        positions[3 * a + 2] *
          (positions[3 * b] * positions[3 * c + 1] -
            positions[3 * b + 1] * positions[3 * c])) /
      6;
  }
  return volume;
}

function geometryFingerprint({ positions, indices }) {
  const vertices = [];
  for (let index = 0; index < positions.length; index += 3) {
    vertices.push(
      `${positions[index].toFixed(4)},${positions[index + 1].toFixed(4)},${positions[index + 2].toFixed(4)}`,
    );
  }
  vertices.sort();
  return sha256(Buffer.from(`${indices.length}|${vertices.join("|")}`, "utf8"));
}

export function findDuplicateGeometryFingerprints(meshes) {
  const byFingerprint = new Map();
  for (const mesh of meshes) {
    const fingerprint = geometryFingerprint(mesh);
    const names = byFingerprint.get(fingerprint) || [];
    names.push(mesh.name);
    byFingerprint.set(fingerprint, names);
  }
  return [...byFingerprint.values()].filter((names) => names.length > 1);
}

function boundsForMeshes(meshes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION")?.getArray();
      if (!position) continue;
      for (let index = 0; index < position.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], position[index + axis]);
          max[axis] = Math.max(max[axis], position[index + axis]);
        }
      }
    }
  }
  return { min, max };
}

export function approximatelyEqual(actual, expected, tolerance = 0.5) {
  return (
    Array.isArray(actual) &&
    Array.isArray(expected) &&
    actual.length > 0 &&
    actual.length === expected.length &&
    [...actual, ...expected].every(Number.isFinite) &&
    actual.every(
      (value, index) => Math.abs(value - expected[index]) <= tolerance,
    )
  );
}

function numericRecordEqual(actual, expected) {
  return (
    actual &&
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual[key] === value)
  );
}

function mirroredBounds(left, right) {
  return (
    Math.abs(left.min[0] + right.max[0]) <= 0.5 &&
    Math.abs(left.max[0] + right.min[0]) <= 0.5 &&
    approximatelyEqual(left.min.slice(1), right.min.slice(1)) &&
    approximatelyEqual(left.max.slice(1), right.max.slice(1))
  );
}

function readGlbJSON(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error("Invalid GLB header");
  }
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) throw new Error("GLB JSON chunk is absent");
  return JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim(),
  );
}

function externalRuntimeURLs(json) {
  const uris = [];
  for (const collection of [json.buffers || [], json.images || []]) {
    for (const item of collection) {
      if (item.uri && !item.uri.startsWith("data:")) uris.push(item.uri);
    }
  }
  return uris;
}

function validatePrimitive(
  primitive,
  meshName,
  errors,
  { requireClosed = true, requireConsistentNormals = true } = {},
) {
  const positionAccessor = primitive.getAttribute("POSITION");
  const normalAccessor = primitive.getAttribute("NORMAL");
  const indexAccessor = primitive.getIndices();
  if (!positionAccessor || !normalAccessor || !indexAccessor) {
    errors.push(`${meshName} lacks indexed positions or normals`);
    return {
      closed: false,
      nonFinite: 0,
      windingErrors: 0,
      degenerateTriangles: 0,
    };
  }
  const positions = positionAccessor.getArray();
  const normals = normalAccessor.getArray();
  const indices = indexAccessor.getArray();
  let nonFinite = 0;
  for (const array of [positions, normals, indices]) {
    for (const value of array) {
      if (!Number.isFinite(value)) nonFinite += 1;
    }
  }
  const vertexCount = positions.length / 3;
  let invalidIndices = 0;
  for (const index of indices) {
    if (index < 0 || index >= vertexCount || !Number.isInteger(index))
      invalidIndices += 1;
  }
  if (nonFinite)
    errors.push(`${meshName} has ${nonFinite} non-finite accessor values`);
  if (invalidIndices)
    errors.push(`${meshName} has ${invalidIndices} out-of-bounds indices`);
  if (positions.length !== normals.length || indices.length % 3 !== 0) {
    errors.push(`${meshName} has inconsistent accessor lengths`);
  }

  const vertexKeys = Array.from(
    { length: vertexCount },
    (_, index) =>
      `${positions[3 * index].toFixed(4)},${positions[3 * index + 1].toFixed(4)},${positions[3 * index + 2].toFixed(4)}`,
  );
  const edges = new Map();
  let windingErrors = 0;
  let degenerateTriangles = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = [indices[index], indices[index + 1], indices[index + 2]];
    if ([a, b, c].some((vertex) => vertex >= vertexCount)) continue;
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const first = vertexKeys[from];
      const second = vertexKeys[to];
      const key = first < second ? `${first}|${second}` : `${second}|${first}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
    const ab = [0, 1, 2].map(
      (axis) => positions[3 * b + axis] - positions[3 * a + axis],
    );
    const ac = [0, 1, 2].map(
      (axis) => positions[3 * c + axis] - positions[3 * a + axis],
    );
    const face = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const averageNormal = [0, 1, 2].map(
      (axis) =>
        normals[3 * a + axis] + normals[3 * b + axis] + normals[3 * c + axis],
    );
    const faceLength = Math.hypot(...face);
    const averageNormalLength = Math.hypot(...averageNormal);
    // Draco's position quantization can collapse source micro-triangles to a
    // face area far below display resolution. Account for those separately so
    // they cannot hide genuine winding defects behind a global error budget.
    if (faceLength <= 1e-4 || averageNormalLength <= 0.05) {
      degenerateTriangles += 1;
      continue;
    }
    const normalizedAlignment =
      face.reduce((sum, value, axis) => sum + value * averageNormal[axis], 0) /
      (faceLength * averageNormalLength);
    if (normalizedAlignment < -0.01) {
      windingErrors += 1;
    }
  }
  const badEdges = [...edges.values()].filter((count) => count !== 2).length;
  if (badEdges && requireClosed)
    errors.push(
      `${meshName} is not closed (${badEdges} non-manifold boundary edges)`,
    );
  if (windingErrors && requireConsistentNormals)
    errors.push(
      `${meshName} has ${windingErrors} winding/normal inconsistencies`,
    );
  return {
    closed: badEdges === 0,
    nonFinite,
    windingErrors,
    degenerateTriangles,
  };
}

function collectSemanticGroups(document) {
  const groups = new Map();
  for (const node of document.getRoot().listNodes()) {
    const group = node.getExtras().anatomyGroup;
    if (typeof group !== "string" || node.getMesh()) continue;
    if (groups.has(group))
      throw new Error(`Duplicate semantic group node: ${group}`);
    groups.set(group, node);
  }
  return groups;
}

function meshesUnder(node) {
  const meshes = [];
  const visit = (current) => {
    if (current.getMesh()) meshes.push(current.getMesh());
    current.listChildren().forEach(visit);
  };
  visit(node);
  return meshes;
}

function meshNodesUnder(node) {
  const nodes = [];
  const visit = (current) => {
    if (current.getMesh()) nodes.push(current);
    current.listChildren().forEach(visit);
  };
  visit(node);
  return nodes;
}

function flattenMeshGeometry(mesh) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (const primitive of mesh.listPrimitives()) {
    const primitivePositions = primitive.getAttribute("POSITION").getArray();
    const primitiveNormals = primitive.getAttribute("NORMAL").getArray();
    const primitiveIndices = primitive.getIndices().getArray();
    const vertexOffset = positions.length / 3;
    positions.push(...primitivePositions);
    normals.push(...primitiveNormals);
    indices.push(...[...primitiveIndices].map((index) => index + vertexOffset));
  }
  return { name: mesh.getName(), positions, normals, indices };
}

function canonicalOrientedTriangle(vertices) {
  const rotations = [
    [vertices[0], vertices[1], vertices[2]],
    [vertices[1], vertices[2], vertices[0]],
    [vertices[2], vertices[0], vertices[1]],
  ].map((rotation) => rotation.flat());
  return rotations.sort(compareNumericVectors)[0];
}

function compareNumericVectors(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function mirroredGeometryRecords(geometry, { mirrorX, reverseWinding }) {
  const positions = [];
  const vertexRecords = [];
  for (let index = 0; index < geometry.positions.length; index += 3) {
    const position = [
      mirrorX ? -geometry.positions[index] : geometry.positions[index],
      geometry.positions[index + 1],
      geometry.positions[index + 2],
    ];
    const normal = [
      mirrorX ? -geometry.normals[index] : geometry.normals[index],
      geometry.normals[index + 1],
      geometry.normals[index + 2],
    ];
    positions.push(position);
    vertexRecords.push([...position, ...normal]);
  }
  const triangles = [];
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const vertices = [
      positions[geometry.indices[index]],
      positions[geometry.indices[index + 1]],
      positions[geometry.indices[index + 2]],
    ];
    if (reverseWinding) [vertices[1], vertices[2]] = [vertices[2], vertices[1]];
    triangles.push(canonicalOrientedTriangle(vertices));
  }
  return {
    triangles: triangles.sort(compareNumericVectors),
    vertexRecords: vertexRecords.sort(compareNumericVectors),
  };
}

function vectorsMatchWithin(left, right, tolerance) {
  return (
    left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]) <= tolerance)
  );
}

function validateMirroredNodePair(leftNode, rightNode) {
  const left = flattenMeshGeometry(leftNode.getMesh());
  const right = flattenMeshGeometry(rightNode.getMesh());
  if (
    left.positions.length !== right.positions.length ||
    left.indices.length !== right.indices.length
  ) {
    return false;
  }
  const leftRecords = mirroredGeometryRecords(left, {
    mirrorX: true,
    reverseWinding: true,
  });
  const rightRecords = mirroredGeometryRecords(right, {
    mirrorX: false,
    reverseWinding: false,
  });
  return (
    mirroredBounds(
      boundsForMeshes([leftNode.getMesh()]),
      boundsForMeshes([rightNode.getMesh()]),
    ) &&
    leftRecords.triangles.length === rightRecords.triangles.length &&
    leftRecords.triangles.every((triangle, index) =>
      vectorsMatchWithin(triangle, rightRecords.triangles[index], 0.001),
    ) &&
    leftRecords.vertexRecords.length === rightRecords.vertexRecords.length &&
    leftRecords.vertexRecords.every((record, index) =>
      vectorsMatchWithin(record, rightRecords.vertexRecords[index], 0.001),
    )
  );
}

function hasIdentityWorldMatrix(node, tolerance = 1e-8) {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return node
    .getWorldMatrix()
    .every((value, index) => Math.abs(value - identity[index]) <= tolerance);
}

export async function validateCommittedAnatomy(repositoryRoot) {
  const errors = [];
  let recordedBuildHashesVerified = true;
  const anatomyDirectory = join(repositoryRoot, "public", "anatomy");
  const provenance = JSON.parse(
    await readFile(
      join(anatomyDirectory, "open3dmodel-provenance.json"),
      "utf8",
    ),
  );
  const overviewPath = join(repositoryRoot, provenance.artifacts.overview.path);
  const hipPath = join(repositoryRoot, provenance.artifacts.hip.path);
  const regionalPath = join(repositoryRoot, provenance.artifacts.regional.path);
  const [overviewBytes, hipBytes, regionalBytes] = await Promise.all([
    readFile(overviewPath),
    readFile(hipPath),
    readFile(regionalPath),
  ]);
  for (const [name, bytes] of [
    ["overview", overviewBytes],
    ["hip", hipBytes],
    ["regional", regionalBytes],
  ]) {
    const artifact = provenance.artifacts[name];
    const actualSha256 = sha256(bytes);
    if (bytes.byteLength !== artifact.bytes)
      errors.push(`${name} byte count differs from provenance`);
    if (actualSha256 !== artifact.sha256)
      errors.push(`${name} checksum differs from provenance`);
    const hashErrors = validateRecordedBuildHashes(
      artifact.buildHashes,
      actualSha256,
    );
    recordedBuildHashesVerified &&= hashErrors.length === 0;
    errors.push(...hashErrors.map((error) => `${name}: ${error}`));
    const urls = externalRuntimeURLs(readGlbJSON(bytes));
    if (urls.length)
      errors.push(`${name} contains runtime URLs: ${urls.join(", ")}`);
  }
  if (
    provenance.licence.id !== "CC-BY-SA-4.0" ||
    provenance.licence.url !== "https://creativecommons.org/licenses/by-sa/4.0/"
  ) {
    errors.push("Provenance licence identity is invalid");
  }
  const recordedSources = provenance.sources.map((source) => ({
    id: source.id,
    archiveUrl: source.archiveUrl,
    archiveBytes: source.archiveBytes,
    sha256: source.sha256,
    member: source.member,
    memberBytes: source.memberBytes,
    memberSha256: source.memberSha256,
  }));
  const sourceIdentityVerified =
    JSON.stringify(recordedSources) === JSON.stringify(EXPECTED_SOURCES);
  if (!sourceIdentityVerified)
    errors.push("Pinned source identities differ from the audited registry");
  let dracoLicenseVerified = false;
  try {
    const licenseBytes = await readFile(
      join(repositoryRoot, "public", "draco", "LICENSE"),
    );
    const runtimeLicense = provenance.dracoRuntime?.license;
    dracoLicenseVerified =
      licenseBytes.byteLength === DRACO_LICENSE.bytes &&
      sha256(licenseBytes) === DRACO_LICENSE.sha256 &&
      runtimeLicense?.id === DRACO_LICENSE.id &&
      runtimeLicense?.sourceUrl === DRACO_LICENSE.sourceUrl &&
      runtimeLicense?.bytes === DRACO_LICENSE.bytes &&
      runtimeLicense?.sha256 === DRACO_LICENSE.sha256;
  } catch {
    dracoLicenseVerified = false;
  }
  if (!dracoLicenseVerified)
    errors.push("Draco LICENSE checksum or provenance is invalid");
  for (const fileName of [
    "draco_decoder.js",
    "draco_decoder.wasm",
    "draco_wasm_wrapper.js",
  ]) {
    try {
      const bytes = await readFile(
        join(repositoryRoot, "public", "draco", fileName),
      );
      const recorded = provenance.dracoRuntime?.files?.[fileName];
      if (
        !recorded ||
        recorded.bytes !== bytes.byteLength ||
        recorded.sha256 !== sha256(bytes)
      ) {
        errors.push(`Draco runtime checksum differs for ${fileName}`);
      }
    } catch {
      errors.push(`Draco runtime file is absent: ${fileName}`);
    }
  }

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
    });
  const [overviewDocument, hipDocument, regionalDocument] = await Promise.all([
    io.read(overviewPath),
    io.read(hipPath),
    io.read(regionalPath),
  ]);
  const hipGroups = collectSemanticGroups(hipDocument);
  const groupNames = [...hipGroups.keys()].sort(
    (left, right) =>
      EXPECTED_HIP_GROUPS.indexOf(left) - EXPECTED_HIP_GROUPS.indexOf(right),
  );
  if (JSON.stringify(groupNames) !== JSON.stringify(EXPECTED_HIP_GROUPS)) {
    errors.push(`Hip semantic groups differ: ${groupNames.join(", ")}`);
  }
  const hipRootExtras = hipDocument.getRoot().getExtras().orthoFluoro;
  const hipPivots = hipRootExtras?.hipPivots;
  if (
    !hipPivots ||
    ![...hipPivots.left, ...hipPivots.right].every(Number.isFinite)
  ) {
    errors.push("Hip pivots are absent or non-finite");
  }

  const groupBounds = {};
  const hipMeshGeometry = [];
  let meshCount = 0;
  let closedMeshCount = 0;
  let nonFiniteAccessorCount = 0;
  let triangleCount = 0;
  let negativeSignedVolumeCount = 0;
  const lateralityNodeErrors = [];
  for (const [groupName, groupNode] of hipGroups) {
    const meshes = meshesUnder(groupNode);
    meshCount += meshes.length;
    groupBounds[groupName] = boundsForMeshes(meshes);
    const recorded = provenance.artifacts.hip.groupBounds[groupName];
    if (
      !recorded ||
      !approximatelyEqual(groupBounds[groupName].min, recorded.min) ||
      !approximatelyEqual(groupBounds[groupName].max, recorded.max)
    ) {
      errors.push(`${groupName} bounds differ from provenance`);
    }
    if (groupName.startsWith("left-") || groupName.startsWith("right-")) {
      const expectedMirroring = groupName.startsWith("left-");
      for (const node of meshNodesUnder(groupNode)) {
        const bounds = boundsForMeshes([node.getMesh()]);
        if (node.getExtras().derivedByMirroring !== expectedMirroring) {
          lateralityNodeErrors.push(
            `${node.getName()} laterality is inconsistent with its mirroring provenance`,
          );
        }
        if (
          (expectedMirroring && bounds.min[0] <= 0) ||
          (!expectedMirroring && bounds.max[0] >= 0)
        ) {
          lateralityNodeErrors.push(
            `${node.getName()} laterality is inconsistent with its spatial x position`,
          );
        }
      }
    }
    for (const mesh of meshes) {
      const geometry = flattenMeshGeometry(mesh);
      hipMeshGeometry.push(geometry);
      triangleCount += geometry.indices.length / 3;
      if (computeSignedVolume(geometry.positions, geometry.indices) <= 0) {
        negativeSignedVolumeCount += 1;
        errors.push(
          `${groupName}/${mesh.getName()} has non-positive signed volume`,
        );
      }
      let meshClosed = true;
      for (const primitive of mesh.listPrimitives()) {
        const result = validatePrimitive(
          primitive,
          `${groupName}/${mesh.getName()}`,
          errors,
        );
        meshClosed &&= result.closed;
        nonFiniteAccessorCount += result.nonFinite;
      }
      if (meshClosed) closedMeshCount += 1;
    }
  }
  errors.push(...lateralityNodeErrors);
  if (provenance.artifacts.hip.includedBoneCount !== meshCount) {
    errors.push(
      "Hip recorded bone count differs from the committed mesh count",
    );
  }
  for (const kind of ["femur", "patella", "tibia-fibula", "foot"]) {
    if (
      !mirroredBounds(groupBounds[`left-${kind}`], groupBounds[`right-${kind}`])
    ) {
      errors.push(`${kind} left/right bounds are not mirrored within 0.5 mm`);
    }
  }
  const hipOverall = boundsForMeshes(
    [...hipGroups.values()].flatMap(meshesUnder),
  );
  errors.push(
    ...validateBoundsAgainstBaselines("hip", {
      groupBounds,
      overallBounds: hipOverall,
    }),
  );
  if (meshCount !== EXPECTED_ASSET_BASELINES.hip.meshCount)
    errors.push("Hip mesh count differs from the pinned baseline");
  if (triangleCount !== EXPECTED_ASSET_BASELINES.hip.triangleCount)
    errors.push("Hip triangle count differs from the pinned baseline");
  const duplicateGeometry = findDuplicateGeometryFingerprints(hipMeshGeometry);
  if (duplicateGeometry.length)
    errors.push(
      `Hip contains duplicate geometry: ${JSON.stringify(duplicateGeometry)}`,
    );

  let referenceMidpoint;
  let pivotsInProximalRegion = false;
  let lateralityVerified = false;
  if (hipPivots) {
    referenceMidpoint = [0, 1, 2].map(
      (axis) => (hipPivots.left[axis] + hipPivots.right[axis]) / 2,
    );
    if (!approximatelyEqual(referenceMidpoint, [0, 0, 0], 0.01))
      errors.push("Bilateral hip reference midpoint is not the root origin");
    if (
      !approximatelyEqual(hipPivots.left, [
        -hipPivots.right[0],
        hipPivots.right[1],
        hipPivots.right[2],
      ])
    ) {
      errors.push("Hip pivots do not mirror within 0.5 mm");
    }
    if (
      Math.abs(hipPivots.left[1]) > 0.01 ||
      Math.abs(hipPivots.left[2]) > 0.01 ||
      Math.abs(hipPivots.right[1]) > 0.01 ||
      Math.abs(hipPivots.right[2]) > 0.01 ||
      hipPivots.left[0] < 84 ||
      hipPivots.left[0] > 87 ||
      hipPivots.right[0] > -84 ||
      hipPivots.right[0] < -87
    ) {
      errors.push(
        "Centred proximal hip pivots differ from the pinned baseline",
      );
    }
    pivotsInProximalRegion =
      validatePivotCandidateRegion(
        hipPivots.left,
        groupBounds["left-femur"],
        "left",
      ) &&
      validatePivotCandidateRegion(
        hipPivots.right,
        groupBounds["right-femur"],
        "right",
      );
    if (!pivotsInProximalRegion)
      errors.push(
        "Hip pivot lies outside the proximal femoral-head candidate region",
      );

    const sourceRightPivot =
      hipRootExtras?.centeringTransform?.sourceHipPivotsAppMm?.right;
    const sourceLeftPivot =
      hipRootExtras?.centeringTransform?.sourceHipPivotsAppMm?.left;
    const lateralityErrors = validateLateralityEvidence({
      sourceRightPivot,
      rightPivot: hipPivots.right,
      leftPivot: hipPivots.left,
      rightBounds: groupBounds["right-femur"],
      leftBounds: groupBounds["left-femur"],
    });
    lateralityVerified =
      lateralityErrors.length === 0 && lateralityNodeErrors.length === 0;
    errors.push(...lateralityErrors);
    const sourceMidpoint =
      hipRootExtras?.centeringTransform?.sourceHipMidpointAppMm;
    const translation = hipRootExtras?.centeringTransform?.appliedTranslationMm;
    if (
      !approximatelyEqual(
        sourceRightPivot || [],
        [-85.5837, -5.28591, 859.02839],
      ) ||
      !approximatelyEqual(
        sourceLeftPivot || [],
        [85.5837, -5.28591, 859.02839],
      ) ||
      !approximatelyEqual(sourceMidpoint || [], [0, -5.28591, 859.02839]) ||
      !approximatelyEqual(translation || [], [0, 5.28591, -859.02839]) ||
      !approximatelyEqual(
        hipRootExtras?.referenceMidpoint || [],
        [0, 0, 0],
        0.01,
      )
    ) {
      errors.push(
        "Recorded hip centring transform differs from the pinned source fit",
      );
    }
  }
  const hipSceneRoot = hipDocument.getRoot().listScenes()[0]?.listChildren()[0];
  if (!hipSceneRoot || !hasIdentityWorldMatrix(hipSceneRoot))
    errors.push("Detailed anatomy root transform is not identity");

  const regionalArtifact = provenance.artifacts.regional;
  const regionalGroups = collectSemanticGroups(regionalDocument);
  const regionalGroupNames = [...regionalGroups.keys()].sort(
    (left, right) =>
      EXPECTED_REGIONAL_GROUPS.indexOf(left) -
      EXPECTED_REGIONAL_GROUPS.indexOf(right),
  );
  if (
    JSON.stringify(regionalGroupNames) !==
    JSON.stringify(EXPECTED_REGIONAL_GROUPS)
  ) {
    errors.push(
      `Regional semantic groups differ: ${regionalGroupNames.join(", ")}`,
    );
  }
  const regionalRootExtras = regionalDocument.getRoot().getExtras().orthoFluoro;
  const regionalSceneRoot = regionalDocument
    .getRoot()
    .listScenes()[0]
    ?.listChildren()[0];
  const regionalRootTransformIsIdentity = Boolean(
    regionalSceneRoot && hasIdentityWorldMatrix(regionalSceneRoot),
  );
  if (!regionalRootTransformIsIdentity)
    errors.push("Regional anatomy root transform is not identity");
  if (
    regionalArtifact.projectionEligible !== false ||
    regionalRootExtras?.projectionEligible !== false
  ) {
    errors.push("Regional anatomy must not be projection eligible");
  }

  const regionalGroupBounds = {};
  const regionalGeometry = [];
  const regionalSourceKeys = new Set();
  const regionalNodesBySourceKey = new Map();
  const regionalSourcesByCategory = Object.fromEntries(
    Object.keys(EXPECTED_REGIONAL_SOURCE_CATEGORY_COUNTS).map((category) => [
      category,
      new Set(),
    ]),
  );
  const regionalRuntimeCategoryCounts = Object.fromEntries(
    Object.keys(EXPECTED_REGIONAL_RUNTIME_CATEGORY_COUNTS).map((category) => [
      category,
      0,
    ]),
  );
  let regionalMeshCount = 0;
  let regionalNonFiniteAccessorCount = 0;
  let regionalOpenMeshCount = 0;
  let regionalTriangleCount = 0;
  let regionalWindingNormalInconsistencyCount = 0;
  let regionalDegenerateTriangleCount = 0;
  for (const [groupName, groupNode] of regionalGroups) {
    const meshes = meshesUnder(groupNode);
    const meshNodes = meshNodesUnder(groupNode);
    regionalMeshCount += meshes.length;
    regionalGroupBounds[groupName] = boundsForMeshes(meshes);
    const recordedBounds = regionalArtifact.groupBounds?.[groupName];
    if (
      !recordedBounds ||
      !approximatelyEqual(
        regionalGroupBounds[groupName].min,
        recordedBounds.min,
      ) ||
      !approximatelyEqual(
        regionalGroupBounds[groupName].max,
        recordedBounds.max,
      )
    ) {
      errors.push(`${groupName} bounds differ from provenance`);
    }
    const expectedSide = groupName.replace("regional-", "");
    for (const node of meshNodes) {
      const extras = node.getExtras();
      const category = extras.anatomyCategory;
      const sourceKey = extras.sourceKey;
      const expectedMirroring = expectedSide === "left";
      if (
        extras.anatomyGroup !== groupName ||
        extras.anatomySide !== expectedSide ||
        extras.derivedByMirroring !== expectedMirroring
      ) {
        errors.push(`${node.getName()} has inconsistent regional laterality`);
      }
      if (
        typeof category !== "string" ||
        !(category in EXPECTED_REGIONAL_SOURCE_CATEGORY_COUNTS) ||
        typeof extras.sourceName !== "string" ||
        typeof sourceKey !== "string" ||
        sourceKey !== `${category}/${extras.sourceName}`
      ) {
        errors.push(`${node.getName()} has invalid regional source metadata`);
      } else {
        regionalSourceKeys.add(sourceKey);
        regionalSourcesByCategory[category].add(sourceKey);
        regionalRuntimeCategoryCounts[category] += 1;
        const sourceNodes = regionalNodesBySourceKey.get(sourceKey) || [];
        sourceNodes.push(node);
        regionalNodesBySourceKey.set(sourceKey, sourceNodes);
      }
    }
    for (const mesh of meshes) {
      const geometry = flattenMeshGeometry(mesh);
      regionalGeometry.push(geometry);
      regionalTriangleCount += geometry.indices.length / 3;
      let meshClosed = true;
      for (const primitive of mesh.listPrimitives()) {
        const result = validatePrimitive(
          primitive,
          `${groupName}/${mesh.getName()}`,
          errors,
          { requireClosed: false, requireConsistentNormals: false },
        );
        meshClosed &&= result.closed;
        regionalNonFiniteAccessorCount += result.nonFinite;
        regionalWindingNormalInconsistencyCount += result.windingErrors;
        regionalDegenerateTriangleCount += result.degenerateTriangles;
      }
      if (!meshClosed) regionalOpenMeshCount += 1;
    }
  }
  const regionalSourceCategoryCounts = Object.fromEntries(
    Object.entries(regionalSourcesByCategory).map(([category, keys]) => [
      category,
      keys.size,
    ]),
  );
  if (
    !numericRecordEqual(
      regionalSourceCategoryCounts,
      EXPECTED_REGIONAL_SOURCE_CATEGORY_COUNTS,
    ) ||
    !numericRecordEqual(
      regionalArtifact.sourceCategoryCounts,
      EXPECTED_REGIONAL_SOURCE_CATEGORY_COUNTS,
    )
  ) {
    errors.push("Regional source category counts differ from pinned source");
  }
  if (
    !numericRecordEqual(
      regionalRuntimeCategoryCounts,
      EXPECTED_REGIONAL_RUNTIME_CATEGORY_COUNTS,
    ) ||
    !numericRecordEqual(
      regionalArtifact.runtimeCategoryCounts,
      EXPECTED_REGIONAL_RUNTIME_CATEGORY_COUNTS,
    )
  ) {
    errors.push("Regional runtime category counts differ from pinned source");
  }
  if (
    regionalSourceKeys.size !== 418 ||
    regionalArtifact.sourceCount !== 418 ||
    regionalMeshCount !== EXPECTED_ASSET_BASELINES.regional.meshCount ||
    regionalArtifact.meshCount !== EXPECTED_ASSET_BASELINES.regional.meshCount
  ) {
    errors.push("Regional source or mesh count differs from pinned source");
  }
  let mirroredPairCount = 0;
  let mirroredPairsVerified = true;
  const regionalSourceManifest = [];
  for (const [sourceKey, nodes] of regionalNodesBySourceKey) {
    const bySide = new Map(
      nodes.map((node) => [node.getExtras().anatomySide, node]),
    );
    const isMirroredPair = bySide.has("left") && bySide.has("right");
    regionalSourceManifest.push({
      key: sourceKey,
      side: isMirroredPair ? "right" : "midline",
    });
    if (isMirroredPair) {
      mirroredPairCount += 1;
      if (
        nodes.length !== 2 ||
        !bySide.has("left") ||
        !bySide.has("right") ||
        !validateMirroredNodePair(bySide.get("left"), bySide.get("right"))
      ) {
        mirroredPairsVerified = false;
        errors.push(`${sourceKey} is not a correctly wound mirrored pair`);
      }
    } else if (nodes.length !== 1 || !bySide.has("midline")) {
      mirroredPairsVerified = false;
      errors.push(`${sourceKey} is not a single midline regional structure`);
    }
  }
  if (mirroredPairCount !== 399) {
    mirroredPairsVerified = false;
    errors.push("Regional mirrored-pair count differs from pinned source");
  }
  const sourceManifestErrors = validateRegionalSourceManifest(
    regionalSourceManifest,
  );
  const sourceManifestVerified = sourceManifestErrors.length === 0;
  errors.push(...sourceManifestErrors);
  if (regionalWindingNormalInconsistencyCount !== 0) {
    errors.push(
      "Regional anatomy contains non-degenerate winding/normal inconsistencies",
    );
  }
  const regionalDuplicateGeometry =
    findDuplicateGeometryFingerprints(regionalGeometry);
  if (regionalDuplicateGeometry.length) {
    errors.push(
      `Regional anatomy contains duplicate geometry: ${JSON.stringify(regionalDuplicateGeometry)}`,
    );
  }
  const crossArtifactDuplicateGeometry = findDuplicateGeometryFingerprints([
    ...hipMeshGeometry.map((geometry) => ({
      ...geometry,
      name: `hip/${geometry.name}`,
    })),
    ...regionalGeometry.map((geometry) => ({
      ...geometry,
      name: `regional/${geometry.name}`,
    })),
  ]).filter(
    ([first, second]) => first.startsWith("hip/") !== second.startsWith("hip/"),
  );
  if (crossArtifactDuplicateGeometry.length) {
    errors.push(
      `Base and regional supplement contain duplicate geometry: ${JSON.stringify(crossArtifactDuplicateGeometry)}`,
    );
  }
  const regionalOverall = boundsForMeshes(
    [...regionalGroups.values()].flatMap(meshesUnder),
  );
  errors.push(
    ...validateBoundsAgainstBaselines("regional", {
      groupBounds: regionalGroupBounds,
      overallBounds: regionalOverall,
    }),
  );
  if (regionalMeshCount !== EXPECTED_ASSET_BASELINES.regional.meshCount)
    errors.push("Regional mesh count differs from the pinned baseline");
  if (
    regionalTriangleCount !== EXPECTED_ASSET_BASELINES.regional.triangleCount
  ) {
    errors.push("Regional triangle count differs from the pinned baseline");
  }
  if (
    !Object.values(regionalGroupBounds)
      .flatMap((bounds) => [...bounds.min, ...bounds.max])
      .every(Number.isFinite) ||
    ![...regionalOverall.min, ...regionalOverall.max].every(Number.isFinite) ||
    [...regionalOverall.min, ...regionalOverall.max].some(
      (value) => Math.abs(value) > 2_000,
    )
  ) {
    errors.push(
      "Regional anatomy bounds are not finite millimetre coordinates",
    );
  }

  const regionalHipPivots = regionalRootExtras?.hipPivots;
  const regionalReferenceMidpoint = regionalRootExtras?.referenceMidpoint;
  if (
    !regionalHipPivots ||
    !approximatelyEqual(regionalHipPivots.left || [], hipPivots?.left || []) ||
    !approximatelyEqual(
      regionalHipPivots.right || [],
      hipPivots?.right || [],
    ) ||
    !approximatelyEqual(
      regionalArtifact.hipPivots?.left || [],
      regionalHipPivots.left || [],
    ) ||
    !approximatelyEqual(
      regionalArtifact.hipPivots?.right || [],
      regionalHipPivots.right || [],
    )
  ) {
    errors.push("Regional hip pivots do not match the skeletal base");
  }
  if (!approximatelyEqual(regionalReferenceMidpoint || [], [0, 0, 0], 0.01))
    errors.push("Regional reference midpoint is not the root origin");

  let regionalMaterialsOpaqueAndLocal = true;
  const regionalMaterials = regionalDocument.getRoot().listMaterials();
  if (regionalMaterials.length !== 10) regionalMaterialsOpaqueAndLocal = false;
  for (const material of regionalMaterials) {
    const match = /^Opaque regional (.+)$/.exec(material.getName());
    const expected = match ? EXPECTED_REGIONAL_MATERIALS[match[1]] : null;
    if (
      !expected ||
      material.getAlphaMode() !== "OPAQUE" ||
      material.getBaseColorFactor()[3] !== 1 ||
      material.getBaseColorTexture() ||
      !approximatelyEqual(material.getBaseColorFactor(), expected, 0.0001)
    ) {
      regionalMaterialsOpaqueAndLocal = false;
    }
  }
  if (!regionalMaterialsOpaqueAndLocal)
    errors.push("Regional materials are not opaque app-owned local materials");
  const regionalJson = readGlbJSON(regionalBytes);
  const regionalNonAnatomicalResourceCount =
    (regionalJson.cameras?.length || 0) +
    (regionalJson.animations?.length || 0) +
    (regionalJson.skins?.length || 0) +
    (regionalJson.images?.length || 0) +
    (regionalJson.textures?.length || 0) +
    (regionalJson.extensions?.KHR_lights_punctual?.lights?.length || 0);
  if (regionalNonAnatomicalResourceCount !== 0) {
    errors.push(
      "Regional anatomy contains cameras, lights, animation, skin, or texture resources",
    );
  }

  const hipSourceKeys = new Set(
    [...hipGroups.values()]
      .flatMap(meshNodesUnder)
      .map((node) => `Bones/${node.getExtras().sourceName}`),
  );
  const sourceOverlap = [...hipSourceKeys].filter((key) =>
    regionalSourceKeys.has(key),
  );
  if (sourceOverlap.length)
    errors.push("Base and supplement source accounting overlap");
  const recordedHipSourceKeys = new Set(
    regionalArtifact ? provenance.artifacts.hip.sourceKeys : [],
  );
  const recordedRegionalSourceKeys = new Set(regionalArtifact.sourceKeys || []);
  const recordedSourceOverlap = [...recordedHipSourceKeys].filter((key) =>
    recordedRegionalSourceKeys.has(key),
  );
  if (recordedSourceOverlap.length)
    errors.push("Recorded base and supplement source accounting overlap");
  const accountingEntries = provenance.lowerLimbSourceAccounting || [];
  const accountingKeys = new Set(accountingEntries.map((entry) => entry.key));
  const accountedBaseKeys = new Set(
    accountingEntries
      .filter((entry) => entry.disposition === "base")
      .map((entry) => entry.key),
  );
  const accountedRegionalKeys = new Set(
    accountingEntries
      .filter((entry) => entry.disposition === "supplement")
      .map((entry) => entry.key),
  );
  const recordedSourceManifestErrors = validateRegionalSourceManifest(
    accountingEntries
      .filter((entry) => entry.disposition === "supplement")
      .map((entry) => ({
        key: entry.key,
        side: entry.classification?.side,
      })),
  );
  errors.push(
    ...recordedSourceManifestErrors.map(
      (error) => `Recorded ${error.toLowerCase()}`,
    ),
  );
  const setsEqual = (left, right) =>
    left.size === right.size && [...left].every((value) => right.has(value));
  const sourceAccountingVerified =
    accountingEntries.length === 452 &&
    accountingKeys.size === 452 &&
    accountedBaseKeys.size === 34 &&
    accountedRegionalKeys.size === 418 &&
    setsEqual(hipSourceKeys, recordedHipSourceKeys) &&
    setsEqual(hipSourceKeys, accountedBaseKeys) &&
    setsEqual(regionalSourceKeys, recordedRegionalSourceKeys) &&
    setsEqual(regionalSourceKeys, accountedRegionalKeys) &&
    recordedSourceManifestErrors.length === 0 &&
    sourceOverlap.length === 0 &&
    recordedSourceOverlap.length === 0;
  if (!sourceAccountingVerified)
    errors.push(
      "Lower-limb base and supplement source accounting is incomplete",
    );

  const overviewGroups = collectSemanticGroups(overviewDocument);
  const overviewNames = [...overviewGroups.keys()].sort();
  if (
    JSON.stringify(overviewNames) !==
    JSON.stringify(["overview-left", "overview-midline", "overview-right"])
  ) {
    errors.push(`Overview semantic groups differ: ${overviewNames.join(", ")}`);
  }
  const overviewGroupBounds = Object.fromEntries(
    [...overviewGroups].map(([name, node]) => [
      name,
      boundsForMeshes(meshesUnder(node)),
    ]),
  );
  const overviewLeft = overviewGroupBounds["overview-left"];
  const overviewRight = overviewGroupBounds["overview-right"];
  if (!mirroredBounds(overviewLeft, overviewRight))
    errors.push("Overview left/right bounds are not mirrored");
  if (
    overviewDocument.getRoot().listScenes().length !== 1 ||
    overviewDocument.getRoot().listScenes()[0].listChildren().length !== 1
  ) {
    errors.push("Overview artifact does not have one valid scene root");
  }
  const overviewMeshes = [...overviewGroups.values()].flatMap(meshesUnder);
  const overviewMeshGeometry = [];
  let overviewClosedMeshCount = 0;
  let overviewNonFiniteAccessorCount = 0;
  let overviewTriangleCount = 0;
  let overviewNegativeSignedVolumeCount = 0;
  for (const mesh of overviewMeshes) {
    const geometry = flattenMeshGeometry(mesh);
    overviewMeshGeometry.push(geometry);
    overviewTriangleCount += geometry.indices.length / 3;
    if (computeSignedVolume(geometry.positions, geometry.indices) <= 0) {
      overviewNegativeSignedVolumeCount += 1;
      errors.push(`overview/${mesh.getName()} has non-positive signed volume`);
    }
    let meshClosed = true;
    for (const primitive of mesh.listPrimitives()) {
      const result = validatePrimitive(
        primitive,
        `overview/${mesh.getName()}`,
        errors,
      );
      meshClosed &&= result.closed;
      overviewNonFiniteAccessorCount += result.nonFinite;
    }
    if (meshClosed) overviewClosedMeshCount += 1;
  }
  if (
    provenance.artifacts.overview.includedBoneCount !== overviewMeshes.length
  ) {
    errors.push(
      "Overview recorded bone count differs from the committed mesh count",
    );
  }
  const overviewOverall = boundsForMeshes(overviewMeshes);
  errors.push(
    ...validateBoundsAgainstBaselines("overview", {
      groupBounds: overviewGroupBounds,
      overallBounds: overviewOverall,
    }),
  );
  if (overviewMeshes.length !== EXPECTED_ASSET_BASELINES.overview.meshCount)
    errors.push("Overview mesh count differs from the pinned baseline");
  if (overviewTriangleCount !== EXPECTED_ASSET_BASELINES.overview.triangleCount)
    errors.push("Overview triangle count differs from the pinned baseline");
  const overviewDuplicateGeometry =
    findDuplicateGeometryFingerprints(overviewMeshGeometry);
  if (overviewDuplicateGeometry.length)
    errors.push(
      `Overview contains duplicate geometry: ${JSON.stringify(overviewDuplicateGeometry)}`,
    );

  for (const document of [overviewDocument, hipDocument]) {
    for (const material of document.getRoot().listMaterials()) {
      if (
        material.getAlphaMode() !== "OPAQUE" ||
        material.getBaseColorFactor()[3] !== 1 ||
        material.getBaseColorTexture()
      ) {
        errors.push(
          `${material.getName()} is not an opaque, untextured bone material`,
        );
      }
    }
  }

  return {
    errors,
    sourceIdentityVerified,
    sourceAccountingVerified,
    recordedBuildHashesVerified,
    dracoLicenseVerified,
    hip: {
      groups: groupNames,
      meshCount,
      recordedBoneCount: provenance.artifacts.hip.includedBoneCount,
      closedMeshCount,
      nonFiniteAccessorCount,
      hipPivots,
      referenceMidpoint,
      pivotsInProximalRegion,
      lateralityVerified,
      duplicateGeometryCount: duplicateGeometry.length,
      negativeSignedVolumeCount,
      triangleCount,
      bounds: hipOverall,
      sourceKeys: provenance.artifacts.hip.sourceKeys,
    },
    regional: {
      groups: regionalGroupNames,
      meshCount: regionalMeshCount,
      sourceCount: regionalSourceKeys.size,
      sourceKeys: regionalArtifact.sourceKeys,
      sourceCategoryCounts: regionalSourceCategoryCounts,
      runtimeCategoryCounts: regionalRuntimeCategoryCounts,
      nonFiniteAccessorCount: regionalNonFiniteAccessorCount,
      openMeshCount: regionalOpenMeshCount,
      triangleCount: regionalTriangleCount,
      windingNormalInconsistencyCount: regionalWindingNormalInconsistencyCount,
      degenerateTriangleCount: regionalDegenerateTriangleCount,
      duplicateGeometryCount: regionalDuplicateGeometry.length,
      crossArtifactDuplicateGeometryCount:
        crossArtifactDuplicateGeometry.length,
      mirroredPairCount,
      mirroredPairsVerified,
      sourceManifestVerified,
      materialsOpaqueAndLocal: regionalMaterialsOpaqueAndLocal,
      nonAnatomicalResourceCount: regionalNonAnatomicalResourceCount,
      projectionEligible: regionalArtifact.projectionEligible,
      hipPivots: regionalHipPivots,
      referenceMidpoint: regionalReferenceMidpoint,
      rootTransformIsIdentity: regionalRootTransformIsIdentity,
      bounds: regionalOverall,
      groupBounds: regionalGroupBounds,
    },
    overview: {
      groups: overviewNames,
      meshCount: overviewMeshes.length,
      closedMeshCount: overviewClosedMeshCount,
      nonFiniteAccessorCount: overviewNonFiniteAccessorCount,
      duplicateGeometryCount: overviewDuplicateGeometry.length,
      negativeSignedVolumeCount: overviewNegativeSignedVolumeCount,
      triangleCount: overviewTriangleCount,
      bounds: overviewOverall,
      leftBounds: overviewLeft,
      rightBounds: overviewRight,
    },
  };
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const report = await validateCommittedAnatomy(process.cwd());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.errors.length) process.exitCode = 1;
}
