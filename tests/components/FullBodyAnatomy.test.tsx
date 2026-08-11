import { act, renderHook } from "@testing-library/react";
import { Group } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadedHipAnatomy } from "../../src/anatomy/anatomyAssetLoader";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import type { LoadedFullBodyComplement } from "../../src/anatomy/fullBodyAnatomyTypes";
import { useFullBodyAnatomyScene } from "../../src/components/scene/FullBodyAnatomy";
import { useSimulationStore } from "../../src/state/simulationStore";

const mocks = vi.hoisted(() => {
  const views: Array<{ dispose: ReturnType<typeof vi.fn>; root: Group }> = [];
  return {
    createFullBodyAnatomyViewportScene: vi.fn(() => {
      const view = { dispose: vi.fn(), root: new Group() };
      views.push(view);
      return view;
    }),
    updateFullBodyAnatomyViewportScene: vi.fn(),
    views,
  };
});

vi.mock("../../src/anatomy/fullBodyAnatomyScene", () => ({
  createFullBodyAnatomyViewportScene:
    mocks.createFullBodyAnatomyViewportScene,
  updateFullBodyAnatomyViewportScene:
    mocks.updateFullBodyAnatomyViewportScene,
}));

function hipResource(): LoadedHipAnatomy {
  return { scene: new Group() } as LoadedHipAnatomy;
}

function complementResource(): LoadedFullBodyComplement {
  return { scene: new Group() } as LoadedFullBodyComplement;
}

describe("FullBodyAnatomy", () => {
  beforeEach(() => {
    mocks.createFullBodyAnatomyViewportScene.mockClear();
    mocks.updateFullBodyAnatomyViewportScene.mockClear();
    mocks.views.length = 0;
    useSimulationStore.setState({
      hipAnatomyPose: { ...REFERENCE_HIP_ANATOMY_POSE },
    });
  });

  it("memoizes one scene by hip and complement resource identity", () => {
    const hip = hipResource();
    const firstComplement = complementResource();
    const secondComplement = complementResource();
    const { result, rerender } = renderHook(
      ({ complement }) => useFullBodyAnatomyScene(hip, complement),
      { initialProps: { complement: null as LoadedFullBodyComplement | null } },
    );

    expect(result.current).toBe(mocks.views[0]);
    expect(mocks.createFullBodyAnatomyViewportScene).toHaveBeenCalledOnce();
    expect(mocks.createFullBodyAnatomyViewportScene).toHaveBeenLastCalledWith(
      { complement: null, hip },
      { cloneMaterials: true },
    );

    rerender({ complement: null });
    expect(mocks.createFullBodyAnatomyViewportScene).toHaveBeenCalledOnce();

    rerender({ complement: firstComplement });
    expect(mocks.createFullBodyAnatomyViewportScene).toHaveBeenCalledTimes(2);
    expect(mocks.views[0]?.dispose).toHaveBeenCalledOnce();
    expect(result.current).toBe(mocks.views[1]);

    rerender({ complement: firstComplement });
    expect(mocks.createFullBodyAnatomyViewportScene).toHaveBeenCalledTimes(2);

    rerender({ complement: secondComplement });
    expect(mocks.createFullBodyAnatomyViewportScene).toHaveBeenCalledTimes(3);
    expect(mocks.views[1]?.dispose).toHaveBeenCalledOnce();
    expect(result.current).toBe(mocks.views[2]);
  });

  it("applies authoritative pose changes without rebuilding the scene", () => {
    const hip = hipResource();
    const complement = complementResource();
    const { result } = renderHook(() =>
      useFullBodyAnatomyScene(hip, complement),
    );

    expect(mocks.updateFullBodyAnatomyViewportScene).toHaveBeenLastCalledWith(
      result.current,
      REFERENCE_HIP_ANATOMY_POSE,
    );

    act(() => {
      useSimulationStore.setState((state) => ({
        hipAnatomyPose: {
          ...state.hipAnatomyPose,
          leftHipRotationDegrees: 24,
        },
      }));
    });

    expect(mocks.createFullBodyAnatomyViewportScene).toHaveBeenCalledOnce();
    expect(mocks.updateFullBodyAnatomyViewportScene).toHaveBeenLastCalledWith(
      result.current,
      expect.objectContaining({ leftHipRotationDegrees: 24 }),
    );
  });

  it("disposes the scene-owned clone on unmount", () => {
    const { unmount } = renderHook(() =>
      useFullBodyAnatomyScene(hipResource(), null),
    );

    unmount();

    expect(mocks.views[0]?.dispose).toHaveBeenCalledOnce();
  });
});
