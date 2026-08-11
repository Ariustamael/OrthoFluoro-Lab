"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import {
  HIP_ANATOMY_GROUPS,
  REFERENCE_HIP_ANATOMY_POSE,
  type HipAnatomyGroup,
} from "../anatomy/anatomyTypes";
import { buildCArmGeometry } from "../engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../engine/geometry/geometryTypes";
import {
  LayeredProjectionCapabilityError,
  LayeredThicknessProjectionRenderer,
} from "../engine/projection/LayeredThicknessProjectionRenderer";
import { MeshSilhouetteProjectionRenderer } from "../engine/projection/MeshSilhouetteProjectionRenderer";
import type {
  AnatomyProjectionInput,
  AnatomyProjectionResource,
  ProjectionArtifact,
} from "../engine/projection/rendererTypes";

interface PixelStats {
  readonly pixels: Uint8ClampedArray;
  readonly nonBlack: number;
  readonly peak: number;
}

interface SmokeResult {
  readonly complete: boolean;
  readonly layeredCapabilityReason: string | null;
  readonly layeredPrecision: string | null;
  readonly layeredSinglePeak: number;
  readonly layeredOverlapPeak: number;
  readonly poseDelta: number;
  readonly silhouetteDataUrl: string | null;
  readonly silhouetteNonBlackPixels: number;
  readonly silhouetteStrategy: string | null;
  readonly visibilityDelta: number;
}

const INITIAL_RESULT: SmokeResult = {
  complete: false,
  layeredCapabilityReason: null,
  layeredPrecision: null,
  layeredSinglePeak: 0,
  layeredOverlapPeak: 0,
  poseDelta: 0,
  silhouetteDataUrl: null,
  silhouetteNonBlackPixels: 0,
  silhouetteStrategy: null,
  visibilityDelta: 0,
};

function addBox(
  group: Group,
  name: string,
  dimensions: readonly [number, number, number],
  position: readonly [number, number, number],
): void {
  const mesh = new Mesh(
    new BoxGeometry(...dimensions),
    new MeshStandardMaterial({ color: 0xd9cbb5 }),
  );
  mesh.name = name;
  mesh.position.set(...position);
  group.add(mesh);
}

function cubeAnatomy(overlap: boolean): AnatomyProjectionResource {
  const scene = new Group();
  const groups = new Map<HipAnatomyGroup, Group>();
  HIP_ANATOMY_GROUPS.forEach((name) => {
    const group = new Group();
    group.name = name;
    groups.set(name, group);
    scene.add(group);
  });
  addBox(groups.get("pelvis")!, "pelvis cube", [65, 45, 65], [0, 0, 25]);
  addBox(
    groups.get("left-femur")!,
    "left test bone",
    [32, 70, 130],
    [58, 0, -80],
  );
  if (overlap) {
    addBox(
      groups.get("left-femur")!,
      "left overlapping test bone",
      [32, 70, 130],
      [58, 0, -80],
    );
  }
  addBox(
    groups.get("right-femur")!,
    "right test bone",
    [32, 55, 105],
    [-58, 0, -80],
  );
  return {
    complement: null,
    hip: {
      groups,
      hipPivots: {
        left: new Vector3(58, 0, 0),
        right: new Vector3(-58, 0, 0),
      },
      scene,
    },
  };
}

function input(
  anatomy: AnatomyProjectionResource,
  pose = REFERENCE_HIP_ANATOMY_POSE,
): AnatomyProjectionInput {
  return {
    anatomy,
    anatomyPose: pose,
    geometry: buildCArmGeometry(REFERENCE_C_ARM_POSE),
    height: 192,
    width: 192,
  };
}

async function pixelStats(artifact: ProjectionArtifact): Promise<PixelStats> {
  const image = new window.Image();
  image.src = artifact.dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = artifact.width;
  canvas.height = artifact.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("2D detector readback unavailable");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(
    0,
    0,
    artifact.width,
    artifact.height,
  ).data;
  let nonBlack = 0;
  let peak = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const value = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]);
    if (value > 8) nonBlack += 1;
    peak = Math.max(peak, value);
  }
  return { nonBlack, peak, pixels };
}

function pixelDifference(
  first: Uint8ClampedArray,
  second: Uint8ClampedArray,
): number {
  let difference = 0;
  for (let index = 0; index < first.length; index += 4) {
    difference += Math.abs(first[index] - second[index]);
  }
  return difference;
}

async function runSmokeTest(): Promise<SmokeResult> {
  const single = cubeAnatomy(false);
  const overlap = cubeAnatomy(true);
  const silhouette = new MeshSilhouetteProjectionRenderer();
  const layered = new LayeredThicknessProjectionRenderer();
  try {
    const reference = await silhouette.render(input(single));
    const referencePixels = await pixelStats(reference.artifact);
    const rotatedPixels = await pixelStats(
      (
        await silhouette.render(
          input(single, {
            ...REFERENCE_HIP_ANATOMY_POSE,
            leftHipRotationDegrees: 32,
          }),
        )
      ).artifact,
    );
    const leftOnlyPixels = await pixelStats(
      (
        await silhouette.render(
          input(single, {
            ...REFERENCE_HIP_ANATOMY_POSE,
            regionVisibility: {
              ...REFERENCE_HIP_ANATOMY_POSE.regionVisibility,
              "right-leg": false,
            },
          }),
        )
      ).artifact,
    );

    let layeredCapabilityReason: string | null = null;
    let layeredPrecision: string | null = null;
    let layeredSinglePeak = 0;
    let layeredOverlapPeak = 0;
    try {
      const singleOutput = await layered.render(input(single));
      const overlapOutput = await layered.render(input(overlap));
      layeredPrecision = singleOutput.metadata?.precision ?? null;
      layeredSinglePeak = (await pixelStats(singleOutput.artifact)).peak;
      layeredOverlapPeak = (await pixelStats(overlapOutput.artifact)).peak;
    } catch (error) {
      if (!(error instanceof LayeredProjectionCapabilityError)) throw error;
      layeredCapabilityReason = error.capability.reason;
    }

    return {
      complete: true,
      layeredCapabilityReason,
      layeredOverlapPeak,
      layeredPrecision,
      layeredSinglePeak,
      poseDelta: pixelDifference(referencePixels.pixels, rotatedPixels.pixels),
      silhouetteDataUrl: reference.artifact.dataUrl,
      silhouetteNonBlackPixels: referencePixels.nonBlack,
      silhouetteStrategy: reference.strategyId,
      visibilityDelta: pixelDifference(
        referencePixels.pixels,
        leftOnlyPixels.pixels,
      ),
    };
  } finally {
    silhouette.dispose();
    layered.dispose();
    [single, overlap].forEach((resource) => {
      resource.hip.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      });
    });
  }
}

export function ProjectionRendererSmokePage() {
  const [result, setResult] = useState(INITIAL_RESULT);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void runSmokeTest()
      .then((next) => {
        if (active) setResult(next);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="content-page">
      <p className="page-eyebrow">Engineering verification</p>
      <h1>Projection renderer WebGL smoke test</h1>
      <p
        aria-label="Projection renderer smoke status"
        data-complete={result.complete ? "true" : "false"}
        data-layered-overlap-peak={result.layeredOverlapPeak}
        data-layered-precision={result.layeredPrecision ?? undefined}
        data-layered-reason={result.layeredCapabilityReason ?? undefined}
        data-layered-single-peak={result.layeredSinglePeak}
        data-pose-delta={result.poseDelta}
        data-silhouette-nonblack={result.silhouetteNonBlackPixels}
        data-silhouette-strategy={result.silhouetteStrategy ?? undefined}
        data-visibility-delta={result.visibilityDelta}
        role="status"
      >
        {error ??
          (result.complete
            ? `Complete — layered ${result.layeredPrecision ?? result.layeredCapabilityReason}`
            : "Rendering closed-mesh fixtures…")}
      </p>
      {result.silhouetteDataUrl ? (
        <NextImage
          alt="WebGL mesh silhouette smoke artifact"
          height={192}
          src={result.silhouetteDataUrl}
          unoptimized
          width={192}
        />
      ) : null}
    </main>
  );
}
