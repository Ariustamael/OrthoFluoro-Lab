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
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
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
        `${assetName} ${groupName} bounds differ from the pinned baseline`,
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
    errors.push(`${assetName} overall bounds differ from the pinned baseline`);
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

function approximatelyEqual(actual, expected, tolerance = 0.5) {
  return actual.every(
    (value, index) => Math.abs(value - expected[index]) <= tolerance,
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

function validatePrimitive(primitive, meshName, errors) {
  const positionAccessor = primitive.getAttribute("POSITION");
  const normalAccessor = primitive.getAttribute("NORMAL");
  const indexAccessor = primitive.getIndices();
  if (!positionAccessor || !normalAccessor || !indexAccessor) {
    errors.push(`${meshName} lacks indexed positions or normals`);
    return { closed: false, nonFinite: 0, windingErrors: 0 };
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
    if (
      face.reduce((sum, value, axis) => sum + value * averageNormal[axis], 0) <
      -1e-7
    ) {
      windingErrors += 1;
    }
  }
  const badEdges = [...edges.values()].filter((count) => count !== 2).length;
  if (badEdges)
    errors.push(
      `${meshName} is not closed (${badEdges} non-manifold boundary edges)`,
    );
  if (windingErrors)
    errors.push(
      `${meshName} has ${windingErrors} winding/normal inconsistencies`,
    );
  return { closed: badEdges === 0, nonFinite, windingErrors };
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
  const indices = [];
  for (const primitive of mesh.listPrimitives()) {
    const primitivePositions = primitive.getAttribute("POSITION").getArray();
    const primitiveIndices = primitive.getIndices().getArray();
    const vertexOffset = positions.length / 3;
    positions.push(...primitivePositions);
    indices.push(...[...primitiveIndices].map((index) => index + vertexOffset));
  }
  return { name: mesh.getName(), positions, indices };
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
  const [overviewBytes, hipBytes] = await Promise.all([
    readFile(overviewPath),
    readFile(hipPath),
  ]);
  for (const [name, bytes] of [
    ["overview", overviewBytes],
    ["hip", hipBytes],
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
  const [overviewDocument, hipDocument] = await Promise.all([
    io.read(overviewPath),
    io.read(hipPath),
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
