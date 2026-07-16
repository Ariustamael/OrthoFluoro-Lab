import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_FACE_INSET,
  advanceHandleDragValue,
  calculateHandleValue,
  calculateIncrementalHandleValue,
  captureHandlePointer,
  createCArmRigRenderModel,
  createCArmRigResources,
  disposeCArmRigResources,
  releaseHandlePointer,
  useCArmRigResources,
} from "../../src/components/scene/CArmRig";
import {
  advanceAnatomyRotationValue,
  ANATOMY_ROTATION_HANDLE_DEFINITIONS,
} from "../../src/components/scene/TheatreScene";
import {
  canInitializeWebGL,
  WebGLErrorFallback,
} from "../../src/components/scene/WebGLErrorFallback";
import { C_ARM_RIG_PRESETS } from "../../src/engine/geometry/cArmRigPresets";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";

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
      calculateHandleValue(
        10,
        7,
        0.5,
        { altKey: false, shiftKey: true },
        5,
      ),
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

describe("direct anatomy rotation handles", () => {
  it("defines one visible rotation ring for every object axis", () => {
    expect(
      ANATOMY_ROTATION_HANDLE_DEFINITIONS.map(({ axis, index }) => ({
        axis,
        index,
      })),
    ).toEqual([
      { axis: "X", index: 0 },
      { axis: "Y", index: 1 },
      { axis: "Z", index: 2 },
    ]);
  });

  it("supports ordinary, snapped, and fine object rotation drags", () => {
    expect(
      advanceAnatomyRotationValue(0, 0, 10, {
        altKey: false,
        shiftKey: false,
      }).value,
    ).toBe(4);
    expect(
      advanceAnatomyRotationValue(0, 0, 11, {
        altKey: false,
        shiftKey: true,
      }).value,
    ).toBe(5);
    expect(
      advanceAnatomyRotationValue(0, 0, 10, {
        altKey: true,
        shiftKey: false,
      }).value,
    ).toBeCloseTo(0.4);
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
      "X-ray source",
      "X-ray beam",
    ]);
    expect(hidden.nodes.map(({ name }) => name)).toEqual(
      visible.nodes.slice(0, -1).map(({ name }) => name),
    );

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
    expect(nonIsocentric.rigTransform).not.toEqual(
      isocentric.rigTransform,
    );

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
      model.nodes.find(({ name }) => name === "X-ray source")?.position,
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
