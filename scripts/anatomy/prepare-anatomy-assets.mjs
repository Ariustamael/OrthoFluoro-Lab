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
import {
  COMPLEMENT_GROUPS,
  classifyOverviewBone,
  deriveUpperLimbJointPivots,
} from "./full-body-build-logic.mjs";
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
const VERIFIED_COMMITTED_GLB_SHA256 = Object.freeze({
  overview: "3644EC72E8DE4634CCA598185ABB1BBCF523C08A52265726C9ECA14A53CC602F",
  hip: "10D744127633B61B166478ADAAA007D15B71EE10D948CEDEADB92EBEC6437D72",
  regional:
    "10FA60D39ED30EC19A940F0AA460743B9778483E8A63FA498E34E10046F1C2F2",
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
const SUPPRESSED_REGIONAL_DUPLICATE_BONES = new Set(
  EXCLUDED_LOWER_LIMB_BONE_NAMES.map((name) => `Bones/${name}|midline`),
);
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
  sourceIsAppCoordinates = false,
) {
  const output = new Float32Array(array.length);
  for (let index = 0; index < array.length; index += 3) {
    let mapped;
    if (normal) {
      mapped = sourceIsAppCoordinates
        ? [array[index], array[index + 1], array[index + 2]]
        : [array[index], array[index + 2], array[index + 1]];
      const length = Math.hypot(...mapped);
      if (!Number.isFinite(length) || length === 0) {
        throw new Error("Source contains an invalid normal");
      }
      mapped = mapped.map((value) => value / length);
    } else {
      mapped = sourceIsAppCoordinates
        ? [array[index], array[index + 1], array[index + 2]]
        : appPointFromSource([
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
  sourceIsAppCoordinates = false,
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
      sourceIsAppCoordinates,
    );
    const normals = transformVec3Array(
      sourceNormal.getArray(),
      mirrorX,
      true,
      undefined,
      sourceIsAppCoordinates,
    );
    const indices = repairTriangleWinding(
      positions,
      normals,
      transformTriangleIndices(
        sourceIndices.getArray(),
        sourceIsAppCoordinates ? !mirrorX : mirrorX,
      ),
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

function sourceNodeAppPoints(
  sourceNode,
  mirrorX = false,
  sourceIsAppCoordinates = false,
) {
  return sourceNode
    .getMesh()
    .listPrimitives()
    .flatMap((primitive) => {
      const source = primitive.getAttribute("POSITION").getArray();
      const points = [];
      for (let index = 0; index < source.length; index += 3) {
        const point = sourceIsAppCoordinates
          ? [source[index], source[index + 1], source[index + 2]]
          : appPointFromSource([
              source[index],
              source[index + 1],
              source[index + 2],
            ]);
        points.push([mirrorX ? -point[0] : point[0], point[1], point[2]]);
      }
      return points;
    });
}

function endpointSlice(points, endpoint, fraction) {
  const zValues = points.map((point) => point[2]);
  const min = Math.min(...zValues);
  const max = Math.max(...zValues);
  const threshold =
    endpoint === "maximum"
      ? max - (max - min) * fraction
      : min + (max - min) * fraction;
  return points.filter((point) =>
    endpoint === "maximum" ? point[2] >= threshold : point[2] <= threshold,
  );
}

function translatedPivot(pivot, midpoint) {
  return {
    ...pivot,
    positionMm: pivot.positionMm.map(
      (coordinate, axis) => coordinate - midpoint[axis],
    ),
  };
}

function deriveComplementJointPivots(
  rightSourceBones,
  centredReference,
  sourceIsAppCoordinates = false,
) {
  const jointPivots = {};
  for (const side of ["right", "left"]) {
    const mirrorX = side === "left";
    const points = (name) =>
      sourceNodeAppPoints(
        rightSourceBones.get(name),
        mirrorX,
        sourceIsAppCoordinates,
      );
    const humerus = points("Humerus.r");
    const radius = points("Radius.r");
    const ulna = points("Ulna.r");
    const pivots = deriveUpperLimbJointPivots({
      side,
      glenoid: points("Scapula.r."),
      humeralHead: endpointSlice(humerus, "maximum", 0.18),
      distalHumerus: endpointSlice(humerus, "minimum", 0.12),
      proximalRadius: endpointSlice(radius, "maximum", 0.12),
      proximalUlna: endpointSlice(ulna, "maximum", 0.12),
      distalRadius: endpointSlice(radius, "minimum", 0.12),
      distalUlna: endpointSlice(ulna, "minimum", 0.12),
      proximalCarpals: [
        "Lunate bone.r",
        "Pisiform.r",
        "Scaphoid.r",
        "Triquetrum.r",
      ].flatMap(points),
    });
    for (const pivot of Object.values(pivots)) {
      jointPivots[pivot.id] = translatedPivot(
        pivot,
        centredReference.midpoint,
      );
    }
  }
  const identityBasis = {
    x: [1, 0, 0],
    y: [0, 1, 0],
    z: [0, 0, 1],
  };
  for (const side of ["left", "right"]) {
    jointPivots[`${side}-hip`] = {
      id: `${side}-hip`,
      side,
      positionMm: centredReference.hipPivots[side],
      localBasis: identityBasis,
      parentSegment: "pelvis",
      childSegment: `${side}-leg`,
      derivation: "overview femoral-head sphere fit after hip centring",
    };
  }
  return jointPivots;
}

function classifyRegionalBodyRegion({ runtimeKey, side, bounds }) {
  if (SUPPRESSED_REGIONAL_DUPLICATE_BONES.has(runtimeKey)) return "torso";
  if (side === "midline") return bounds.max[2] >= 120 ? "torso" : "pelvis";
  return bounds.min[2] < -120 ? `${side}-leg` : "pelvis";
}

function canonicalEntryDigest(entries) {
  return sha256(Buffer.from(JSON.stringify(entries), "utf8"));
}

function buildRegionalBodyRegionSidecar(regionalDocument) {
  const entries = regionalDocument
    .getRoot()
    .listNodes()
    .filter((node) => node.getMesh())
    .map((node) => {
      const extras = node.getExtras();
      const runtimeKey = `${extras.sourceKey}|${extras.anatomySide}`;
      return {
        runtimeKey,
        bodyRegion: classifyRegionalBodyRegion({
          runtimeKey,
          side: extras.anatomySide,
          bounds: boundsForNodes([node]),
        }),
        suppressedDuplicateBone:
          SUPPRESSED_REGIONAL_DUPLICATE_BONES.has(runtimeKey),
      };
    })
    .sort((left, right) =>
      left.runtimeKey.localeCompare(right.runtimeKey, "en"),
    );
  if (entries.length !== 817 || new Set(entries.map((entry) => entry.runtimeKey)).size !== 817) {
    throw new Error("Committed regional source does not contain 817 unique runtime identities");
  }
  return {
    entries,
    bytes: Buffer.from(
      `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`,
      "utf8",
    ),
    entryDigest: canonicalEntryDigest(entries),
  };
}

function derivedArtifactMetadata(artifact) {
  const metadata = { ...artifact };
  for (const key of [
    "path",
    "bytes",
    "sha256",
    "buildHashes",
    "includedBoneCount",
    "sourceKeys",
    "groups",
    "groupBounds",
    "sourceCount",
    "meshCount",
    "sourceCategoryCounts",
    "runtimeCategoryCounts",
  ]) {
    delete metadata[key];
  }
  return metadata;
}

function sourceUnavailable(error) {
  const code = error?.cause?.code ?? error?.code;
  return (
    error instanceof TypeError ||
    ["EACCES", "ENETUNREACH", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(
      code,
    ) ||
    /download timed out|fetch failed/i.test(String(error?.message))
  );
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
  const bodyRegionEntries = [];

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
      const runtimeKey = `${key}|${side}`;
      bodyRegionEntries.push({
        runtimeKey,
        bodyRegion: classifyRegionalBodyRegion({
          runtimeKey,
          side,
          bounds: boundsForNodes([node]),
        }),
        suppressedDuplicateBone:
          SUPPRESSED_REGIONAL_DUPLICATE_BONES.has(runtimeKey),
      });
    }
  }

  bodyRegionEntries.sort((left, right) =>
    left.runtimeKey.localeCompare(right.runtimeKey, "en"),
  );
  const bodyRegionSidecar = {
    schemaVersion: 1,
    entries: bodyRegionEntries,
  };
  const bodyRegionBytes = Buffer.from(
    `${JSON.stringify(bodyRegionSidecar, null, 2)}\n`,
    "utf8",
  );

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
    bodyRegionEntries,
    bodyRegionBytes,
    bodyRegionEntryDigest: canonicalEntryDigest(bodyRegionEntries),
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

async function buildFullBodyComplementArtifact(
  sourceDocument,
  io,
  { sourceIsAppCoordinates = false } = {},
) {
  const allCommittedNodes = sourceIsAppCoordinates
    ? sourceDocument.getRoot().listNodes().filter((node) => node.getMesh())
    : [];
  const midline = sourceIsAppCoordinates
    ? new Map(
        allCommittedNodes
          .filter((node) => !/[.]([rl])\.?$/u.test(node.getName()))
          .map((node) => [node.getName(), node]),
      )
    : exactChildMap(findUniqueNode(sourceDocument, "Bones"));
  const right = sourceIsAppCoordinates
    ? new Map(
        allCommittedNodes
          .filter((node) => /[.]r\.?$/u.test(node.getName()))
          .map((node) => [node.getName(), node]),
      )
    : exactChildMap(findUniqueNode(sourceDocument, "Bones_right"));
  const sourceStructureCount = sourceIsAppCoordinates
    ? allCommittedNodes.length
    : midline.size + right.size;
  if (
    (!sourceIsAppCoordinates && (midline.size !== 36 || right.size !== 98)) ||
    (sourceIsAppCoordinates && sourceStructureCount !== 232)
  ) {
    throw new Error(
      `Unexpected complement source structure: ${sourceStructureCount} runtime nodes`,
    );
  }
  let sourceHipPivots;
  let centredReference;
  if (sourceIsAppCoordinates) {
    const fitted = fitSphere(
      selectFemoralHeadCandidates(
        sourceNodeAppPoints(right.get("Femur.r"), false, true),
      ),
    );
    sourceHipPivots = {
      left: [-fitted.center[0], fitted.center[1], fitted.center[2]],
      right: fitted.center,
    };
    centredReference = centerHipReference(sourceHipPivots);
  } else {
    ({ sourceHipPivots, centredReference } = hipReferenceFromSourceBones(right));
  }
  const jointPivots = deriveComplementJointPivots(
    right,
    centredReference,
    sourceIsAppCoordinates,
  );
  const excluded = [];
  const includedSourceNames = [];

  const metadata = {
    artifact: "full-body-complement",
    axes: { x: "patient-left", y: "anterior", z: "headward" },
    units: "millimetres",
    groups: COMPLEMENT_GROUPS,
    sourceDigest: SOURCE_ASSETS.find(
      (source) => source.id === "open3dmodel-overview-skeleton",
    ).memberSha256,
    rigidTransform: {
      kind: "translation-only",
      translationMm: centredReference.translation,
      scale: [1, 1, 1],
    },
    centeringTransform: {
      sourceHipPivotsAppMm: sourceHipPivots,
      sourceHipMidpointAppMm: centredReference.midpoint,
      appliedTranslationMm: centredReference.translation,
    },
    hipPivots: centredReference.hipPivots,
    referenceMidpoint: [0, 0, 0],
    jointPivots,
    projectionEligible: true,
  };
  const { document, root, buffer, material } = createTargetDocument(
    "Open3DModel Full Body Complement",
    metadata,
  );
  const groupNodes = new Map(
    COMPLEMENT_GROUPS.map((name) => [
      name,
      { parent: createSemanticGroup(document, root, name), nodes: [] },
    ]),
  );

  const addClassified = (sourceName, sourceNode, mirrorX) => {
    const classification = classifyOverviewBone(sourceName);
    if (classification.disposition === "replace-with-detailed") {
      excluded.push({
        sourceName,
        reason: "replaced-by-hip-lower-limbs",
      });
      return;
    }
    const group = groupNodes.get(classification.segment);
    const node = addBoneNode({
      document,
      buffer,
      material,
      parent: group.parent,
      sourceNode,
      name: sourceName,
      group: classification.segment,
      mirrorX,
      positionOffset: centredReference.midpoint,
      extras: {
        sourceIdentity: sourceName,
        anatomyRegion: classification.group,
        projectionEligible: true,
      },
      sourceIsAppCoordinates,
    });
    group.nodes.push(node);
    includedSourceNames.push(sourceName);
  };

  if (sourceIsAppCoordinates) {
    for (const sourceNode of allCommittedNodes) {
      addClassified(sourceNode.getName(), sourceNode, false);
    }
  } else {
    for (const [sourceName, sourceNode] of midline) {
      addClassified(sourceName, sourceNode, false);
    }
    for (const [sourceName, sourceNode] of right) {
      addClassified(sourceName, sourceNode, false);
      addClassified(sourceName.replace(/\.r\.?$/, ".l"), sourceNode, true);
    }
  }
  if (includedSourceNames.length !== 166 || excluded.length !== 66) {
    throw new Error(
      `Unexpected complement accounting: ${includedSourceNames.length} included, ${excluded.length} replaced`,
    );
  }
  includedSourceNames.sort((left, right) => left.localeCompare(right, "en"));
  excluded.sort((left, right) =>
    left.sourceName.localeCompare(right.sourceName, "en"),
  );
  metadata.exclusionDigest = canonicalEntryDigest(excluded);
  metadata.exclusions = excluded;
  metadata.sourceNames = includedSourceNames;
  root.setExtras({ orthoFluoro: metadata });
  document.getRoot().setExtras({ orthoFluoro: metadata });
  const groupBounds = Object.fromEntries(
    COMPLEMENT_GROUPS.map((name) => [
      name,
      boundsForNodes(groupNodes.get(name).nodes),
    ]),
  );
  await document.transform(dedup(), prune(), draco({ method: "edgebreaker" }));
  const bytes = await io.writeBinary(document);
  return {
    bytes,
    metadata,
    groupBounds,
    meshCount: includedSourceNames.length,
    sourceNames: includedSourceNames,
    exclusions: excluded,
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
    let useCommittedFallback = false;
    let unavailableSourceError = null;
    try {
      for (const source of SOURCE_ASSETS) {
        sourcePaths.set(
          source.id,
          await downloadAndVerify(source, workingDirectory, downloadOptions),
        );
      }
    } catch (error) {
      if (!sourceUnavailable(error)) throw error;
      useCommittedFallback = true;
      unavailableSourceError = error;
    }
    const dracoLicensePath = useCommittedFallback
      ? join(outputRoot, "draco", "LICENSE")
      : await downloadDracoLicense(workingDirectory, downloadOptions);
    const io = await createIO();
    let overview;
    let hip;
    let regional;
    let fullBodyComplement;
    let existingProvenance = null;
    let generationInput;
    if (useCommittedFallback) {
      const anatomyRoot = join(outputRoot, "anatomy");
      existingProvenance = JSON.parse(
        await readFile(
          join(anatomyRoot, "open3dmodel-provenance.json"),
          "utf8",
        ),
      );
      const [overviewBytes, hipBytes, regionalBytes] = await Promise.all([
        readFile(join(anatomyRoot, "open3dmodel-overview-skeleton.glb")),
        readFile(join(anatomyRoot, "open3dmodel-hip-lower-limbs.glb")),
        readFile(
          join(anatomyRoot, "open3dmodel-hip-lower-limbs-regional.glb"),
        ),
      ]);
      for (const [name, bytes] of [
        ["overview", overviewBytes],
        ["hip", hipBytes],
        ["regional", regionalBytes],
      ]) {
        if (
          sha256(bytes) !== VERIFIED_COMMITTED_GLB_SHA256[name] ||
          existingProvenance.artifacts[name].sha256 !==
            VERIFIED_COMMITTED_GLB_SHA256[name]
        ) {
          throw new Error(
            `Committed ${name} GLB is not the byte-verified fallback input`,
          );
        }
      }
      const [committedOverviewDocument, committedRegionalDocument] =
        await Promise.all([
          io.read(join(anatomyRoot, "open3dmodel-overview-skeleton.glb")),
          io.read(
            join(anatomyRoot, "open3dmodel-hip-lower-limbs-regional.glb"),
          ),
        ]);
      const sidecar = buildRegionalBodyRegionSidecar(
        committedRegionalDocument,
      );
      fullBodyComplement = await buildFullBodyComplementArtifact(
        committedOverviewDocument,
        io,
        { sourceIsAppCoordinates: true },
      );
      overview = {
        bytes: overviewBytes,
        metadata: derivedArtifactMetadata(existingProvenance.artifacts.overview),
        includedBoneCount:
          existingProvenance.artifacts.overview.includedBoneCount,
        groupBounds: existingProvenance.artifacts.overview.groupBounds,
      };
      hip = {
        bytes: hipBytes,
        metadata: derivedArtifactMetadata(existingProvenance.artifacts.hip),
        includedBoneCount: existingProvenance.artifacts.hip.includedBoneCount,
        sourceKeys: existingProvenance.artifacts.hip.sourceKeys,
        groupBounds: existingProvenance.artifacts.hip.groupBounds,
      };
      regional = {
        bytes: regionalBytes,
        metadata: derivedArtifactMetadata(existingProvenance.artifacts.regional),
        sourceKeys: existingProvenance.artifacts.regional.sourceKeys,
        sourceCategoryCounts:
          existingProvenance.artifacts.regional.sourceCategoryCounts,
        runtimeCategoryCounts:
          existingProvenance.artifacts.regional.runtimeCategoryCounts,
        groupBounds: existingProvenance.artifacts.regional.groupBounds,
        meshCount: existingProvenance.artifacts.regional.meshCount,
        sourceAccounting: existingProvenance.lowerLimbSourceAccounting,
        bodyRegionEntries: sidecar.entries,
        bodyRegionBytes: sidecar.bytes,
        bodyRegionEntryDigest: sidecar.entryDigest,
      };
      generationInput = {
        mode: "byte-verified-committed-derived-assets",
        sourceArchiveReadThisRun: false,
        unavailableSourceError: String(unavailableSourceError?.message),
        derivationChain: [
          {
            artifact: existingProvenance.artifacts.overview.path,
            sha256: VERIFIED_COMMITTED_GLB_SHA256.overview,
            tracedToPinnedSourceMemberSha256:
              SOURCE_ASSETS[0].memberSha256,
          },
          {
            artifact: existingProvenance.artifacts.regional.path,
            sha256: VERIFIED_COMMITTED_GLB_SHA256.regional,
            tracedToPinnedSourceMemberSha256:
              SOURCE_ASSETS[1].memberSha256,
          },
        ],
      };
    } else {
      const overviewSource = await io.read(
        sourcePaths.get("open3dmodel-overview-skeleton"),
      );
      const hipSource = await io.read(
        sourcePaths.get("open3dmodel-lower-limb"),
      );
      [overview, hip, regional, fullBodyComplement] = await Promise.all([
        buildOverviewArtifact(overviewSource, io),
        buildHipArtifact(hipSource, io),
        buildRegionalArtifact(hipSource, io),
        buildFullBodyComplementArtifact(overviewSource, io),
      ]);
      generationInput = {
        mode: "pinned-source-archives",
        sourceArchiveReadThisRun: true,
        derivationChain: SOURCE_ASSETS.map((source) => ({
          source: source.member,
          sha256: source.memberSha256,
        })),
      };
    }

    const verificationIO = await createIO();
    let overviewAgain;
    let hipAgain;
    let regionalAgain;
    let fullBodyComplementAgain;
    if (useCommittedFallback) {
      const verificationOverviewDocument = await verificationIO.read(
        join(outputRoot, "anatomy", "open3dmodel-overview-skeleton.glb"),
      );
      const verificationRegionalDocument = await verificationIO.read(
        join(
          outputRoot,
          "anatomy",
          "open3dmodel-hip-lower-limbs-regional.glb",
        ),
      );
      const sidecarAgain = buildRegionalBodyRegionSidecar(
        verificationRegionalDocument,
      );
      overviewAgain = overview;
      hipAgain = hip;
      regionalAgain = {
        ...regional,
        bodyRegionEntries: sidecarAgain.entries,
        bodyRegionBytes: sidecarAgain.bytes,
        bodyRegionEntryDigest: sidecarAgain.entryDigest,
      };
      fullBodyComplementAgain = await buildFullBodyComplementArtifact(
        verificationOverviewDocument,
        verificationIO,
        { sourceIsAppCoordinates: true },
      );
    } else {
      const verificationOverviewSource = await verificationIO.read(
        sourcePaths.get("open3dmodel-overview-skeleton"),
      );
      const verificationHipSource = await verificationIO.read(
        sourcePaths.get("open3dmodel-lower-limb"),
      );
      [overviewAgain, hipAgain, regionalAgain, fullBodyComplementAgain] =
        await Promise.all([
          buildOverviewArtifact(verificationOverviewSource, verificationIO),
          buildHipArtifact(verificationHipSource, verificationIO),
          buildRegionalArtifact(verificationHipSource, verificationIO),
          buildFullBodyComplementArtifact(
            verificationOverviewSource,
            verificationIO,
          ),
        ]);
    }
    if (
      !byteIdentical(overview.bytes, overviewAgain.bytes) ||
      !byteIdentical(hip.bytes, hipAgain.bytes) ||
      !byteIdentical(regional.bytes, regionalAgain.bytes) ||
      !byteIdentical(fullBodyComplement.bytes, fullBodyComplementAgain.bytes) ||
      !byteIdentical(regional.bodyRegionBytes, regionalAgain.bodyRegionBytes)
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
    const fullBodyComplementPath = join(
      anatomyDirectory,
      "open3dmodel-full-body-complement.glb",
    );
    const regionalBodyRegionsPath = join(
      anatomyDirectory,
      "open3dmodel-regional-body-regions.json",
    );
    await writeFile(overviewPath, overview.bytes);
    await writeFile(hipPath, hip.bytes);
    await writeFile(regionalPath, regional.bytes);
    await writeFile(fullBodyComplementPath, fullBodyComplement.bytes);
    await writeFile(regionalBodyRegionsPath, regional.bodyRegionBytes);
    const [
      committedOverviewBytes,
      committedHipBytes,
      committedRegionalBytes,
      committedFullBodyComplementBytes,
      committedRegionalBodyRegionsBytes,
    ] = await Promise.all([
      readFile(overviewPath),
      readFile(hipPath),
      readFile(regionalPath),
      readFile(fullBodyComplementPath),
      readFile(regionalBodyRegionsPath),
    ]);
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
    const fullBodyComplementBuildHashes = {
      firstBuildSha256: sha256(fullBodyComplement.bytes),
      secondBuildSha256: sha256(fullBodyComplementAgain.bytes),
      committedSha256: sha256(committedFullBodyComplementBytes),
    };
    const regionalBodyRegionsBuildHashes = {
      firstBuildSha256: sha256(regional.bodyRegionBytes),
      secondBuildSha256: sha256(regionalAgain.bodyRegionBytes),
      committedSha256: sha256(committedRegionalBodyRegionsBytes),
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
        "Derived a translation-only 166-mesh full-body complement by replacing overview pelvis and lower-limb meshes with the detailed base",
        "Derived an audited body-region assignment for every regional runtime identity and marked the six overlapping vertebrae for suppression",
      ],
      included: {
        overview: ["Bones", "Bones_right", "mirrored Bones_right"],
        hip: HIP_GROUPS,
        regional: REGIONAL_GROUPS,
        fullBodyComplement: COMPLEMENT_GROUPS,
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
        fullBodyComplement: fullBodyComplement.exclusions,
      },
      lowerLimbSourceAccounting: regional.sourceAccounting,
      generationVerification: {
        method:
          generationInput.sourceArchiveReadThisRun
            ? "Two independent generation passes from the same pinned downloaded inputs are compared byte-for-byte before publication"
            : "Two independent generation passes decode the byte-verified committed overview/regional GLBs, whose existing provenance traces to pinned source members; source archives were unavailable and were not read in this run",
        input: generationInput,
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
        fullBodyComplement: {
          path: "public/anatomy/open3dmodel-full-body-complement.glb",
          bytes: fullBodyComplement.bytes.byteLength,
          sha256: sha256(fullBodyComplement.bytes),
          buildHashes: fullBodyComplementBuildHashes,
          meshCount: fullBodyComplement.meshCount,
          sourceNames: fullBodyComplement.sourceNames,
          exclusions: fullBodyComplement.exclusions,
          groups: COMPLEMENT_GROUPS,
          groupBounds: fullBodyComplement.groupBounds,
          ...fullBodyComplement.metadata,
        },
        regionalBodyRegions: {
          path: "public/anatomy/open3dmodel-regional-body-regions.json",
          bytes: regional.bodyRegionBytes.byteLength,
          sha256: sha256(regional.bodyRegionBytes),
          buildHashes: regionalBodyRegionsBuildHashes,
          schemaVersion: 1,
          runtimeMeshCount: regional.bodyRegionEntries.length,
          suppressedDuplicateBoneCount: regional.bodyRegionEntries.filter(
            (entry) => entry.suppressedDuplicateBone,
          ).length,
          entryDigest: regional.bodyRegionEntryDigest,
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
