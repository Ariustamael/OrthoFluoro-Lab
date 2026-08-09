import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Accessor, Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, prune } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { unzipSync } from "fflate";

import {
  appPointFromSource,
  centerHipReference,
  fitSphere,
  selectFemoralHeadCandidates,
} from "./anatomy-build-logic.mjs";
import { SOURCE_ASSETS } from "./source-registry.mjs";
import { validateCommittedAnatomy } from "./validate-anatomy-assets.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_OUTPUT_ROOT = join(REPOSITORY_ROOT, "public");
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000;
const RETRIEVED_DATE = "2026-08-04";
const LICENCE = Object.freeze({
  id: "CC-BY-SA-4.0",
  name: "Creative Commons Attribution-ShareAlike 4.0 International",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
});
const ATTRIBUTION =
  "Open3DModel - Skeleton by the Open3D project, George J.R. Maat (LUMC), Eungyeol Lee (LUMC) et al.; Open3DModel - Lower limb by the Open3D project, Jan Kooloos (RadboudUMC), Eungyeol Lee (LUMC) et al.; via AnatomyTOOL.org, CC BY-SA 4.0.";
const PROJECT_URL = "https://anatomytool.org/open3dmodel";
const SOURCE_PAGE_URL = "https://anatomytool.org/open3dmodel-create";
const DRACO_LICENSE = Object.freeze({
  bytes: 13_898,
  id: "Apache-2.0",
  sha256: "D3709B0FB4B8A94BBB1D02B8A2E484F258B0D9C5C5A01F940391F3FE662CD1A4",
  sourceUrl: "https://raw.githubusercontent.com/google/draco/1.5.7/LICENSE",
});

export const HIP_GROUPS = Object.freeze([
  "pelvis",
  "left-femur",
  "left-patella",
  "left-tibia-fibula",
  "left-foot",
  "right-femur",
  "right-patella",
  "right-tibia-fibula",
  "right-foot",
]);

export const REGIONAL_SOURCE_CATEGORIES = Object.freeze([
  "Cartilages",
  "Ligaments",
  "Muscles",
  "Fascia",
  "Arteries",
  "Veins",
  "Nerves",
  "Bursae",
  "Overlays",
]);
export const REGIONAL_CONTEXT_BONES = Object.freeze([
  "T12",
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
]);
export const REGIONAL_GROUPS = Object.freeze([
  "regional-midline",
  "regional-left",
  "regional-right",
]);
export const REGIONAL_MATERIALS = Object.freeze({
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

const REGIONAL_SOURCE_CATEGORY_SET = new Set(REGIONAL_SOURCE_CATEGORIES);
const REGIONAL_RIGHT_SOURCE_OVERRIDES = new Set([
  "Cartilages/Art cart of sacroiliac joint on hip bone",
  "Cartilages/Art cart of sacroiliac joint on sacrum",
  "Ligaments/Articular capsules of distal interphalangeal joints",
  "Ligaments/Bifurcatum ligament",
  "Muscles/Common tendon of Semitendinosus and Long head of biceps femoris",
  "Overlays/Quadriceps common tendon and patellar ligament",
]);
const EXCLUDED_LOWER_LIMB_BONE_NAMES = Object.freeze([
  "Thoracic vertebra (T12)",
  "Lumbar vertebra (L1)",
  "Lumbar vertebra (L2)",
  "Lumbar vertebra (L3)",
  "Lumbar vertebra (L4)",
  "Lumbar vertebra (L5)",
]);
const EXCLUDED_LOWER_LIMB_BONES = new Set(EXCLUDED_LOWER_LIMB_BONE_NAMES);
const REGIONAL_CONTEXT_BONE_NAMES = new Map([
  ...REGIONAL_CONTEXT_BONES.map((name) => [name, name]),
  ...EXCLUDED_LOWER_LIMB_BONE_NAMES.map((name, index) => [
    name,
    REGIONAL_CONTEXT_BONES[index],
  ]),
]);
const PELVIS_BONES = new Set(["Sacrum", "Coccyx", "Hip bone.r"]);
const LEG_BONES = new Map([
  ["Femur.r", "femur"],
  ["Patella.r", "patella"],
  ["Tibia.r", "tibia-fibula"],
  ["Fibula.r", "tibia-fibula"],
]);

function canonicalContextBoneName(name) {
  return REGIONAL_CONTEXT_BONE_NAMES.get(name) ?? null;
}

export function classifyRegionalSource(name, category) {
  const right =
    /\.r[\s\u200B]*$/u.test(name) ||
    REGIONAL_RIGHT_SOURCE_OVERRIDES.has(sourceAccountingKey(category, name));
  return {
    category,
    side: right ? "right" : "midline",
    mirrorToLeft: right,
  };
}

function mirroredRegionalName(name) {
  return name.replace(/\.r(?=[\s\u200B]*$)/u, ".l");
}

export function isRegionalSource(name, category) {
  return (
    REGIONAL_SOURCE_CATEGORY_SET.has(category) ||
    (category === "Bones" && canonicalContextBoneName(name) !== null)
  );
}

function sourceAccountingKey(category, name) {
  return `${category}/${name}`;
}

function isBaseLowerLimbSource(name, category) {
  if (category !== "Bones") return false;
  try {
    return classifyLowerLimbBone(name) !== null;
  } catch {
    return false;
  }
}

export function createRegionalSourceAccounting({
  anatomicalChildren,
  nonAnatomicalExclusions,
}) {
  const accounting = new Map();

  function record(entry) {
    const key = sourceAccountingKey(entry.category, entry.name);
    if (accounting.has(key)) {
      throw new Error(`Duplicate source accounting key: ${key}`);
    }
    accounting.set(key, entry);
  }

  for (const { category, name } of anatomicalChildren) {
    if (isRegionalSource(name, category)) {
      record({
        category,
        name,
        disposition: "supplement",
        classification: classifyRegionalSource(name, category),
      });
      continue;
    }
    if (isBaseLowerLimbSource(name, category)) {
      record({ category, name, disposition: "base" });
      continue;
    }
    throw new Error(
      `Unaccounted anatomical source child: ${sourceAccountingKey(category, name)}`,
    );
  }

  for (const { category, name, reason } of nonAnatomicalExclusions) {
    record({ category, name, disposition: "non-anatomical", reason });
  }

  return accounting;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function assertIdentityMatrix(node) {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const matrix = node.getWorldMatrix();
  if (matrix.some((value, index) => Math.abs(value - identity[index]) > 1e-8)) {
    throw new Error(
      `Source node ${node.getName()} has an unsupported transform`,
    );
  }
}

function exactChildMap(rootNode) {
  const map = new Map();
  for (const child of rootNode.listChildren()) {
    const name = child.getName();
    if (!name || map.has(name)) {
      throw new Error(
        `Missing or duplicate source node name: ${name || "<empty>"}`,
      );
    }
    if (!child.getMesh()) {
      throw new Error(`Source node ${name} does not contain a mesh`);
    }
    assertIdentityMatrix(child);
    map.set(name, child);
  }
  return map;
}

function findUniqueNode(document, name) {
  const matches = document
    .getRoot()
    .listNodes()
    .filter((node) => node.getName() === name);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one source node named ${name}; found ${matches.length}`,
    );
  }
  return matches[0];
}

function transformVec3Array(
  array,
  mirrorX,
  normal,
  positionOffset = [0, 0, 0],
) {
  const output = new Float32Array(array.length);
  for (let index = 0; index < array.length; index += 3) {
    let mapped;
    if (normal) {
      mapped = [array[index], array[index + 2], array[index + 1]];
      const length = Math.hypot(...mapped);
      if (!Number.isFinite(length) || length === 0) {
        throw new Error("Source contains an invalid normal");
      }
      mapped = mapped.map((value) => value / length);
    } else {
      mapped = appPointFromSource([
        array[index],
        array[index + 1],
        array[index + 2],
      ]);
    }
    output[index] = mirrorX ? -mapped[0] : mapped[0];
    output[index] -= normal ? 0 : positionOffset[0];
    output[index + 1] = mapped[1] - (normal ? 0 : positionOffset[1]);
    output[index + 2] = mapped[2] - (normal ? 0 : positionOffset[2]);
  }
  return output;
}

export function transformTriangleIndices(array, mirrorX) {
  if (array.length % 3 !== 0) {
    throw new Error("Source primitive is not triangular");
  }
  const IndexArray = array.constructor;
  const output = new IndexArray(array.length);
  for (let index = 0; index < array.length; index += 3) {
    output[index] = array[index];
    output[index + 1] = mirrorX ? array[index + 1] : array[index + 2];
    output[index + 2] = mirrorX ? array[index + 2] : array[index + 1];
  }
  return output;
}

function repairTriangleWinding(positions, normals, indices) {
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = [indices[index], indices[index + 1], indices[index + 2]];
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
    const alignment = face.reduce(
      (sum, value, axis) => sum + value * averageNormal[axis],
      0,
    );
    if (alignment < 0) {
      [indices[index + 1], indices[index + 2]] = [
        indices[index + 2],
        indices[index + 1],
      ];
    }
  }
  return indices;
}

function addBoneNode({
  document,
  buffer,
  material,
  parent,
  sourceNode,
  name,
  group,
  mirrorX,
  positionOffset = [0, 0, 0],
  extras = {},
}) {
  const targetMesh = document.createMesh(name);
  const sourceMesh = sourceNode.getMesh();
  for (const sourcePrimitive of sourceMesh.listPrimitives()) {
    const sourcePosition = sourcePrimitive.getAttribute("POSITION");
    const sourceNormal = sourcePrimitive.getAttribute("NORMAL");
    const sourceIndices = sourcePrimitive.getIndices();
    if (!sourcePosition || !sourceNormal || !sourceIndices) {
      throw new Error(
        `${sourceNode.getName()} must have positions, normals, and indices`,
      );
    }
    const positions = transformVec3Array(
      sourcePosition.getArray(),
      mirrorX,
      false,
      positionOffset,
    );
    const normals = transformVec3Array(sourceNormal.getArray(), mirrorX, true);
    const indices = repairTriangleWinding(
      positions,
      normals,
      transformTriangleIndices(sourceIndices.getArray(), mirrorX),
    );
    if (
      [positions, normals, indices].some((array) =>
        [...array].some((value) => !Number.isFinite(value)),
      )
    ) {
      throw new Error(
        `${sourceNode.getName()} contains non-finite accessor data`,
      );
    }
    const positionAccessor = document
      .createAccessor(`${name}:POSITION`)
      .setType(Accessor.Type.VEC3)
      .setArray(positions)
      .setBuffer(buffer);
    const normalAccessor = document
      .createAccessor(`${name}:NORMAL`)
      .setType(Accessor.Type.VEC3)
      .setArray(normals)
      .setBuffer(buffer);
    const indexAccessor = document
      .createAccessor(`${name}:INDICES`)
      .setType(Accessor.Type.SCALAR)
      .setArray(indices)
      .setBuffer(buffer);
    targetMesh.addPrimitive(
      document
        .createPrimitive()
        .setAttribute("POSITION", positionAccessor)
        .setAttribute("NORMAL", normalAccessor)
        .setIndices(indexAccessor)
        .setMaterial(material),
    );
  }
  const node = document
    .createNode(name)
    .setMesh(targetMesh)
    .setExtras({
      anatomyGroup: group,
      sourceName: sourceNode.getName(),
      derivedByMirroring: mirrorX,
      ...extras,
    });
  parent.addChild(node);
  return node;
}

function createTargetDocument(name, extras) {
  const document = new Document();
  const scene = document.createScene(name);
  const root = document.createNode(name).setExtras({ orthoFluoro: extras });
  const buffer = document.createBuffer("geometry");
  const material = document
    .createMaterial("Neutral opaque bone")
    .setBaseColorFactor([0.84, 0.82, 0.75, 1])
    .setRoughnessFactor(0.8)
    .setMetallicFactor(0);
  scene.addChild(root);
  document.getRoot().setExtras({ orthoFluoro: extras });
  return { document, root, buffer, material };
}

function createSemanticGroup(document, root, name) {
  const node = document.createNode(name).setExtras({ anatomyGroup: name });
  root.addChild(node);
  return node;
}

function boundsForNodes(nodes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of nodes) {
    for (const primitive of node.getMesh().listPrimitives()) {
      const array = primitive.getAttribute("POSITION").getArray();
      for (let index = 0; index < array.length; index += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], array[index + axis]);
          max[axis] = Math.max(max[axis], array[index + axis]);
        }
      }
    }
  }
  return { min, max };
}

function classifyLowerLimbBone(name) {
  if (PELVIS_BONES.has(name)) return "pelvis";
  if (LEG_BONES.has(name)) return LEG_BONES.get(name);
  if (EXCLUDED_LOWER_LIMB_BONES.has(name)) return null;
  if (!name.endsWith(".r")) {
    throw new Error(`Unclassified lower-limb bone: ${name}`);
  }
  return "foot";
}

function hipReferenceFromSourceBones(sourceBones) {
  const femurSource = sourceBones.get("Femur.r");
  if (!femurSource) throw new Error("Lower-limb source femur is absent");
  const femurPositions = femurSource
    .getMesh()
    .listPrimitives()
    .flatMap((primitive) => {
      const array = primitive.getAttribute("POSITION").getArray();
      const points = [];
      for (let index = 0; index < array.length; index += 3) {
        points.push(
          appPointFromSource([
            array[index],
            array[index + 1],
            array[index + 2],
          ]),
        );
      }
      return points;
    });
  const fitted = fitSphere(selectFemoralHeadCandidates(femurPositions));
  const sourceHipPivots = {
    left: [-fitted.center[0], fitted.center[1], fitted.center[2]],
    right: fitted.center,
  };
  const centredReference = centerHipReference(sourceHipPivots);
  return { sourceHipPivots, centredReference };
}

async function buildHipArtifact(sourceDocument, io) {
  const bonesRoot = findUniqueNode(sourceDocument, "Bones");
  const sourceBones = exactChildMap(bonesRoot);
  const classified = [...sourceBones].filter(([name]) =>
    classifyLowerLimbBone(name),
  );
  if (classified.length !== 34 || sourceBones.size !== 40) {
    throw new Error(
      `Unexpected lower-limb Bones structure: ${sourceBones.size} total, ${classified.length} included`,
    );
  }

  const { sourceHipPivots, centredReference } =
    hipReferenceFromSourceBones(sourceBones);
  const hipPivots = centredReference.hipPivots;
  const metadata = {
    artifact: "hip-lower-limbs",
    axes: { x: "patient-left", y: "anterior", z: "headward" },
    units: "millimetres",
    hipPivots,
    referenceMidpoint: [0, 0, 0],
    centeringTransform: {
      sourceHipPivotsAppMm: sourceHipPivots,
      sourceHipMidpointAppMm: centredReference.midpoint,
      appliedTranslationMm: centredReference.translation,
    },
  };
  const { document, root, buffer, material } = createTargetDocument(
    "Open3DModel Hip and Lower Limbs",
    metadata,
  );
  const groups = new Map(
    HIP_GROUPS.map((name) => [name, createSemanticGroup(document, root, name)]),
  );
  const groupNodes = new Map(HIP_GROUPS.map((name) => [name, []]));

  for (const [sourceName, sourceNode] of classified) {
    const kind = classifyLowerLimbBone(sourceName);
    if (kind === "pelvis") {
      const rightNode = addBoneNode({
        document,
        buffer,
        material,
        parent: groups.get("pelvis"),
        sourceNode,
        name: sourceName,
        group: "pelvis",
        mirrorX: false,
        positionOffset: centredReference.midpoint,
      });
      groupNodes.get("pelvis").push(rightNode);
      if (sourceName === "Hip bone.r") {
        const leftNode = addBoneNode({
          document,
          buffer,
          material,
          parent: groups.get("pelvis"),
          sourceNode,
          name: "Hip bone.l",
          group: "pelvis",
          mirrorX: true,
          positionOffset: centredReference.midpoint,
        });
        groupNodes.get("pelvis").push(leftNode);
      }
      continue;
    }
    for (const side of ["right", "left"]) {
      const groupName = `${side}-${kind}`;
      const mirrored = side === "left";
      const derivedName = mirrored
        ? sourceName.replace(/\.r$/, ".l")
        : sourceName;
      const node = addBoneNode({
        document,
        buffer,
        material,
        parent: groups.get(groupName),
        sourceNode,
        name: derivedName,
        group: groupName,
        mirrorX: mirrored,
        positionOffset: centredReference.midpoint,
      });
      groupNodes.get(groupName).push(node);
    }
  }

  const groupBounds = Object.fromEntries(
    HIP_GROUPS.map((name) => [name, boundsForNodes(groupNodes.get(name))]),
  );
  await document.transform(dedup(), prune(), draco({ method: "edgebreaker" }));
  const bytes = await io.writeBinary(document);
  const includedBoneCount = [...groupNodes.values()].reduce(
    (total, nodes) => total + nodes.length,
    0,
  );
  return {
    bytes,
    metadata,
    groupBounds,
    includedBoneCount,
    sourceKeys: classified.map(([name]) => sourceAccountingKey("Bones", name)),
  };
}

function createRegionalMaterials(document) {
  return new Map(
    Object.entries(REGIONAL_MATERIALS).map(([category, baseColorFactor]) => [
      category,
      document
        .createMaterial(`Opaque regional ${category}`)
        .setBaseColorFactor(baseColorFactor)
        .setRoughnessFactor(0.78)
        .setMetallicFactor(0),
    ]),
  );
}

async function buildRegionalArtifact(sourceDocument, io) {
  const sourceRoots = new Map();
  for (const category of ["Bones", ...REGIONAL_SOURCE_CATEGORIES]) {
    sourceRoots.set(
      category,
      exactChildMap(findUniqueNode(sourceDocument, category)),
    );
  }
  const anatomicalChildren = [...sourceRoots].flatMap(([category, children]) =>
    [...children.keys()].map((name) => ({ category, name })),
  );
  const accounting = createRegionalSourceAccounting({
    anatomicalChildren,
    nonAnatomicalExclusions: [],
  });
  if (accounting.size !== 452) {
    throw new Error(
      `Unexpected lower-limb source structure count: ${accounting.size}`,
    );
  }
  const supplementEntries = [...accounting].filter(
    ([, entry]) => entry.disposition === "supplement",
  );
  if (supplementEntries.length !== 418) {
    throw new Error(
      `Unexpected regional supplement source count: ${supplementEntries.length}`,
    );
  }

  const sourceBones = sourceRoots.get("Bones");
  const { sourceHipPivots, centredReference } =
    hipReferenceFromSourceBones(sourceBones);
  const metadata = {
    artifact: "hip-lower-limbs-regional",
    axes: { x: "patient-left", y: "anterior", z: "headward" },
    units: "millimetres",
    groups: REGIONAL_GROUPS,
    hipPivots: centredReference.hipPivots,
    referenceMidpoint: [0, 0, 0],
    centeringTransform: {
      sourceHipPivotsAppMm: sourceHipPivots,
      sourceHipMidpointAppMm: centredReference.midpoint,
      appliedTranslationMm: centredReference.translation,
    },
    projectionEligible: false,
  };
  const { document, root, buffer } = createTargetDocument(
    "Open3DModel Hip and Lower Limbs Regional",
    metadata,
  );
  const materials = createRegionalMaterials(document);
  const groups = new Map(
    REGIONAL_GROUPS.map((name) => [
      name,
      createSemanticGroup(document, root, name),
    ]),
  );
  const groupNodes = new Map(REGIONAL_GROUPS.map((name) => [name, []]));
  const runtimeCategoryCounts = Object.fromEntries(
    Object.keys(REGIONAL_MATERIALS).map((category) => [category, 0]),
  );

  for (const [key, entry] of supplementEntries) {
    const sourceNode = sourceRoots.get(entry.category).get(entry.name);
    const sides = entry.classification.mirrorToLeft
      ? ["right", "left"]
      : ["midline"];
    for (const side of sides) {
      const groupName = `regional-${side}`;
      const mirrorX = side === "left";
      const node = addBoneNode({
        document,
        buffer,
        material: materials.get(entry.category),
        parent: groups.get(groupName),
        sourceNode,
        name: mirrorX ? mirroredRegionalName(entry.name) : entry.name,
        group: groupName,
        mirrorX,
        positionOffset: centredReference.midpoint,
        extras: {
          anatomyCategory: entry.category,
          anatomySide: side,
          sourceKey: key,
        },
      });
      groupNodes.get(groupName).push(node);
      runtimeCategoryCounts[entry.category] += 1;
    }
  }

  const groupBounds = Object.fromEntries(
    REGIONAL_GROUPS.map((name) => [name, boundsForNodes(groupNodes.get(name))]),
  );
  const sourceCategoryCounts = Object.fromEntries(
    Object.keys(REGIONAL_MATERIALS).map((category) => [
      category,
      supplementEntries.filter(([, entry]) => entry.category === category)
        .length,
    ]),
  );
  await document.transform(dedup(), prune(), draco({ method: "edgebreaker" }));
  const bytes = await io.writeBinary(document);
  return {
    bytes,
    metadata,
    groupBounds,
    sourceKeys: supplementEntries.map(([key]) => key),
    sourceCategoryCounts,
    runtimeCategoryCounts,
    meshCount: [...groupNodes.values()].reduce(
      (total, nodes) => total + nodes.length,
      0,
    ),
    sourceAccounting: [...accounting].map(([key, entry]) => ({
      key,
      ...entry,
    })),
  };
}

async function buildOverviewArtifact(sourceDocument, io) {
  const midline = exactChildMap(findUniqueNode(sourceDocument, "Bones"));
  const right = exactChildMap(findUniqueNode(sourceDocument, "Bones_right"));
  const cartilage = findUniqueNode(sourceDocument, "Cartilages_right");
  if (
    midline.size !== 36 ||
    right.size !== 98 ||
    cartilage.listChildren().length !== 10
  ) {
    throw new Error(
      `Unexpected overview structure: ${midline.size} base bones, ${right.size} right bones, ${cartilage.listChildren().length} cartilages`,
    );
  }
  const metadata = {
    artifact: "overview-skeleton",
    axes: { x: "patient-left", y: "anterior", z: "headward" },
    units: "millimetres",
  };
  const { document, root, buffer, material } = createTargetDocument(
    "Open3DModel Overview Skeleton",
    metadata,
  );
  const groupNodes = new Map();
  for (const name of ["overview-midline", "overview-left", "overview-right"]) {
    groupNodes.set(name, {
      parent: createSemanticGroup(document, root, name),
      nodes: [],
    });
  }
  for (const [sourceName, sourceNode] of midline) {
    const group = groupNodes.get("overview-midline");
    group.nodes.push(
      addBoneNode({
        document,
        buffer,
        material,
        parent: group.parent,
        sourceNode,
        name: sourceName,
        group: "overview-midline",
        mirrorX: false,
      }),
    );
  }
  for (const [sourceName, sourceNode] of right) {
    for (const side of ["right", "left"]) {
      const groupName = `overview-${side}`;
      const mirrored = side === "left";
      const group = groupNodes.get(groupName);
      group.nodes.push(
        addBoneNode({
          document,
          buffer,
          material,
          parent: group.parent,
          sourceNode,
          name: mirrored ? sourceName.replace(/\.r\.?$/, ".l") : sourceName,
          group: groupName,
          mirrorX: mirrored,
        }),
      );
    }
  }
  const groupBounds = Object.fromEntries(
    [...groupNodes].map(([name, value]) => [name, boundsForNodes(value.nodes)]),
  );
  await document.transform(dedup(), prune(), draco({ method: "edgebreaker" }));
  const bytes = await io.writeBinary(document);
  return {
    bytes,
    metadata,
    groupBounds,
    includedBoneCount: midline.size + 2 * right.size,
  };
}

export async function fetchPinnedBytes(
  { label, url, expectedBytes, expectedSha256 },
  { fetchImpl = fetch, timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS } = {},
) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) {
        throw new Error(`${label} download timed out after ${timeoutMs} ms`, {
          cause: error,
        });
      }
      throw error;
    }
    if (!response.ok) {
      throw new Error(`Download failed for ${label}: HTTP ${response.status}`);
    }
    const contentLength = response.headers.get("content-length");
    if (!contentLength || !/^\d+$/.test(contentLength)) {
      throw new Error(`${label} has a missing or invalid Content-Length`);
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > expectedBytes) {
      throw new Error(
        `${label} Content-Length ${contentLength} exceeds the pinned ${expectedBytes}-byte ceiling`,
      );
    }
    if (!response.body) throw new Error(`${label} response has no body`);

    const chunks = [];
    let receivedBytes = 0;
    const reader = response.body.getReader();
    while (true) {
      let result;
      try {
        result = await reader.read();
      } catch (error) {
        if (timedOut) {
          throw new Error(`${label} download timed out after ${timeoutMs} ms`, {
            cause: error,
          });
        }
        throw error;
      }
      if (result.done) break;
      const chunk = result.value;
      receivedBytes += chunk.byteLength;
      if (receivedBytes > expectedBytes) {
        controller.abort();
        await reader.cancel().catch(() => {});
        throw new Error(
          `${label} streamed body exceeded the pinned ${expectedBytes} bytes`,
        );
      }
      chunks.push(chunk);
    }

    const bytes = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (
      bytes.byteLength !== expectedBytes ||
      sha256(bytes) !== expectedSha256
    ) {
      throw new Error(
        `${label} identity mismatch: expected ${expectedBytes} bytes and SHA-256 ${expectedSha256}; received ${bytes.byteLength} bytes and SHA-256 ${sha256(bytes)}`,
      );
    }
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadAndVerify(source, workingDirectory, downloadOptions) {
  const archive = await fetchPinnedBytes(
    {
      label: source.id,
      url: source.archiveUrl,
      expectedBytes: source.archiveBytes,
      expectedSha256: source.sha256,
    },
    downloadOptions,
  );
  await writeFile(join(workingDirectory, source.archiveFile), archive);
  const members = unzipSync(archive);
  const member = members[source.member];
  if (!member) {
    throw new Error(
      `Pinned member ${source.member} is absent from ${source.id}`,
    );
  }
  if (
    member.byteLength !== source.memberBytes ||
    sha256(member) !== source.memberSha256
  ) {
    throw new Error(`Pinned member identity mismatch for ${source.id}`);
  }
  const memberPath = join(workingDirectory, source.member);
  await writeFile(memberPath, member);
  return memberPath;
}

async function downloadDracoLicense(workingDirectory, downloadOptions) {
  const bytes = await fetchPinnedBytes(
    {
      label: "Google Draco LICENSE",
      url: DRACO_LICENSE.sourceUrl,
      expectedBytes: DRACO_LICENSE.bytes,
      expectedSha256: DRACO_LICENSE.sha256,
    },
    downloadOptions,
  );
  const path = join(workingDirectory, "google-draco-1.5.7-LICENSE");
  await writeFile(path, bytes);
  return path;
}

async function createIO() {
  const decoder = await draco3d.createDecoderModule();
  const encoder = await draco3d.createEncoderModule();
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": decoder,
    "draco3d.encoder": encoder,
  });
}

function byteIdentical(first, second) {
  return (
    first.byteLength === second.byteLength &&
    first.every((value, index) => value === second[index])
  );
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function promoteStagedDirectories(
  stagedPublicRoot,
  destinationPublicRoot,
  { renamePath = rename } = {},
) {
  await mkdir(destinationPublicRoot, { recursive: true });
  const backupRoot = await mkdtemp(
    join(dirname(destinationPublicRoot), ".orthofluoro-anatomy-backup-"),
  );
  const directoryNames = ["anatomy", "draco"];
  const backedUp = [];
  const promoted = [];
  let backupCanBeRemoved = false;
  try {
    for (const name of directoryNames) {
      const destination = join(destinationPublicRoot, name);
      if (await pathExists(destination)) {
        await renamePath(destination, join(backupRoot, name));
        backedUp.push(name);
      }
    }
    for (const name of directoryNames) {
      await renamePath(
        join(stagedPublicRoot, name),
        join(destinationPublicRoot, name),
      );
      promoted.push(name);
    }
    backupCanBeRemoved = true;
  } catch (publicationError) {
    const rollbackErrors = [];
    for (const name of [...promoted].reverse()) {
      try {
        await rm(join(destinationPublicRoot, name), {
          recursive: true,
          force: true,
        });
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    for (const name of [...backedUp].reverse()) {
      try {
        await renamePath(
          join(backupRoot, name),
          join(destinationPublicRoot, name),
        );
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    if (rollbackErrors.length) {
      throw new AnatomyPublicationRollbackError({
        publicationError,
        rollbackErrors,
        backupRoot,
      });
    }
    backupCanBeRemoved = true;
    throw publicationError;
  } finally {
    if (backupCanBeRemoved) {
      await rm(backupRoot, { recursive: true, force: true });
    }
  }
}

export class AnatomyPublicationRollbackError extends AggregateError {
  constructor({ publicationError, rollbackErrors, backupRoot }) {
    super(
      [publicationError, ...rollbackErrors],
      `Anatomy publication failure: ${publicationError instanceof Error ? publicationError.message : String(publicationError)}. Rollback restoration failure: ${rollbackErrors.map((error) => (error instanceof Error ? error.message : String(error))).join("; ")}. Preserved backup: ${backupRoot}`,
      { cause: publicationError },
    );
    this.name = "AnatomyPublicationRollbackError";
    this.publicationError = publicationError;
    this.rollbackErrors = rollbackErrors;
    this.backupRoot = backupRoot;
  }
}

export async function validateAndPromoteStagedAssetSet({
  stagingRepositoryRoot,
  destinationPublicRoot,
  validateStagedRoot = validateCommittedAnatomy,
  beforePromotion = async () => {},
  renamePath = rename,
}) {
  const report = await validateStagedRoot(stagingRepositoryRoot);
  if (!report || !Array.isArray(report.errors) || report.errors.length > 0) {
    throw new Error(
      `Staged anatomy validation failed: ${report?.errors?.join("; ") || "invalid validator report"}`,
    );
  }
  await beforePromotion();
  await promoteStagedDirectories(
    join(stagingRepositoryRoot, "public"),
    destinationPublicRoot,
    { renamePath },
  );
  return report;
}

export async function prepareAnatomyAssets({
  outputRoot = DEFAULT_OUTPUT_ROOT,
  fetchImpl = fetch,
  downloadTimeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS,
  beforePromotion,
} = {}) {
  const workingDirectory = await mkdtemp(
    join(tmpdir(), "orthofluoro-anatomy-"),
  );
  await mkdir(dirname(outputRoot), { recursive: true });
  const stagingRepositoryRoot = await mkdtemp(
    join(dirname(outputRoot), ".orthofluoro-anatomy-stage-"),
  );
  try {
    const downloadOptions = { fetchImpl, timeoutMs: downloadTimeoutMs };
    const sourcePaths = new Map();
    for (const source of SOURCE_ASSETS) {
      sourcePaths.set(
        source.id,
        await downloadAndVerify(source, workingDirectory, downloadOptions),
      );
    }
    const dracoLicensePath = await downloadDracoLicense(
      workingDirectory,
      downloadOptions,
    );
    const io = await createIO();
    const overviewSource = await io.read(
      sourcePaths.get("open3dmodel-overview-skeleton"),
    );
    const hipSource = await io.read(sourcePaths.get("open3dmodel-lower-limb"));
    const [overview, hip, regional] = await Promise.all([
      buildOverviewArtifact(overviewSource, io),
      buildHipArtifact(hipSource, io),
      buildRegionalArtifact(hipSource, io),
    ]);

    const verificationIO = await createIO();
    const [overviewAgain, hipAgain, regionalAgain] = await Promise.all([
      buildOverviewArtifact(
        await verificationIO.read(
          sourcePaths.get("open3dmodel-overview-skeleton"),
        ),
        verificationIO,
      ),
      buildHipArtifact(
        await verificationIO.read(sourcePaths.get("open3dmodel-lower-limb")),
        verificationIO,
      ),
      buildRegionalArtifact(
        await verificationIO.read(sourcePaths.get("open3dmodel-lower-limb")),
        verificationIO,
      ),
    ]);
    if (
      !byteIdentical(overview.bytes, overviewAgain.bytes) ||
      !byteIdentical(hip.bytes, hipAgain.bytes) ||
      !byteIdentical(regional.bytes, regionalAgain.bytes)
    ) {
      throw new Error(
        "Derived GLB output is not byte-identical across repeated builds",
      );
    }

    const stagedPublicRoot = join(stagingRepositoryRoot, "public");
    const anatomyDirectory = join(stagedPublicRoot, "anatomy");
    const dracoDirectory = join(stagedPublicRoot, "draco");
    await mkdir(anatomyDirectory, { recursive: true });
    await mkdir(dracoDirectory, { recursive: true });
    const overviewPath = join(
      anatomyDirectory,
      "open3dmodel-overview-skeleton.glb",
    );
    const hipPath = join(anatomyDirectory, "open3dmodel-hip-lower-limbs.glb");
    const regionalPath = join(
      anatomyDirectory,
      "open3dmodel-hip-lower-limbs-regional.glb",
    );
    await writeFile(overviewPath, overview.bytes);
    await writeFile(hipPath, hip.bytes);
    await writeFile(regionalPath, regional.bytes);
    const committedOverviewBytes = await readFile(overviewPath);
    const committedHipBytes = await readFile(hipPath);
    const committedRegionalBytes = await readFile(regionalPath);
    const overviewBuildHashes = {
      firstBuildSha256: sha256(overview.bytes),
      secondBuildSha256: sha256(overviewAgain.bytes),
      committedSha256: sha256(committedOverviewBytes),
    };
    const hipBuildHashes = {
      firstBuildSha256: sha256(hip.bytes),
      secondBuildSha256: sha256(hipAgain.bytes),
      committedSha256: sha256(committedHipBytes),
    };
    const regionalBuildHashes = {
      firstBuildSha256: sha256(regional.bytes),
      secondBuildSha256: sha256(regionalAgain.bytes),
      committedSha256: sha256(committedRegionalBytes),
    };
    for (const name of [
      "draco_decoder.js",
      "draco_decoder.wasm",
      "draco_wasm_wrapper.js",
    ]) {
      await cp(
        join(
          REPOSITORY_ROOT,
          "node_modules",
          "three",
          "examples",
          "jsm",
          "libs",
          "draco",
          "gltf",
          name,
        ),
        join(dracoDirectory, name),
      );
    }
    await cp(dracoLicensePath, join(dracoDirectory, "LICENSE"));
    const dracoFiles = {};
    for (const name of [
      "draco_decoder.js",
      "draco_decoder.wasm",
      "draco_wasm_wrapper.js",
    ]) {
      const bytes = await readFile(join(dracoDirectory, name));
      dracoFiles[name] = {
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
      };
    }

    const provenance = {
      schemaVersion: 1,
      project: {
        name: "Open3DModel",
        projectUrl: PROJECT_URL,
        sourcePageUrl: SOURCE_PAGE_URL,
      },
      retrievedDate: RETRIEVED_DATE,
      licence: LICENCE,
      attribution: ATTRIBUTION,
      sourceCredits: {
        overview:
          "Open3DModel - Skeleton by the Open3D project, George J.R. Maat (LUMC), Eungyeol Lee (LUMC) et al.",
        hip: "Open3DModel - Lower limb by the Open3D project, Jan Kooloos (RadboudUMC), Eungyeol Lee (LUMC) et al.",
      },
      sources: SOURCE_ASSETS.map((source) => ({ ...source })),
      transformations: [
        "Retained skeletal meshes in the base artifacts and retained all pinned lower-limb regional structure categories in a separate display-only supplement",
        "Mapped source metres [x,y,z] to application millimetres [1000x,1000z,1000y]",
        "Reversed triangle winding after the handedness-changing axis swap and repaired source triangles against transformed normals",
        "Mirrored named right-side meshes across x=0 and reversed winding",
        "Translated detailed hip/lower-limb positions by the negative bilateral femoral-head midpoint so the hip reference is the root origin",
        "Replaced source materials with one opaque neutral bone material",
        "Applied opaque app-owned category materials to the regional supplement without runtime textures",
        "Moved lower-limb T12 and L1-L5 from the skeletal base into the regional supplement, deduplicated, pruned, and Draco-compressed all outputs",
      ],
      included: {
        overview: ["Bones", "Bones_right", "mirrored Bones_right"],
        hip: HIP_GROUPS,
        regional: REGIONAL_GROUPS,
      },
      excluded: {
        overview: ["Cartilages_right"],
        hip: [
          ...EXCLUDED_LOWER_LIMB_BONES,
          "Cartilages",
          "Ligaments",
          "Muscles",
          "Fascia",
          "Arteries",
          "Veins",
          "Nerves",
          "Bursae",
          "Overlays",
        ],
        regional: [
          "The 34 skeletal source structures retained by the hip base",
        ],
      },
      lowerLimbSourceAccounting: regional.sourceAccounting,
      generationVerification: {
        method:
          "Two independent generation passes from the same pinned downloaded inputs are compared byte-for-byte before publication",
        independentGenerationPasses: 2,
        byteComparisonRequiredBeforePublication: true,
        validatorTrustBoundary:
          "The independent validator checks that actual artifact bytes equal the recorded first-build, second-build, and committed hashes; it does not rerun generation",
      },
      dracoRuntime: {
        version: "1.5.7",
        license: DRACO_LICENSE,
        files: dracoFiles,
        additionalNotices:
          "The authoritative Draco LICENSE also contains notices for ASCIIMathML.js (MIT) and Pygments documentation assets (public domain).",
      },
      artifacts: {
        overview: {
          path: "public/anatomy/open3dmodel-overview-skeleton.glb",
          bytes: overview.bytes.byteLength,
          sha256: sha256(overview.bytes),
          buildHashes: overviewBuildHashes,
          includedBoneCount: overview.includedBoneCount,
          groupBounds: overview.groupBounds,
          ...overview.metadata,
        },
        hip: {
          path: "public/anatomy/open3dmodel-hip-lower-limbs.glb",
          bytes: hip.bytes.byteLength,
          sha256: sha256(hip.bytes),
          buildHashes: hipBuildHashes,
          includedBoneCount: hip.includedBoneCount,
          sourceKeys: hip.sourceKeys,
          groups: HIP_GROUPS,
          groupBounds: hip.groupBounds,
          ...hip.metadata,
        },
        regional: {
          path: "public/anatomy/open3dmodel-hip-lower-limbs-regional.glb",
          bytes: regional.bytes.byteLength,
          sha256: sha256(regional.bytes),
          buildHashes: regionalBuildHashes,
          sourceCount: regional.sourceKeys.length,
          meshCount: regional.meshCount,
          sourceKeys: regional.sourceKeys,
          sourceCategoryCounts: regional.sourceCategoryCounts,
          runtimeCategoryCounts: regional.runtimeCategoryCounts,
          groups: REGIONAL_GROUPS,
          groupBounds: regional.groupBounds,
          ...regional.metadata,
        },
      },
    };
    await writeFile(
      join(anatomyDirectory, "open3dmodel-provenance.json"),
      `${JSON.stringify(provenance, null, 2)}\n`,
    );
    await validateAndPromoteStagedAssetSet({
      stagingRepositoryRoot,
      destinationPublicRoot: outputRoot,
      beforePromotion,
    });
    return provenance;
  } finally {
    await Promise.all([
      rm(workingDirectory, { recursive: true, force: true }),
      rm(stagingRepositoryRoot, { recursive: true, force: true }),
    ]);
  }
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const outputArgument = process.argv.find((argument) =>
    argument.startsWith("--output="),
  );
  const outputRoot = outputArgument
    ? resolve(outputArgument.slice("--output=".length))
    : DEFAULT_OUTPUT_ROOT;
  const provenance = await prepareAnatomyAssets({ outputRoot });
  process.stdout.write(
    `${JSON.stringify({ artifacts: provenance.artifacts }, null, 2)}\n`,
  );
}
