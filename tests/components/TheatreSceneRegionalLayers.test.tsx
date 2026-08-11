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
vi.mock("../../src/components/scene/FullBodyAnatomy", () => ({
  FullBodyAnatomy: ({ complement }: { complement: Group | null }) => (
    <div
      data-composition={complement === null ? "hip-only" : "full-body"}
      data-testid="base-bone-layer"
    />
  ),
}));
vi.mock("../../src/components/scene/RegionalAnatomy", () => ({
  RegionalAnatomy: () => <div data-testid="regional-layer" />,
}));

function anatomyContext(
  regionalStatus: AnatomyAssetContextValue["regional"]["status"],
  complementStatus: AnatomyAssetContextValue["fullBodyComplement"]["status"] =
    "ready",
): AnatomyAssetContextValue {
  return {
    error: null,
    fullBodyComplement: {
      error:
        complementStatus === "error"
          ? new Error("Complement unavailable")
          : null,
      resource:
        complementStatus === "ready"
          ? ({ scene: new Group() } as AnatomyAssetContextValue["fullBodyComplement"]["resource"])
          : null,
      retry: vi.fn(),
      status: complementStatus,
    },
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

      expect(screen.getByTestId("base-bone-layer")).toHaveAttribute(
        "data-composition",
        "full-body",
      );
      expect(screen.queryByTestId("regional-layer")).not.toBeInTheDocument();
    },
  );

  it("keeps the skeleton mounted while the full-regional supplement loads", () => {
    mocks.useAnatomyAsset.mockReturnValue(anatomyContext("loading"));
    act(() => {
      useSimulationStore.setState({ anatomyPresentationMode: "full-regional" });
    });

    render(<HipAnatomyLayer />);

    expect(screen.getByTestId("base-bone-layer")).toBeInTheDocument();
    expect(screen.queryByTestId("regional-layer")).not.toBeInTheDocument();
  });

  it("layers the ready regional supplement over the mounted skeleton", () => {
    mocks.useAnatomyAsset.mockReturnValue(anatomyContext("ready"));
    act(() => {
      useSimulationStore.setState({ anatomyPresentationMode: "full-regional" });
    });

    render(<HipAnatomyLayer />);

    expect(screen.getByTestId("base-bone-layer")).toBeInTheDocument();
    expect(screen.getByTestId("regional-layer")).toBeInTheDocument();
  });

  it.each(["loading", "error"] as const)(
    "keeps the detailed hip base usable while the complement is %s",
    (complementStatus) => {
      mocks.useAnatomyAsset.mockReturnValue(
        anatomyContext("idle", complementStatus),
      );

      render(<HipAnatomyLayer />);

      expect(screen.getAllByTestId("base-bone-layer")).toHaveLength(1);
      expect(screen.getByTestId("base-bone-layer")).toHaveAttribute(
        "data-composition",
        "hip-only",
      );
      expect(screen.queryByText("Anatomy unavailable")).not.toBeInTheDocument();
    },
  );

  it("atomically replaces the hip-only composition when the complement becomes ready", () => {
    mocks.useAnatomyAsset.mockReturnValue(anatomyContext("idle", "loading"));
    const view = render(<HipAnatomyLayer />);
    expect(screen.getByTestId("base-bone-layer")).toHaveAttribute(
      "data-composition",
      "hip-only",
    );

    mocks.useAnatomyAsset.mockReturnValue(anatomyContext("idle", "ready"));
    view.rerender(<HipAnatomyLayer />);

    expect(screen.getAllByTestId("base-bone-layer")).toHaveLength(1);
    expect(screen.getByTestId("base-bone-layer")).toHaveAttribute(
      "data-composition",
      "full-body",
    );
  });
});
