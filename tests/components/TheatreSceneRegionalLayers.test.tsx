import { render, screen } from "@testing-library/react";
import { act } from "react";
import { Group } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnatomyAssetContextValue } from "../../src/anatomy/AnatomyAssetProvider";
import { HipAnatomyLayer } from "../../src/components/scene/TheatreScene";
import { useSimulationStore } from "../../src/state/simulationStore";

const mocks = vi.hoisted(() => ({
  useAnatomyAsset: vi.fn(),
}));

vi.mock("../../src/anatomy/AnatomyAssetProvider", () => ({
  useAnatomyAsset: mocks.useAnatomyAsset,
}));
vi.mock("../../src/components/scene/HipAnatomy", () => ({
  HipAnatomy: () => <div data-testid="skeleton-layer" />,
}));
vi.mock("../../src/components/scene/RegionalAnatomy", () => ({
  RegionalAnatomy: () => <div data-testid="regional-layer" />,
}));

function anatomyContext(
  regionalStatus: AnatomyAssetContextValue["regional"]["status"],
): AnatomyAssetContextValue {
  return {
    error: null,
    regional: {
      error: null,
      load: vi.fn(),
      resource:
        regionalStatus === "ready"
          ? ({ scene: new Group() } as AnatomyAssetContextValue["regional"]["resource"])
          : null,
      retry: vi.fn(),
      status: regionalStatus,
    },
    resource: { scene: new Group() } as AnatomyAssetContextValue["resource"],
    retry: vi.fn(),
    status: "ready",
  };
}

describe("TheatreScene regional anatomy layers", () => {
  beforeEach(() => {
    useSimulationStore.setState({ anatomyPresentationMode: "bones-only" });
  });

  it.each(["idle", "loading", "error", "ready"] as const)(
    "keeps the skeleton mounted in bones-only mode when regional status is %s",
    (regionalStatus) => {
      mocks.useAnatomyAsset.mockReturnValue(anatomyContext(regionalStatus));

      render(<HipAnatomyLayer />);

      expect(screen.getByTestId("skeleton-layer")).toBeInTheDocument();
      expect(screen.queryByTestId("regional-layer")).not.toBeInTheDocument();
    },
  );

  it("keeps the skeleton mounted while the full-regional supplement loads", () => {
    mocks.useAnatomyAsset.mockReturnValue(anatomyContext("loading"));
    act(() => {
      useSimulationStore.setState({ anatomyPresentationMode: "full-regional" });
    });

    render(<HipAnatomyLayer />);

    expect(screen.getByTestId("skeleton-layer")).toBeInTheDocument();
    expect(screen.queryByTestId("regional-layer")).not.toBeInTheDocument();
  });

  it("layers the ready regional supplement over the mounted skeleton", () => {
    mocks.useAnatomyAsset.mockReturnValue(anatomyContext("ready"));
    act(() => {
      useSimulationStore.setState({ anatomyPresentationMode: "full-regional" });
    });

    render(<HipAnatomyLayer />);

    expect(screen.getByTestId("skeleton-layer")).toBeInTheDocument();
    expect(screen.getByTestId("regional-layer")).toBeInTheDocument();
  });
});
