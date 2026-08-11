import { StrictMode, createElement, createRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnatomyCameraFit,
  fitPerspectiveCameraToSphere,
  fitTheatreCameraToVisibleAnatomy,
  visibleAnatomySphere,
} from "../../src/components/scene/anatomyCameraFit";
import { useSimulationStore } from "../../src/state/simulationStore";

const r3f = vi.hoisted(() => ({
  camera: null as unknown as PerspectiveCamera,
  invalidate: vi.fn(),
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: typeof r3f) => unknown) => selector(r3f),
}));

function visibleBoxRoot(): Group {
  const root = new Group();
  const visible = new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial());
  visible.position.set(10, 20, 30);
  const hidden = new Mesh(
    new BoxGeometry(100, 100, 100),
    new MeshBasicMaterial(),
  );
  hidden.position.set(1000, 0, 0);
  hidden.visible = false;
  root.add(visible, hidden);
  return root;
}

describe("anatomy camera fit", () => {
  beforeEach(() => {
    r3f.invalidate.mockClear();
    r3f.camera = new PerspectiveCamera(42, 1.5, 1, 8000);
    r3f.camera.position.set(12, 8, 16);
    r3f.camera.lookAt(0, 0, 0);
    r3f.camera.updateMatrixWorld();
    useSimulationStore.setState({ fitAnatomyRequestRevision: 0 });
  });

  it("derives a world-space sphere from visible meshes only after updating the root matrix", () => {
    const root = visibleBoxRoot();
    root.position.set(5, -2, 7);
    const updateWorldMatrix = vi.spyOn(root, "updateWorldMatrix");

    const sphere = visibleAnatomySphere(root);

    expect(updateWorldMatrix).toHaveBeenCalledWith(true, true);
    expect(sphere).not.toBeNull();
    expect(sphere?.center.toArray()).toEqual([15, 18, 37]);
    expect(sphere?.radius).toBeCloseTo(Math.sqrt(14), 8);
  });

  it("fits the sphere with a bounded margin while preserving the current view direction", () => {
    const camera = new PerspectiveCamera(50, 0.75, 1, 8000);
    camera.position.set(14, 9, 21);
    camera.lookAt(2, 3, 4);
    camera.updateMatrixWorld();
    const beforeDirection = camera.getWorldDirection(new Vector3());
    const updateProjectionMatrix = vi.spyOn(camera, "updateProjectionMatrix");

    const result = fitPerspectiveCameraToSphere(
      camera,
      new Vector3(10, -5, 3),
      20,
      1.18,
    );

    expect(result.target.toArray()).toEqual([10, -5, 3]);
    expect(camera.getWorldDirection(new Vector3())).toEqual(beforeDirection);
    const fittedDirection = result.target
      .clone()
      .sub(result.position)
      .normalize();
    expect(fittedDirection.angleTo(beforeDirection)).toBeLessThan(1e-10);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.near);
    expect(updateProjectionMatrix).toHaveBeenCalledOnce();
  });

  it("updates camera, controls and only the supplied theatre invalidator", () => {
    const root = visibleBoxRoot();
    const camera = new PerspectiveCamera(42, 1.5, 1, 8000);
    camera.position.set(100, 60, 200);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const controls = {
      maxDistance: 3600,
      target: new Vector3(),
      update: vi.fn(),
    };
    const invalidate = vi.fn();

    expect(
      fitTheatreCameraToVisibleAnatomy({
        camera,
        controls,
        invalidate,
        root,
      }),
    ).toBe(true);
    expect(controls.target.toArray()).toEqual([10, 20, 30]);
    expect(controls.update).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("no-ops safely for empty and non-finite visible bounds", () => {
    const camera = new PerspectiveCamera(42, 1.5, 1, 8000);
    camera.position.set(8, 5, 13);
    const before = camera.position.clone();
    const controls = {
      maxDistance: 3600,
      target: new Vector3(1, 2, 3),
      update: vi.fn(),
    };
    const invalidate = vi.fn();
    const empty = new Group();
    const invalid = visibleBoxRoot();
    invalid.position.x = Number.NaN;

    expect(
      fitTheatreCameraToVisibleAnatomy({
        camera,
        controls,
        invalidate,
        root: empty,
      }),
    ).toBe(false);
    expect(
      fitTheatreCameraToVisibleAnatomy({
        camera,
        controls,
        invalidate,
        root: invalid,
      }),
    ).toBe(false);
    expect(camera.position).toEqual(before);
    expect(controls.target.toArray()).toEqual([1, 2, 3]);
    expect(controls.update).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("handles each new request once under Strict Mode and never fits on mount", async () => {
    const anatomyRootRef = createRef<Group>();
    anatomyRootRef.current = visibleBoxRoot();
    const controlsRef = createRef<{
      maxDistance: number;
      target: Vector3;
      update: () => void;
    }>();
    controlsRef.current = {
      maxDistance: 3600,
      target: new Vector3(),
      update: vi.fn(),
    };
    const lastHandledRevisionRef = createRef<number>();
    lastHandledRevisionRef.current = 0;
    const consumeFitAnatomyRevision = (revision: number) => {
      if (lastHandledRevisionRef.current === revision) return false;
      lastHandledRevisionRef.current = revision;
      return true;
    };

    render(
      createElement(
        StrictMode,
        null,
        createElement(AnatomyCameraFit, {
          anatomyRootRef,
          consumeFitAnatomyRevision,
          controlsRef,
        } as Parameters<typeof AnatomyCameraFit>[0]),
      ),
    );
    expect(r3f.invalidate).not.toHaveBeenCalled();

    act(() => useSimulationStore.getState().requestFitAnatomy());
    await waitFor(() => expect(r3f.invalidate).toHaveBeenCalledOnce());
    act(() => useSimulationStore.getState().setQuality("high"));
    expect(r3f.invalidate).toHaveBeenCalledOnce();
  });

  it("consumes a request made before Canvas mount once across transient remounts", async () => {
    useSimulationStore.setState({ fitAnatomyRequestRevision: 1 });
    const anatomyRootRef = createRef<Group>();
    anatomyRootRef.current = visibleBoxRoot();
    const controlsRef = createRef<{
      maxDistance: number;
      target: Vector3;
      update: () => void;
    }>();
    controlsRef.current = {
      maxDistance: 3600,
      target: new Vector3(),
      update: vi.fn(),
    };
    const lastHandledRevisionRef = createRef<number>();
    lastHandledRevisionRef.current = 0;
    const consumeFitAnatomyRevision = (revision: number) => {
      if (lastHandledRevisionRef.current === revision) return false;
      lastHandledRevisionRef.current = revision;
      return true;
    };
    const props = {
      anatomyRootRef,
      consumeFitAnatomyRevision,
      controlsRef,
    } as Parameters<typeof AnatomyCameraFit>[0];

    const firstMount = render(createElement(AnatomyCameraFit, props));
    await waitFor(() => expect(r3f.invalidate).toHaveBeenCalledOnce());
    firstMount.unmount();
    render(createElement(AnatomyCameraFit, props));

    expect(r3f.invalidate).toHaveBeenCalledOnce();
  });

  it("expands OrbitControls distance before update so portrait fits are not clamped", () => {
    const root = new Group();
    root.add(
      new Mesh(new BoxGeometry(1000, 2000, 500), new MeshBasicMaterial()),
    );
    const camera = new PerspectiveCamera(42, 0.5, 1, 8000);
    camera.position.set(0, 0, 2000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const controls = {
      maxDistance: 3600,
      target: new Vector3(),
      update: vi.fn(() => {
        const offset = camera.position.clone().sub(controls.target);
        if (offset.length() > controls.maxDistance) {
          camera.position.copy(
            controls.target.clone().add(offset.setLength(controls.maxDistance)),
          );
        }
      }),
    };

    expect(
      fitTheatreCameraToVisibleAnatomy({
        camera,
        controls,
        invalidate: vi.fn(),
        root,
      }),
    ).toBe(true);
    expect(controls.maxDistance).toBeGreaterThan(3600);
    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(3600);
  });
});
