import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  C_ARM_HANDLE_DEFINITIONS,
  advanceHandleDragValue,
  calculateHandleValue,
  calculateIncrementalHandleValue,
  captureHandlePointer,
  createRigTransform,
  handlesForInteractionMode,
  releaseHandlePointer,
} from "../../src/components/scene/CArmRig";
import {
  canInitializeWebGL,
  WebGLErrorFallback,
} from "../../src/components/scene/WebGLErrorFallback";
import { buildCArmGeometry } from "../../src/engine/geometry/cArmTransforms";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";

describe("direct C-arm handle deltas", () => {
  it("defines every required manipulation handle with a live-readout scale", () => {
    expect(
      C_ARM_HANDLE_DEFINITIONS.map(
        ({
          label,
          parameter,
          snapDescription,
          snapIncrement,
          unit,
          unitsPerPixel,
        }) => ({
          label,
          parameter,
          snapDescription,
          snapIncrement,
          unit,
          unitsPerPixel,
        }),
      ),
    ).toEqual([
      {
        label: "Orbit",
        parameter: "orbitDegrees",
        snapDescription: "Shift snaps to 5° increments",
        snapIncrement: 5,
        unit: "°",
        unitsPerPixel: 0.5,
      },
      {
        label: "Obliquity",
        parameter: "obliquityDegrees",
        snapDescription: "Shift snaps to 5° increments",
        snapIncrement: 5,
        unit: "°",
        unitsPerPixel: 0.5,
      },
      {
        label: "Cranial/caudal tilt",
        parameter: "cranialCaudalDegrees",
        snapDescription: "Shift snaps to 5° increments",
        snapIncrement: 5,
        unit: "°",
        unitsPerPixel: 0.5,
      },
      {
        label: "Height",
        parameter: "height",
        snapDescription: "Shift snaps to 10 mm increments",
        snapIncrement: 10,
        unit: "mm",
        unitsPerPixel: 2,
      },
      {
        label: "Horizontal translation",
        parameter: "translationX",
        snapDescription: "Shift snaps to 10 mm increments",
        snapIncrement: 10,
        unit: "mm",
        unitsPerPixel: 2,
      },
      {
        label: "Source-detector distance",
        parameter: "sourceDetectorDistance",
        snapDescription: "Shift snaps to 10 mm increments",
        snapIncrement: 10,
        unit: "mm",
        unitsPerPixel: 2,
      },
    ]);
  });

  it("shows direct handles only in Move C-arm mode", () => {
    expect(handlesForInteractionMode("inspect")).toEqual([]);
    expect(handlesForInteractionMode("move-anatomy")).toEqual([]);
    expect(
      handlesForInteractionMode("move-carm").map(
        (definition) => definition.parameter,
      ),
    ).toEqual([
      "orbitDegrees",
      "obliquityDegrees",
      "cranialCaudalDegrees",
      "height",
      "translationX",
      "sourceDetectorDistance",
    ]);
  });

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
        {
          altKey: false,
          shiftKey: true,
        },
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

describe("C-arm renderer transform", () => {
  it("preserves detector roll around the centre ray", () => {
    const geometry = buildCArmGeometry({
      ...REFERENCE_C_ARM_POSE,
      obliquityDegrees: 30,
    });
    const transform = createRigTransform(geometry);
    const { x, y, z, w } = transform.quaternion;
    const renderedUAxis = [
      1 - 2 * (y * y + z * z),
      2 * (x * y + z * w),
      2 * (x * z - y * w),
    ];

    renderedUAxis.forEach((coordinate, index) => {
      expect(coordinate).toBeCloseTo(geometry.detector.uAxis[index], 8);
    });
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
