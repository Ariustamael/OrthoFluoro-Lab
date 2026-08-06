import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  Color,
  Group,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import {
  applyCArmManipulatorDelta,
  applyDragModifiers,
  constantScreenScale,
  finiteDifferenceScreenTangent,
  projectWorldAxisToScreen,
  projectWorldPointToScreen,
  rayPassesWithinWorldRadius,
  screenTangentDelta,
} from "../../src/components/scene/cArmManipulatorMath";
import {
  C_ARM_CUE_GEOMETRY,
  C_ARM_CUE_HIT_TARGET_LAYOUT,
  C_ARM_MANIPULATOR_CONTROL_DEFINITIONS,
  cancelCArmDragForPhysicalSetupChange,
  cArmManipulatorScreenDragDelta,
  cArmCueGlyphMaximumExtent,
  cArmCueHitTargetContainsPoint,
  cArmCueTargetMinimumExtent,
  cueScreenFallback,
  cueAppearance,
  createCArmDragController,
  createCArmManipulatorRenderModel,
  createTranslationHitTargetRaycastLayout,
  isCArmCancelKey,
  selectTranslationHitTargetForRay,
  shouldRaycastTranslationHitTarget,
  teardownCArmManipulatorInteraction,
} from "../../src/components/scene/CArmManipulators";
import {
  ACTIVE_FACE_INSET,
  advanceHandleDragValue,
  calculateHandleValue,
  calculateIncrementalHandleValue,
  C_ARM_INTEGRATED_MATERIAL,
  captureHandlePointer,
  createCArmRigGroupProps,
  createCArmRigRenderModel,
  createCArmRigResources,
  disposeCArmRigResources,
  releaseHandlePointer,
  useCArmRigResources,
} from "../../src/components/scene/CArmRig";
import {
  AnatomyFallbackNotice,
  anatomyFallbackLabel,
  DEFAULT_THEATRE_TARGET,
  orbitControlsEnabled,
  THEATRE_BACKGROUND_COLOR,
} from "../../src/components/scene/TheatreScene";
import { DEFAULT_THEATRE_CAMERA } from "../../src/components/scene/TheatreCanvas";
import {
  canInitializeWebGL,
  WebGLErrorFallback,
} from "../../src/components/scene/WebGLErrorFallback";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import {
  deriveCArmRigGeometry,
  type CArmLocalGeometry,
} from "../../src/engine/geometry/cArmRigGeometry";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import {
  REFERENCE_C_ARM_POSE,
  type CArmGeometry,
  type CArmPhysicalSetup,
  type CArmRigPreset,
  type Vec3,
} from "../../src/engine/geometry/geometryTypes";

function expectArcAnchor(
  local: CArmLocalGeometry,
  preset: CArmRigPreset,
  degrees: number,
  offset: number,
): Vec3 {
  const theta = (degrees * Math.PI) / 180;
  const radius = local.arcRadius + preset.arcRadialThickness / 2 + offset;
  return [radius * Math.cos(theta), radius * Math.sin(theta), 0];
}

function transformCueAnchor(anchor: Vec3, geometry: CArmGeometry): Vec3 {
  const point = new Vector3(...anchor)
    .multiply(new Vector3(...geometry.rigTransform.scale))
    .applyQuaternion(new Quaternion(...geometry.rigTransform.quaternion))
    .add(new Vector3(...geometry.rigTransform.position));
  return [point.x, point.y, point.z];
}

function colorLightness(color: string): number {
  return new Color(color).getHSL({ h: 0, l: 0, s: 0 }).l;
}

function expectPointClose(
  actual: Vector3,
  expected: Vec3,
  precision = 8,
): void {
  expect(actual.x).toBeCloseTo(expected[0], precision);
  expect(actual.y).toBeCloseTo(expected[1], precision);
  expect(actual.z).toBeCloseTo(expected[2], precision);
}

function detectorCornerPoints(geometry: CArmGeometry): readonly Vector3[] {
  const centre = new Vector3(...geometry.detector.center);
  const halfU = new Vector3(...geometry.detector.uAxis).multiplyScalar(
    geometry.detector.width / 2,
  );
  const halfV = new Vector3(...geometry.detector.vAxis).multiplyScalar(
    geometry.detector.height / 2,
  );
  return [
    centre.clone().sub(halfU).sub(halfV),
    centre.clone().add(halfU).sub(halfV),
    centre.clone().add(halfU).add(halfV),
    centre.clone().sub(halfU).add(halfV),
  ];
}

function expectSamePointSet(
  actual: readonly Vector3[],
  expected: readonly Vector3[],
  tolerance = 1e-7,
): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point) => {
    expect(
      expected.some((candidate) => candidate.distanceTo(point) < tolerance),
    ).toBe(true);
  });
}

describe("default theatre visual contracts", () => {
  it("uses a shallow side-oblique camera that exposes the source below the table", () => {
    expect(DEFAULT_THEATRE_CAMERA.position).toEqual([
      1450,
      expect.any(Number),
      1650,
    ]);
    expect(DEFAULT_THEATRE_CAMERA.position[1]).toBeGreaterThanOrEqual(250);
    expect(DEFAULT_THEATRE_CAMERA.position[1]).toBeLessThanOrEqual(320);
    expect(DEFAULT_THEATRE_CAMERA).toMatchObject({
      far: 8000,
      fov: 42,
      near: 1,
    });
  });

  it("centres the full source-to-detector rig on a lower default target", () => {
    expect(DEFAULT_THEATRE_TARGET).toEqual([0, expect.any(Number), 0]);
    expect(DEFAULT_THEATRE_TARGET[1]).toBeGreaterThanOrEqual(-220);
    expect(DEFAULT_THEATRE_TARGET[1]).toBeLessThanOrEqual(-180);
    expect(DEFAULT_THEATRE_CAMERA.position).toEqual([1450, 280, 1650]);
  });

  it("keeps the integrated rig visibly lighter and less metallic than the scene", () => {
    expect(
      colorLightness(C_ARM_INTEGRATED_MATERIAL.color) -
        colorLightness(THEATRE_BACKGROUND_COLOR),
    ).toBeGreaterThanOrEqual(0.18);
    expect(C_ARM_INTEGRATED_MATERIAL.metalness).toBeLessThanOrEqual(0.25);
    expect(C_ARM_INTEGRATED_MATERIAL.roughness).toBeGreaterThanOrEqual(0.65);
  });
});

describe("generic scene handle deltas", () => {
  it("converts pointer movement into handle units", () => {
    expect(
      calculateHandleValue(10, 12, 0.5, {
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(16);
  });

  it("snaps angular handles to five degrees while Shift is held", () => {
    expect(
      calculateHandleValue(10, 7, 0.5, { altKey: false, shiftKey: true }, 5),
    ).toBe(15);
  });

  it("snaps linear handles to ten millimetres", () => {
    expect(
      calculateHandleValue(100, 3, 2, { altKey: false, shiftKey: true }, 10),
    ).toBe(110);
  });

  it("does not rescale accumulated movement when Alt changes mid-drag", () => {
    const ordinary = calculateIncrementalHandleValue(
      10,
      0,
      10,
      0.5,
      { altKey: false, shiftKey: false },
      5,
    );
    const fine = calculateIncrementalHandleValue(
      ordinary,
      10,
      20,
      0.5,
      { altKey: true, shiftKey: false },
      5,
    );

    expect(ordinary).toBe(15);
    expect(fine).toBe(15.5);
  });

  it("accumulates small Shift-drag events before snapping", () => {
    let rawValue = 0;
    let value = 0;
    for (
      let pointerCoordinate = 1;
      pointerCoordinate <= 5;
      pointerCoordinate += 1
    ) {
      const next = advanceHandleDragValue(
        rawValue,
        pointerCoordinate - 1,
        pointerCoordinate,
        0.5,
        { altKey: false, shiftKey: true },
        5,
      );
      rawValue = next.rawValue;
      value = next.value;
    }

    expect(rawValue).toBe(2.5);
    expect(value).toBe(5);
  });

  it("scales movement to one tenth while Alt is held", () => {
    expect(
      calculateHandleValue(10, 12, 0.5, {
        altKey: true,
        shiftKey: false,
      }),
    ).toBeCloseTo(10.6);
  });

  it("uses the R3F pointer target for the capture lifecycle", () => {
    const target = {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    };

    captureHandlePointer(target, 7);
    releaseHandlePointer(target, 7);

    expect(target.setPointerCapture).toHaveBeenCalledWith(7);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
  });
});

describe("real anatomy scene boundary", () => {
  it("labels restrained loading and error fallbacks and offers retry", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    expect(anatomyFallbackLabel("loading")).toBe("Anatomy loading");
    expect(anatomyFallbackLabel("error")).toBe("Anatomy unavailable");
    const view = render(
      <AnatomyFallbackNotice status="loading" onRetry={retry} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Anatomy loading");

    view.rerender(<AnatomyFallbackNotice status="error" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Anatomy unavailable");
    await user.click(screen.getByRole("button", { name: "Retry anatomy" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("mounts HipAnatomy without the procedural body or world-space handles", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/scene/TheatreScene.tsx"),
      "utf8",
    );

    expect(source).toContain("<HipAnatomy");
    expect(source).not.toContain(["Anatomical", "Placeholder"].join(""));
    expect(source).not.toContain("AnatomyRotationHandle");
    expect(source).not.toContain("ANATOMY_ROTATION_HANDLE_DEFINITIONS");
  });
});

describe("six-DoF C-arm manipulator math", () => {
  it("derives full-size targets and compact glyphs from rendered cue geometry", () => {
    expect(C_ARM_CUE_GEOMETRY.linear.hitRadius).toBeGreaterThanOrEqual(0.5);
    ["circular", "linear"].forEach((kind) => {
      const cueKind = kind as "circular" | "linear";
      expect(cArmCueTargetMinimumExtent(cueKind)).toBeGreaterThanOrEqual(1);
      expect(cArmCueGlyphMaximumExtent(cueKind)).toBeGreaterThanOrEqual(0.36);
      expect(cArmCueGlyphMaximumExtent(cueKind)).toBeLessThanOrEqual(0.45);
    });
    expect(C_ARM_CUE_GEOMETRY.circular.hitShape).toBe("filled-disc");
  });

  it("uses the drawn cue direction when the physical tangent is edge-on", () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    expect(
      finiteDifferenceScreenTangent(
        [0, 0, 0],
        [0, 0, 1],
        camera,
        { width: 1000, height: 1000 },
        [Math.SQRT1_2, Math.SQRT1_2],
      ),
    ).toEqual([Math.SQRT1_2, Math.SQRT1_2]);
  });

  it("keeps every edge-on cue draggable without changing another pose field", () => {
    const start = { ...REFERENCE_C_ARM_POSE };

    C_ARM_MANIPULATOR_CONTROL_DEFINITIONS.forEach((definition) => {
      const tangent = cueScreenFallback(definition);
      expect(Math.hypot(...tangent)).toBeGreaterThan(0);

      const delta = cArmManipulatorScreenDragDelta(
        definition,
        [10, 10],
        [10 + tangent[0] * 30, 10 + tangent[1] * 30],
        tangent,
      );
      const next = applyCArmManipulatorDelta(
        start,
        definition.parameter,
        delta,
      );

      expect(next[definition.parameter]).not.toBe(start[definition.parameter]);
      (Object.keys(start) as (keyof typeof start)[]).forEach((parameter) => {
        if (parameter !== definition.parameter) {
          expect(next[parameter]).toBe(start[parameter]);
        }
      });
    });
  });

  const cameraCases = [
    ["side", [1450, 280, 1650]],
    ["oblique", [-1450, 280, 1650]],
    ["detector-facing", [0, 280, 2200]],
  ] as const;
  const physicalSetupCases = [
    { approachSide: "left", tubeOrientation: "detector-over" },
    { approachSide: "right", tubeOrientation: "detector-over" },
    { approachSide: "left", tubeOrientation: "source-over" },
    { approachSide: "right", tubeOrientation: "source-over" },
  ] as const satisfies readonly CArmPhysicalSetup[];

  it.each(cameraCases)(
    "maps positive model motion to positive pointer travel from the %s camera",
    (_name, position) => {
      const camera = new PerspectiveCamera(42, 1.5, 1, 8000);
      camera.position.fromArray(position);
      camera.lookAt(...DEFAULT_THEATRE_TARGET);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      const viewport = { width: 1200, height: 800 };
      const tangent = finiteDifferenceScreenTangent(
        [-300, 100, 0],
        [-290, 108, 0],
        camera,
        viewport,
        [1, 0],
      );
      const start = [100, 100] as const;
      const current = [
        start[0] + tangent[0] * 25,
        start[1] + tangent[1] * 25,
      ] as const;

      expect(screenTangentDelta(start, current, tangent)).toBeGreaterThan(0);
    },
  );

  it.each(
    cameraCases.flatMap(([cameraName, cameraPosition]) =>
      physicalSetupCases.flatMap((setup) =>
        C_ARM_MANIPULATOR_CONTROL_DEFINITIONS.map((definition) => ({
          cameraName,
          cameraPosition,
          definition,
          setup,
        })),
      ),
    ),
  )(
    "increases only $definition.parameter for $cameraName, $setup.approachSide, $setup.tubeOrientation",
    ({ cameraPosition, definition, setup }) => {
      const camera = new PerspectiveCamera(42, 1.5, 1, 8000);
      camera.position.fromArray(cameraPosition);
      camera.lookAt(...DEFAULT_THEATRE_TARGET);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      const viewport = { width: 1200, height: 800 };
      const preset = C_ARM_RIG_PRESETS.isocentric;
      const local = deriveCArmRigGeometry(preset);
      const startPose = {
        ...REFERENCE_C_ARM_POSE,
        orbitDegrees: 17,
        cranialCaudalDegrees: -11,
        swivelDegrees: 9,
        translationX: 31,
        translationY: -23,
        translationZ: 19,
      };
      const epsilon = definition.kind === "rotation" ? 0.25 : 1;
      const positivePose = applyCArmManipulatorDelta(
        startPose,
        definition.parameter,
        epsilon,
      );
      const startModel = createCArmManipulatorRenderModel(
        local,
        preset,
        buildCArmGeometry(startPose, preset, setup),
        "move-carm",
      );
      const positiveModel = createCArmManipulatorRenderModel(
        local,
        preset,
        buildCArmGeometry(positivePose, preset, setup),
        "move-carm",
      );
      const groupName =
        definition.id === "swivel"
          ? "Wig-wag cue"
          : definition.kind === "translation"
            ? "Translation cue"
            : "Orbit and tilt cue";
      const startAnchor = startModel.groups.find(
        ({ name }) => name === groupName,
      )!.position;
      const positiveAnchor = positiveModel.groups.find(
        ({ name }) => name === groupName,
      )!.position;
      const tangent = finiteDifferenceScreenTangent(
        startAnchor,
        positiveAnchor,
        camera,
        viewport,
        cueScreenFallback(definition),
      );
      const projectedStart = projectWorldPointToScreen(
        startAnchor,
        camera,
        viewport,
      );
      const projectedPositive = projectWorldPointToScreen(
        positiveAnchor,
        camera,
        viewport,
      );
      const projectedDelta = [
        projectedPositive[0] - projectedStart[0],
        projectedPositive[1] - projectedStart[1],
      ] as const;
      const projectedMagnitude = Math.hypot(...projectedDelta);
      if (projectedMagnitude > 1e-4) {
        expect(tangent[0]).toBeCloseTo(
          projectedDelta[0] / projectedMagnitude,
          10,
        );
        expect(tangent[1]).toBeCloseTo(
          projectedDelta[1] / projectedMagnitude,
          10,
        );
      } else {
        expect(tangent).toEqual(cueScreenFallback(definition));
      }
      const startPointer = [100, 100] as const;
      const currentPointer = [
        startPointer[0] + tangent[0] * 25,
        startPointer[1] + tangent[1] * 25,
      ] as const;
      const delta = cArmManipulatorScreenDragDelta(
        definition,
        startPointer,
        currentPointer,
        tangent,
      );
      const nextPose = applyCArmManipulatorDelta(
        startPose,
        definition.parameter,
        delta,
      );

      expect(nextPose[definition.parameter]).toBeGreaterThan(
        startPose[definition.parameter],
      );
      (Object.keys(startPose) as (keyof typeof startPose)[]).forEach(
        (parameter) => {
          if (parameter !== definition.parameter) {
            expect(nextPose[parameter]).toBe(startPose[parameter]);
          }
        },
      );
    },
  );

  it("moves wig-wag in the pointer direction", () => {
    const definition = C_ARM_MANIPULATOR_CONTROL_DEFINITIONS.find(
      ({ id }) => id === "swivel",
    )!;
    const camera = new PerspectiveCamera(42, 1.5, 1, 8000);
    camera.position.set(1450, 280, 1650);
    camera.lookAt(...DEFAULT_THEATRE_TARGET);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const preset = C_ARM_RIG_PRESETS.isocentric;
    const local = deriveCArmRigGeometry(preset);
    const positivePose = applyCArmManipulatorDelta(
      REFERENCE_C_ARM_POSE,
      "swivelDegrees",
      0.25,
    );
    const startAnchor = createCArmManipulatorRenderModel(
      local,
      preset,
      buildCArmGeometry(REFERENCE_C_ARM_POSE, preset),
      "move-carm",
    ).groups[1]!.position;
    const positiveAnchor = createCArmManipulatorRenderModel(
      local,
      preset,
      buildCArmGeometry(positivePose, preset),
      "move-carm",
    ).groups[1]!.position;
    const tangent = finiteDifferenceScreenTangent(
      startAnchor,
      positiveAnchor,
      camera,
      { width: 1200, height: 800 },
      cueScreenFallback(definition),
    );

    expect(
      cArmManipulatorScreenDragDelta(
        definition,
        [100, 100],
        [100 + tangent[0] * 25, 100 + tangent[1] * 25],
        tangent,
      ),
    ).toBeGreaterThan(0);
  });

  it("separates independent cue targets while covering each linear arrow tip", () => {
    const clusters = [
      [
        ...C_ARM_CUE_HIT_TARGET_LAYOUT.orbit,
        ...C_ARM_CUE_HIT_TARGET_LAYOUT.tilt,
      ],
      C_ARM_CUE_HIT_TARGET_LAYOUT.translation,
    ];

    clusters.forEach((targets) => {
      targets.forEach((target, index) => {
        targets.slice(index + 1).forEach((other) => {
          if (target.controlId === other.controlId) return;
          expect(
            new Vector3(...target.position).distanceTo(
              new Vector3(...other.position),
            ),
          ).toBeGreaterThanOrEqual(target.radius + other.radius);
        });
      });
    });

    C_ARM_CUE_HIT_TARGET_LAYOUT.translation.forEach((target) => {
      const arrowTip = new Vector3(...target.axis)
        .multiplyScalar(
          Math.sign(
            new Vector3(...target.position).dot(new Vector3(...target.axis)),
          ) *
            (C_ARM_CUE_GEOMETRY.linear.arrowOffset +
              C_ARM_CUE_GEOMETRY.linear.arrowHeight / 2),
        )
        .toArray() as Vec3;
      expect(cArmCueHitTargetContainsPoint(target, arrowTip)).toBe(true);
      expect(
        C_ARM_MANIPULATOR_CONTROL_DEFINITIONS.find(
          (definition) => definition.id === target.controlId,
        )?.kind,
      ).toBe("translation");
    });
  });

  it("arbitrates projected translation lobes by the actual default-camera ray", () => {
    const viewport = { width: 1200, height: 800 };
    const camera = new PerspectiveCamera(
      DEFAULT_THEATRE_CAMERA.fov,
      viewport.width / viewport.height,
      DEFAULT_THEATRE_CAMERA.near,
      DEFAULT_THEATRE_CAMERA.far,
    );
    camera.position.fromArray(DEFAULT_THEATRE_CAMERA.position);
    camera.lookAt(...DEFAULT_THEATRE_TARGET);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const preset = C_ARM_RIG_PRESETS.isocentric;
    const local = deriveCArmRigGeometry(preset);
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE, preset);
    const model = createCArmManipulatorRenderModel(
      local,
      preset,
      geometry,
      "move-carm",
    );
    const translationPosition = model.groups.find(
      ({ name }) => name === "Translation cue",
    )!.position;
    const targetScale = constantScreenScale(
      translationPosition,
      camera,
      viewport.height,
      44,
    );
    const targets = createTranslationHitTargetRaycastLayout(
      translationPosition,
      targetScale,
    );
    const raycaster = new Raycaster();

    expect(targets).toHaveLength(6);
    const xPositive = targets.find(({ id }) => id === "translate-x-positive")!;
    const zNegative = targets.find(({ id }) => id === "translate-z-negative")!;
    expect(
      new Vector3(
        ...projectWorldPointToScreen(xPositive.position, camera, viewport),
        0,
      ).distanceTo(
        new Vector3(
          ...projectWorldPointToScreen(zNegative.position, camera, viewport),
          0,
        ),
      ),
    ).toBeLessThan(44);

    const xPositiveScreen = projectWorldPointToScreen(
      xPositive.position,
      camera,
      viewport,
    );
    const zNegativeScreen = projectWorldPointToScreen(
      zNegative.position,
      camera,
      viewport,
    );
    raycaster.setFromCamera(
      {
        x: (xPositiveScreen[0] + zNegativeScreen[0]) / viewport.width - 1,
        y: 1 - (xPositiveScreen[1] + zNegativeScreen[1]) / viewport.height,
      },
      camera,
    );
    expect(
      raycaster.ray.distanceSqToPoint(new Vector3(...xPositive.position)),
    ).toBeLessThan(xPositive.radius ** 2);
    expect(
      raycaster.ray.distanceSqToPoint(new Vector3(...zNegative.position)),
    ).toBeLessThan(zNegative.radius ** 2);
    const overlapWinner = selectTranslationHitTargetForRay(raycaster, targets)!;
    expect(
      shouldRaycastTranslationHitTarget(raycaster, targets, overlapWinner.id),
    ).toBe(true);
    expect(
      shouldRaycastTranslationHitTarget(
        raycaster,
        targets,
        overlapWinner.id === xPositive.id ? zNegative.id : xPositive.id,
      ),
    ).toBe(false);

    targets.forEach((target) => {
      const screen = projectWorldPointToScreen(
        target.position,
        camera,
        viewport,
      );
      raycaster.setFromCamera(
        {
          x: (screen[0] / viewport.width) * 2 - 1,
          y: 1 - (screen[1] / viewport.height) * 2,
        },
        camera,
      );

      expect(selectTranslationHitTargetForRay(raycaster, targets)).toBe(target);
      const definition = C_ARM_MANIPULATOR_CONTROL_DEFINITIONS.find(
        ({ id }) => id === target.controlId,
      )!;
      const next = applyCArmManipulatorDelta(
        REFERENCE_C_ARM_POSE,
        definition.parameter,
        7,
      );
      Object.keys(next).forEach((field) => {
        expect(next[field as keyof typeof next]).toBe(
          field === definition.parameter ? 7 : 0,
        );
      });
    });
  });

  it("clears a hover-only hint through the effect teardown contract", () => {
    const callbacks = {
      onActiveIdChange: vi.fn(),
      onDragStateChange: vi.fn(),
      onHintChange: vi.fn(),
      setCArmPose: vi.fn(),
    };
    const controller = createCArmDragController(callbacks);

    teardownCArmManipulatorInteraction(controller, "mode-exit");

    expect(controller.activeDrag()).toBeNull();
    expect(callbacks.onHintChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(callbacks.onActiveIdChange).not.toHaveBeenCalled();
    expect(callbacks.onDragStateChange).not.toHaveBeenCalled();
  });

  it("clears actual direct-grab lifecycle effects and restores only on Escape", () => {
    const callbacks = {
      onActiveIdChange: vi.fn(),
      onDragStateChange: vi.fn(),
      onHintChange: vi.fn(),
      setCArmPose: vi.fn(),
    };
    const controller = createCArmDragController(callbacks);
    const startPose = { ...REFERENCE_C_ARM_POSE, orbitDegrees: 18 };
    const target = {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    };
    const start = () =>
      controller.start({
        captureTarget: target,
        definition: C_ARM_MANIPULATOR_CONTROL_DEFINITIONS[0]!,
        pointerId: 7,
        startPointer: [10, 10],
        startPose,
      });

    start();
    expect(target.setPointerCapture).toHaveBeenLastCalledWith(7);
    controller.finish("pointer-up", 7);

    ["pointer-cancel", "lost-capture", "blur", "mode-exit"].forEach(
      (reason) => {
        start();
        controller.finish(
          reason as "pointer-cancel" | "lost-capture" | "blur" | "mode-exit",
          7,
          reason !== "lost-capture",
        );
        expect(controller.activeDrag()).toBeNull();
        expect(callbacks.onDragStateChange).toHaveBeenLastCalledWith(false);
        expect(callbacks.onActiveIdChange).toHaveBeenLastCalledWith(null);
        expect(callbacks.onHintChange).toHaveBeenLastCalledWith(null);
      },
    );

    start();
    expect(controller.cancelKey("Escape")).toBe(true);
    expect(controller.activeDrag()).toBeNull();
    expect(callbacks.setCArmPose).toHaveBeenLastCalledWith(startPose);
    expect(callbacks.onDragStateChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onHintChange).toHaveBeenLastCalledWith(null);
    expect(target.releasePointerCapture).toHaveBeenCalledTimes(5);
    expect(callbacks.setCArmPose).toHaveBeenCalledTimes(1);
    expect(controller.cancelKey("Enter")).toBe(false);
  });

  it("cancels an active drag when the physical rig setup changes", () => {
    const callbacks = {
      onActiveIdChange: vi.fn(),
      onDragStateChange: vi.fn(),
      onHintChange: vi.fn(),
      setCArmPose: vi.fn(),
    };
    const controller = createCArmDragController(callbacks);
    const target = {
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    };
    controller.start({
      captureTarget: target,
      definition: C_ARM_MANIPULATOR_CONTROL_DEFINITIONS[5]!,
      pointerId: 12,
      screenTangent: [1, 0],
      startPointer: [20, 30],
      startPose: REFERENCE_C_ARM_POSE,
    });

    cancelCArmDragForPhysicalSetupChange(controller);

    expect(controller.activeDrag()).toBeNull();
    expect(target.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(12);
    expect(callbacks.onDragStateChange).toHaveBeenLastCalledWith(false);
    expect(callbacks.onActiveIdChange).toHaveBeenLastCalledWith(null);
    expect(callbacks.onHintChange).toHaveBeenLastCalledWith(null);
    expect(callbacks.setCArmPose).not.toHaveBeenCalled();
  });

  it("cancels a setup-changing drag in the layout phase before paint", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/components/scene/CArmManipulators.tsx",
      ),
      "utf8",
    );

    expect(source).toMatch(
      /useLayoutEffect\(\(\) => \{\s*cancelCArmDragForPhysicalSetupChange\(dragControllerRef\.current!\);\s*\}, \[cArmPhysicalSetup\]\);/,
    );
  });

  it("keeps inactive cues quiet and prioritizes the hovered or active cue", () => {
    expect(cueAppearance(false, false)).toEqual({
      glyphOpacity: 0.34,
      otherOpacity: 0.34,
    });
    expect(cueAppearance(true, false)).toEqual({
      glyphOpacity: 0.92,
      otherOpacity: 0.18,
    });
    expect(cueAppearance(true, true)).toEqual({
      glyphOpacity: 1,
      otherOpacity: 0.1,
    });
  });

  it("recognizes Escape as the direct-grab cancellation key", () => {
    expect(isCArmCancelKey("Escape")).toBe(true);
    expect(isCArmCancelKey("Enter")).toBe(false);
  });

  it("projects world axes into normalized screen tangents", () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    expect(
      projectWorldAxisToScreen([1, 0, 0], camera, {
        width: 1000,
        height: 1000,
      }),
    ).toEqual([1, 0]);
    expect(
      projectWorldAxisToScreen([0, 0, 1], camera, {
        width: 1000,
        height: 1000,
      }),
    ).toEqual([0, 0]);
  });

  it("projects the active pivot into client coordinates for offset canvases", () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    expect(
      projectWorldPointToScreen([0, 0, 0], camera, {
        width: 100,
        height: 100,
        left: 30,
        top: 20,
      }),
    ).toEqual([80, 70]);
  });

  it("projects pointer travel onto a screen tangent without cross-axis motion", () => {
    expect(screenTangentDelta([10, 20], [22, 29], [1, 0])).toBe(12);
    expect(screenTangentDelta([10, 20], [22, 29], [0, 1])).toBe(9);
    expect(screenTangentDelta([10, 20], [22, 29], [0, 0])).toBe(0);
  });

  it("reserves the translation screen region ahead of the swivel raycast", () => {
    const raycaster = new Raycaster(
      new Vector3(0, 0, 10),
      new Vector3(0, 0, -1),
    );

    expect(rayPassesWithinWorldRadius(raycaster, [0, 0, 0], 0.8)).toBe(true);
    expect(rayPassesWithinWorldRadius(raycaster, [2, 0, 0], 0.8)).toBe(false);
    expect(rayPassesWithinWorldRadius(raycaster, [0, 0, 0], 0)).toBe(false);
  });

  it("applies fine movement before rotation and translation snapping", () => {
    expect(
      applyDragModifiers(12, "rotation", {
        altKey: true,
        shiftKey: false,
      }),
    ).toBeCloseTo(1.2);
    expect(
      applyDragModifiers(12, "rotation", {
        altKey: false,
        shiftKey: true,
      }),
    ).toBe(10);
    expect(
      applyDragModifiers(14, "translation", {
        altKey: false,
        shiftKey: true,
      }),
    ).toBe(10);
    expect(
      applyDragModifiers(180, "translation", {
        altKey: true,
        shiftKey: true,
      }),
    ).toBe(20);
  });

  it("keeps a stable pixel size for perspective and orthographic cameras", () => {
    const perspective = new PerspectiveCamera(60, 1, 0.1, 100);
    perspective.position.set(0, 0, 10);
    perspective.lookAt(0, 0, 0);
    perspective.updateMatrixWorld();
    perspective.updateProjectionMatrix();
    expect(constantScreenScale([0, 0, 0], perspective, 1000, 100)).toBeCloseTo(
      2 * Math.tan(Math.PI / 6),
      6,
    );

    const orthographic = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    orthographic.zoom = 2;
    orthographic.updateProjectionMatrix();
    expect(constantScreenScale([0, 0, 0], orthographic, 1000, 100)).toBe(0.5);
    expect(constantScreenScale([0, 0, 0], perspective, 0, 100)).toBe(0);
  });

  it("exposes all six fields and changes only the selected field", () => {
    expect(
      C_ARM_MANIPULATOR_CONTROL_DEFINITIONS.map(({ parameter }) => parameter),
    ).toEqual([
      "orbitDegrees",
      "cranialCaudalDegrees",
      "translationX",
      "translationY",
      "translationZ",
      "swivelDegrees",
    ]);

    C_ARM_MANIPULATOR_CONTROL_DEFINITIONS.forEach(({ parameter }) => {
      const next = applyCArmManipulatorDelta(
        REFERENCE_C_ARM_POSE,
        parameter,
        7,
      );
      Object.keys(REFERENCE_C_ARM_POSE).forEach((field) => {
        expect(next[field as keyof typeof next]).toBe(
          field === parameter ? 7 : 0,
        );
      });
    });
  });

  it("renders exactly three correctly placed groups only in Move C-arm mode", () => {
    const preset = C_ARM_RIG_PRESETS["non-isocentric"];
    const local = deriveCArmRigGeometry(preset);
    const geometry = buildCArmGeometry(
      { ...REFERENCE_C_ARM_POSE, orbitDegrees: 20, translationY: 40 },
      preset,
    );
    const hidden = createCArmManipulatorRenderModel(
      local,
      preset,
      geometry,
      "inspect",
    );
    const visible = createCArmManipulatorRenderModel(
      local,
      preset,
      geometry,
      "move-carm",
    );

    expect(hidden.groups).toEqual([]);
    expect(visible.groups.map(({ name }) => name)).toEqual([
      "Orbit and tilt cue",
      "Wig-wag cue",
      "Translation cue",
    ]);
    expect(visible.localAnchors.orbitTilt).toEqual(
      expectArcAnchor(local, preset, -225, 36),
    );
    expect(visible.localAnchors.swivel).toEqual(
      expectArcAnchor(
        local,
        preset,
        ((local.arcStartRadians + local.arcEndRadians) / 2) * (180 / Math.PI),
        36,
      ),
    );
    expect(visible.localAnchors.translation).toEqual(
      expectArcAnchor(local, preset, -135, 48),
    );
    expect(visible.groups[0]?.position).toEqual(
      transformCueAnchor(visible.localAnchors.orbitTilt, geometry),
    );
    expect(visible.groups[1]?.position).toEqual(
      transformCueAnchor(visible.localAnchors.swivel, geometry),
    );
    expect(visible.groups[2]?.position).toEqual(
      transformCueAnchor(visible.localAnchors.translation, geometry),
    );
    expect(visible.groups.every(({ position }) => position)).toBe(true);
    expect(visible.groups[1]?.position).not.toEqual(geometry.mechanicalPivot);
    expect(visible.groups[2]?.position).not.toEqual(geometry.referenceCentre);
  });

  it("applies the complete physical setup transform to every cue anchor", () => {
    const preset = C_ARM_RIG_PRESETS.isocentric;
    const local = deriveCArmRigGeometry(preset);
    const geometry = buildCArmGeometry(REFERENCE_C_ARM_POSE, preset, {
      approachSide: "right",
      tubeOrientation: "source-over",
    });
    const model = createCArmManipulatorRenderModel(
      local,
      preset,
      geometry,
      "move-carm",
    );

    expect(model.groups[0]?.position).toEqual(
      transformCueAnchor(model.localAnchors.orbitTilt, geometry),
    );
    expect(model.groups[1]?.position).toEqual(
      transformCueAnchor(model.localAnchors.swivel, geometry),
    );
    expect(model.groups[2]?.position).toEqual(
      transformCueAnchor(model.localAnchors.translation, geometry),
    );
  });

  it("suspends camera controls only for active rig drags", () => {
    expect(orbitControlsEnabled("inspect", false)).toBe(true);
    expect(orbitControlsEnabled("move-carm", false)).toBe(true);
    expect(orbitControlsEnabled("move-carm", true)).toBe(false);
  });
});

describe("integrated C-arm renderer", () => {
  it.each([
    { approachSide: "left", tubeOrientation: "detector-over" },
    { approachSide: "right", tubeOrientation: "detector-over" },
    { approachSide: "left", tubeOrientation: "source-over" },
    { approachSide: "right", tubeOrientation: "source-over" },
  ] satisfies readonly CArmPhysicalSetup[])(
    "keeps every rig vertex and cue coherent for $approachSide/$tubeOrientation",
    (setup) => {
      const preset = C_ARM_RIG_PRESETS.isocentric;
      const resources = createCArmRigResources(preset);
      const pose = {
        ...REFERENCE_C_ARM_POSE,
        cranialCaudalDegrees: -17,
        orbitDegrees: 29,
        swivelDegrees: 13,
        translationX: 41,
        translationY: -23,
        translationZ: 37,
      };
      const model = createCArmRigRenderModel(
        pose,
        preset,
        resources,
        true,
        setup,
      );
      const rigProps = createCArmRigGroupProps(model.rigTransform);
      const rig = new Group();
      rig.position.fromArray(rigProps.position);
      rig.quaternion.fromArray(rigProps.quaternion);
      rig.scale.fromArray(rigProps.scale);

      const sourceNode = model.nodes.find(
        ({ name }) => name === "Source aperture",
      )!;
      const sourceChild = new Group();
      sourceChild.position.fromArray(sourceNode.position!);
      rig.add(sourceChild);
      rig.updateMatrixWorld(true);

      const authoritative = buildCArmGeometry(pose, preset, setup);
      expectPointClose(
        new Vector3(...resources.local.source).applyMatrix4(rig.matrixWorld),
        authoritative.source,
      );
      expectPointClose(
        new Vector3(...resources.local.detectorCenter).applyMatrix4(
          rig.matrixWorld,
        ),
        authoritative.detector.center,
      );
      expectPointClose(
        sourceChild.getWorldPosition(new Vector3()),
        authoritative.source,
      );

      const expectedDetectorCorners = detectorCornerPoints(authoritative);
      const transformedDetectorCorners = resources.local.detectorCorners.map(
        (corner) => new Vector3(...corner).applyMatrix4(rig.matrixWorld),
      );
      expectSamePointSet(transformedDetectorCorners, expectedDetectorCorners);

      const beamPositions = resources.beamGeometry.getAttribute("position");
      expectPointClose(
        new Vector3().fromBufferAttribute(beamPositions, 0).applyMatrix4(
          rig.matrixWorld,
        ),
        authoritative.source,
        4,
      );
      const transformedBeamCorners = [1, 2, 3, 4].map((index) =>
        new Vector3()
          .fromBufferAttribute(beamPositions, index)
          .applyMatrix4(rig.matrixWorld),
      );
      expectSamePointSet(
        transformedBeamCorners,
        expectedDetectorCorners,
        1e-4,
      );

      const cues = createCArmManipulatorRenderModel(
        resources.local,
        preset,
        authoritative,
        "move-carm",
      );
      [
        [cues.localAnchors.orbitTilt, cues.groups[0]!.position],
        [cues.localAnchors.swivel, cues.groups[1]!.position],
        [cues.localAnchors.translation, cues.groups[2]!.position],
      ].forEach(([localAnchor, worldAnchor]) => {
        expectPointClose(
          new Vector3(...localAnchor).applyMatrix4(rig.matrixWorld),
          worldAnchor,
        );
      });

      disposeCArmRigResources(resources);
    },
  );

  it("uses the same complete affine transform for every rig node", () => {
    const resources = createCArmRigResources(C_ARM_RIG_PRESETS.isocentric);
    const setup = {
      approachSide: "right",
      tubeOrientation: "source-over",
    } as const;
    const model = createCArmRigRenderModel(
      REFERENCE_C_ARM_POSE,
      C_ARM_RIG_PRESETS.isocentric,
      resources,
      true,
      setup,
    );

    expect(model.rigTransform).toEqual(
      buildCArmGeometry(
        REFERENCE_C_ARM_POSE,
        C_ARM_RIG_PRESETS.isocentric,
        setup,
      ).rigTransform,
    );
    expect(model.nodes.map(({ name }) => name)).toContain("X-ray beam");
    expect(model.rigTransform.scale).toContain(-1);

    disposeCArmRigResources(resources);
  });

  it("describes only the integrated rig nodes and removes only a hidden beam", () => {
    const resources = createCArmRigResources(C_ARM_RIG_PRESETS.isocentric);
    const visible = createCArmRigRenderModel(
      REFERENCE_C_ARM_POSE,
      C_ARM_RIG_PRESETS.isocentric,
      resources,
      true,
    );
    const hidden = createCArmRigRenderModel(
      REFERENCE_C_ARM_POSE,
      C_ARM_RIG_PRESETS.isocentric,
      resources,
      false,
    );

    expect(visible.nodes.map(({ name }) => name)).toEqual([
      "C arc and detector",
      "Detector active face",
      "C arc highlight",
      "Source root",
      "Source collimator",
      "Source aperture",
      "X-ray beam",
    ]);
    expect(
      visible.nodes.find(({ name }) => name === "C arc highlight")?.geometry,
    ).toBe(resources.arcHighlightGeometry);
    expect(hidden.nodes.map(({ name }) => name)).toEqual(
      visible.nodes.slice(0, -1).map(({ name }) => name),
    );
    ["Source root", "Source collimator", "Source aperture"].forEach((name) => {
      expect(
        visible.nodes.find((node) => node.name === name)?.position,
      ).toEqual(resources.local.source);
    });

    disposeCArmRigResources(resources);
  });

  it("keeps one local mesh identity across modes while changing the group transform", () => {
    const { result, rerender, unmount } = renderHook(
      ({ mode }) => useCArmRigResources(C_ARM_RIG_PRESETS[mode]),
      { initialProps: { mode: "isocentric" as const } },
    );
    const resources = result.current;
    const pose = {
      ...REFERENCE_C_ARM_POSE,
      orbitDegrees: 25,
      cranialCaudalDegrees: -15,
    };
    const isocentric = createCArmRigRenderModel(
      pose,
      C_ARM_RIG_PRESETS.isocentric,
      resources,
      true,
    );

    rerender({ mode: "non-isocentric" });
    expect(result.current).toBe(resources);

    const nonIsocentric = createCArmRigRenderModel(
      pose,
      C_ARM_RIG_PRESETS["non-isocentric"],
      result.current,
      true,
    );
    expect(nonIsocentric.rigShapeKey).toBe(isocentric.rigShapeKey);
    expect(nonIsocentric.nodes[0]?.geometry).toBe(
      isocentric.nodes[0]?.geometry,
    );
    expect(nonIsocentric.rigTransform).not.toEqual(isocentric.rigTransform);

    unmount();
  });

  it("uses the authoritative transform without baking pose into the mesh", () => {
    const preset = C_ARM_RIG_PRESETS["non-isocentric"];
    const resources = createCArmRigResources(preset);
    const pose = {
      ...REFERENCE_C_ARM_POSE,
      translationX: 31,
      translationY: -47,
      swivelDegrees: 18,
      orbitDegrees: 33,
    };
    const model = createCArmRigRenderModel(pose, preset, resources, true);

    expect(model.rigTransform).toEqual(
      buildCArmGeometry(pose, preset).rigTransform,
    );
    expect(
      model.nodes.find(({ name }) => name === "Source aperture")?.position,
    ).toEqual(resources.local.source);

    disposeCArmRigResources(resources);
  });

  it("builds the active face from the exact local detector corners", () => {
    const resources = createCArmRigResources(C_ARM_RIG_PRESETS.isocentric);
    const position = resources.activeFaceGeometry.getAttribute("position");

    resources.local.detectorCorners.forEach((corner, index) => {
      expect(position.getX(index)).toBeCloseTo(corner[0], 8);
      expect(position.getY(index)).toBeCloseTo(
        corner[1] - ACTIVE_FACE_INSET,
        4,
      );
      expect(position.getZ(index)).toBeCloseTo(corner[2], 8);
    });

    disposeCArmRigResources(resources);
  });

  it("explicitly owns and disposes all external rig geometries", () => {
    const { result, unmount } = renderHook(() =>
      useCArmRigResources(C_ARM_RIG_PRESETS.isocentric),
    );
    const disposals = [
      result.current.integrated.geometry,
      result.current.activeFaceGeometry,
      result.current.arcHighlightGeometry,
      result.current.beamGeometry,
    ].map((geometry) => {
      const listener = vi.fn();
      geometry.addEventListener("dispose", listener);
      return listener;
    });

    unmount();

    disposals.forEach((listener) => expect(listener).toHaveBeenCalledOnce());
  });
});

describe("WebGLErrorFallback", () => {
  it("rejects a failed WebGL renderer probe", () => {
    expect(
      canInitializeWebGL(() => {
        throw new Error("WebGL context unavailable");
      }),
    ).toBe(false);
  });

  it("releases a successful WebGL renderer probe", () => {
    const renderer = {
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
    };

    expect(canInitializeWebGL(() => renderer)).toBe(true);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
  });

  it("explains the limitation and offers graphics recovery", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(<WebGLErrorFallback onReset={onReset} />);

    expect(
      screen.getByText("The 3D view could not start on this device"),
    ).toBeInTheDocument();
    expect(screen.getByText(/educational visualisation/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset graphics" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
