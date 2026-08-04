import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  Color,
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
  projectWorldAxisToScreen,
  projectWorldPointToScreen,
  rayPassesWithinWorldRadius,
  screenTangentDelta,
  signedScreenAngle,
} from "../../src/components/scene/cArmManipulatorMath";
import {
  C_ARM_CUE_GEOMETRY,
  C_ARM_CUE_HIT_TARGET_LAYOUT,
  C_ARM_MANIPULATOR_CONTROL_DEFINITIONS,
  cArmManipulatorScreenDragDelta,
  cArmCueGlyphMaximumExtent,
  cArmCueHitTargetContainsPoint,
  cArmCueTargetMinimumExtent,
  cueAppearance,
  createCArmDragController,
  createCArmManipulatorRenderModel,
  createTranslationHitTargetRaycastLayout,
  isCArmCancelKey,
  resolveCArmManipulatorScreenTangent,
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
    .applyQuaternion(new Quaternion(...geometry.rigTransform.quaternion))
    .add(new Vector3(...geometry.rigTransform.position));
  return [point.x, point.y, point.z];
}

function colorLightness(color: string): number {
  return new Color(color).getHSL({ h: 0, l: 0, s: 0 }).l;
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
    expect(source).not.toContain("AnatomicalPlaceholder");
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

  it("keeps every edge-on linear cue draggable without changing another pose field", () => {
    const start = { ...REFERENCE_C_ARM_POSE };
    const linearControls = C_ARM_MANIPULATOR_CONTROL_DEFINITIONS.filter(
      (definition) =>
        definition.id === "tilt" || definition.kind === "translation",
    );

    linearControls.forEach((definition) => {
      const tangent = resolveCArmManipulatorScreenTangent(definition, [0, 0]);
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

  it("measures signed swivel angle around the active pivot", () => {
    expect(signedScreenAngle([0, 0], [10, 0], [0, 10])).toBeCloseTo(90);
    expect(signedScreenAngle([0, 0], [10, 0], [0, -10])).toBeCloseTo(-90);
    expect(signedScreenAngle([0, 0], [0, 0], [0, 10])).toBe(0);
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

  it("suspends camera controls only for active rig drags and anatomy mode", () => {
    expect(orbitControlsEnabled("inspect", false)).toBe(true);
    expect(orbitControlsEnabled("move-carm", false)).toBe(true);
    expect(orbitControlsEnabled("move-carm", true)).toBe(false);
    expect(orbitControlsEnabled("move-anatomy", false)).toBe(false);
  });
});

describe("integrated C-arm renderer", () => {
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
