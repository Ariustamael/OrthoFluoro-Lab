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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
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

function pointInBounds(point, bounds, tolerance = 0.5) {
  return point.every(
    (value, axis) =>
      value >= bounds.min[axis] - tolerance &&
      value <= bounds.max[axis] + tolerance,
  );
}

export async function validateCommittedAnatomy(repositoryRoot) {
  const errors = [];
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
    if (bytes.byteLength !== artifact.bytes)
      errors.push(`${name} byte count differs from provenance`);
    if (sha256(bytes) !== artifact.sha256)
      errors.push(`${name} checksum differs from provenance`);
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
  if (
    provenance.deterministicBuild?.verified !== true ||
    provenance.deterministicBuild?.repetitions !== 2
  ) {
    errors.push("Deterministic repeated-build verification is absent");
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
  let meshCount = 0;
  let closedMeshCount = 0;
  let nonFiniteAccessorCount = 0;
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
    for (const mesh of meshes) {
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
  const pelvis = groupBounds.pelvis;
  const hipOverall = boundsForMeshes(
    [...hipGroups.values()].flatMap(meshesUnder),
  );
  if (!(
    hipOverall.min[0] < -100 &&
    hipOverall.max[0] > 100 &&
    hipOverall.min[2] >= 0 &&
    hipOverall.max[2] > 900 &&
    hipOverall.max[2] < 1100 &&
    hipOverall.max[1] - hipOverall.min[1] > 100 &&
    hipOverall.max[1] - hipOverall.min[1] < 250
  )) {
    errors.push(
      "Hip artifact bounds are inconsistent with millimetres/app axes",
    );
  }
  if (!pelvis || pelvis.min[2] < 750 || pelvis.max[2] > 1100) {
    errors.push(
      "Pelvis bounds are inconsistent with the recorded headward axis",
    );
  }
  if (hipPivots) {
    if (
      !pointInBounds(hipPivots.left, groupBounds["left-femur"]) ||
      !pointInBounds(hipPivots.right, groupBounds["right-femur"])
    ) {
      errors.push("Hip pivot lies outside proximal femur bounds");
    }
    if (
      !approximatelyEqual(hipPivots.left, [
        -hipPivots.right[0],
        hipPivots.right[1],
        hipPivots.right[2],
      ])
    ) {
      errors.push("Hip pivots do not mirror within 0.5 mm");
    }
  }

  const overviewGroups = collectSemanticGroups(overviewDocument);
  const overviewNames = [...overviewGroups.keys()].sort();
  if (
    JSON.stringify(overviewNames) !==
    JSON.stringify(["overview-left", "overview-midline", "overview-right"])
  ) {
    errors.push(`Overview semantic groups differ: ${overviewNames.join(", ")}`);
  }
  const overviewLeft = boundsForMeshes(
    meshesUnder(overviewGroups.get("overview-left")),
  );
  const overviewRight = boundsForMeshes(
    meshesUnder(overviewGroups.get("overview-right")),
  );
  if (!mirroredBounds(overviewLeft, overviewRight))
    errors.push("Overview left/right bounds are not mirrored");
  if (
    overviewDocument.getRoot().listScenes().length !== 1 ||
    overviewDocument.getRoot().listScenes()[0].listChildren().length !== 1
  ) {
    errors.push("Overview artifact does not have one valid scene root");
  }
  const overviewMeshes = [...overviewGroups.values()].flatMap(meshesUnder);
  let overviewClosedMeshCount = 0;
  let overviewNonFiniteAccessorCount = 0;
  for (const mesh of overviewMeshes) {
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
    hip: {
      groups: groupNames,
      meshCount,
      recordedBoneCount: provenance.artifacts.hip.includedBoneCount,
      closedMeshCount,
      nonFiniteAccessorCount,
      hipPivots,
      bounds: hipOverall,
    },
    overview: {
      groups: overviewNames,
      meshCount: overviewMeshes.length,
      closedMeshCount: overviewClosedMeshCount,
      nonFiniteAccessorCount: overviewNonFiniteAccessorCount,
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
