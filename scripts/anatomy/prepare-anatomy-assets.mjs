import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "../..");
const DEFAULT_OUTPUT_ROOT = join(REPOSITORY_ROOT, "public");
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

const EXCLUDED_LOWER_LIMB_BONES = new Set([
  "Thoracic vertebra (T12)",
  "Lumbar vertebra (L1)",
  "Lumbar vertebra (L2)",
  "Lumbar vertebra (L3)",
  "Lumbar vertebra (L4)",
  "Lumbar vertebra (L5)",
]);
const PELVIS_BONES = new Set(["Sacrum", "Coccyx", "Hip bone.r"]);
const LEG_BONES = new Map([
  ["Femur.r", "femur"],
  ["Patella.r", "patella"],
  ["Tibia.r", "tibia-fibula"],
  ["Fibula.r", "tibia-fibula"],
]);

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

function transformTriangleIndices(array, mirrorX) {
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
  const node = document.createNode(name).setMesh(targetMesh).setExtras({
    anatomyGroup: group,
    sourceName: sourceNode.getName(),
    derivedByMirroring: mirrorX,
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

  const femurSource = sourceBones.get("Femur.r");
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
  const candidates = selectFemoralHeadCandidates(femurPositions);
  const fitted = fitSphere(candidates);
  const sourceHipPivots = {
    left: [-fitted.center[0], fitted.center[1], fitted.center[2]],
    right: fitted.center,
  };
  const centredReference = centerHipReference(sourceHipPivots);
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
  return { bytes, metadata, groupBounds, includedBoneCount };
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

async function downloadAndVerify(source, workingDirectory) {
  const response = await fetch(source.archiveUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `Download failed for ${source.id}: HTTP ${response.status}`,
    );
  }
  const archive = new Uint8Array(await response.arrayBuffer());
  if (
    archive.byteLength !== source.archiveBytes ||
    sha256(archive) !== source.sha256
  ) {
    throw new Error(`Pinned archive identity mismatch for ${source.id}`);
  }
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

async function downloadDracoLicense(workingDirectory) {
  const response = await fetch(DRACO_LICENSE.sourceUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `Download failed for Google Draco LICENSE: HTTP ${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== DRACO_LICENSE.bytes ||
    sha256(bytes) !== DRACO_LICENSE.sha256
  ) {
    throw new Error("Pinned Google Draco LICENSE identity mismatch");
  }
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

export async function prepareAnatomyAssets({
  outputRoot = DEFAULT_OUTPUT_ROOT,
} = {}) {
  const workingDirectory = await mkdtemp(
    join(tmpdir(), "orthofluoro-anatomy-"),
  );
  try {
    const sourcePaths = new Map();
    for (const source of SOURCE_ASSETS) {
      sourcePaths.set(
        source.id,
        await downloadAndVerify(source, workingDirectory),
      );
    }
    const dracoLicensePath = await downloadDracoLicense(workingDirectory);
    const io = await createIO();
    const overviewSource = await io.read(
      sourcePaths.get("open3dmodel-overview-skeleton"),
    );
    const hipSource = await io.read(sourcePaths.get("open3dmodel-lower-limb"));
    const [overview, hip] = await Promise.all([
      buildOverviewArtifact(overviewSource, io),
      buildHipArtifact(hipSource, io),
    ]);

    const verificationIO = await createIO();
    const [overviewAgain, hipAgain] = await Promise.all([
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
    ]);
    if (
      !byteIdentical(overview.bytes, overviewAgain.bytes) ||
      !byteIdentical(hip.bytes, hipAgain.bytes)
    ) {
      throw new Error(
        "Derived GLB output is not byte-identical across repeated builds",
      );
    }

    const anatomyDirectory = join(outputRoot, "anatomy");
    const dracoDirectory = join(outputRoot, "draco");
    await mkdir(anatomyDirectory, { recursive: true });
    await mkdir(dracoDirectory, { recursive: true });
    const overviewPath = join(
      anatomyDirectory,
      "open3dmodel-overview-skeleton.glb",
    );
    const hipPath = join(anatomyDirectory, "open3dmodel-hip-lower-limbs.glb");
    await writeFile(overviewPath, overview.bytes);
    await writeFile(hipPath, hip.bytes);
    const committedOverviewBytes = await readFile(overviewPath);
    const committedHipBytes = await readFile(hipPath);
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
        "Retained skeletal meshes only and removed all non-bone roots",
        "Mapped source metres [x,y,z] to application millimetres [1000x,1000z,1000y]",
        "Reversed triangle winding after the handedness-changing axis swap and repaired source triangles against transformed normals",
        "Mirrored named right-side meshes across x=0 and reversed winding",
        "Translated detailed hip/lower-limb positions by the negative bilateral femoral-head midpoint so the hip reference is the root origin",
        "Replaced source materials with one opaque neutral bone material",
        "Removed lower-limb T12 and L1-L5, deduplicated, pruned, and Draco-compressed",
      ],
      included: {
        overview: ["Bones", "Bones_right", "mirrored Bones_right"],
        hip: HIP_GROUPS,
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
      },
      deterministicBuild: {
        method: "first-build, second-build, and committed SHA-256 equality",
        repetitions: 2,
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
          groups: HIP_GROUPS,
          groupBounds: hip.groupBounds,
          ...hip.metadata,
        },
      },
    };
    await writeFile(
      join(anatomyDirectory, "open3dmodel-provenance.json"),
      `${JSON.stringify(provenance, null, 2)}\n`,
    );
    return provenance;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
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
