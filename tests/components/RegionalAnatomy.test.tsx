import { act, renderHook } from "@testing-library/react";
import { Group } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import type { LoadedRegionalAnatomy } from "../../src/anatomy/regionalAnatomyTypes";
import { useRegionalAnatomyScene } from "../../src/components/scene/RegionalAnatomy";
import { useSimulationStore } from "../../src/state/simulationStore";

const mocks = vi.hoisted(() => {
  const views: Array<{ dispose: ReturnType<typeof vi.fn>; root: object }> = [];
  return {
    createRegionalAnatomyScene: vi.fn(() => {
      const view = { dispose: vi.fn(), root: {} };
      views.push(view);
      return view;
    }),
    updateRegionalAnatomyScene: vi.fn(),
    views,
  };
});

vi.mock("../../src/anatomy/regionalAnatomyScene", () => ({
  createRegionalAnatomyScene: mocks.createRegionalAnatomyScene,
  updateRegionalAnatomyScene: mocks.updateRegionalAnatomyScene,
}));

function resource(): LoadedRegionalAnatomy {
  return { scene: new Group() } as LoadedRegionalAnatomy;
}

describe("RegionalAnatomy", () => {
  beforeEach(() => {
    mocks.createRegionalAnatomyScene.mockClear();
    mocks.updateRegionalAnatomyScene.mockClear();
    mocks.views.length = 0;
    useSimulationStore.setState({
      hipAnatomyPose: { ...REFERENCE_HIP_ANATOMY_POSE },
    });
  });

  it("memoizes one clone per resource and applies each authoritative pose", () => {
    const firstResource = resource();
    const secondResource = resource();
    const { result, rerender } = renderHook(
      ({ asset }) => useRegionalAnatomyScene(asset),
      { initialProps: { asset: firstResource } },
    );

    expect(result.current).toBe(mocks.views[0]);
    expect(mocks.createRegionalAnatomyScene).toHaveBeenCalledOnce();
    expect(mocks.updateRegionalAnatomyScene).toHaveBeenLastCalledWith(
      mocks.views[0],
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
    expect(mocks.updateRegionalAnatomyScene).toHaveBeenLastCalledWith(
      mocks.views[0],
      expect.objectContaining({ leftHipRotationDegrees: 24 }),
    );

    rerender({ asset: firstResource });
    expect(mocks.createRegionalAnatomyScene).toHaveBeenCalledOnce();

    rerender({ asset: secondResource });
    expect(mocks.createRegionalAnatomyScene).toHaveBeenCalledTimes(2);
    expect(mocks.views[0]?.dispose).toHaveBeenCalledOnce();
    expect(result.current).toBe(mocks.views[1]);
  });

  it("disposes clone-owned resources on unmount", () => {
    const { unmount } = renderHook(() =>
      useRegionalAnatomyScene(resource()),
    );

    unmount();

    expect(mocks.views[0]?.dispose).toHaveBeenCalledOnce();
  });
});
