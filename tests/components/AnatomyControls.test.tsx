import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Group, Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnatomyAssetProvider,
  type AnatomyAssetLease,
} from "../../src/anatomy/AnatomyAssetProvider";
import type { LoadedHipAnatomy } from "../../src/anatomy/anatomyAssetLoader";
import { REFERENCE_HIP_ANATOMY_POSE } from "../../src/anatomy/anatomyTypes";
import type {
  LoadedRegionalAnatomy,
  RegionalAnatomyAssetLease,
} from "../../src/anatomy/regionalAnatomyTypes";
import { AnatomyControls } from "../../src/components/controls/AnatomyControls";
import { REFERENCE_C_ARM_POSE } from "../../src/engine/geometry/geometryTypes";
import { useSimulationStore } from "../../src/state/simulationStore";

const appCss = readFileSync(join(process.cwd(), "src/styles/app.css"), "utf8");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function baseResource(): LoadedHipAnatomy {
  return {
    groups: new Map(),
    hipPivots: {
      left: new Vector3(85.58369749004112, 0, 0),
      right: new Vector3(-85.58369749004112, 0, 0),
    },
    scene: new Group(),
  };
}

function regionalResource(): LoadedRegionalAnatomy {
  return {
    groups: {} as LoadedRegionalAnatomy["groups"],
    hipPivots: {
      left: new Vector3(85.58369749004112, 0, 0),
      right: new Vector3(-85.58369749004112, 0, 0),
    },
    scene: new Group(),
  };
}

function renderControls(
  acquireRegionalLease: () => RegionalAnatomyAssetLease = () => ({
    promise: new Promise<LoadedRegionalAnatomy>(() => undefined),
    release: vi.fn(),
  }),
) {
  const acquireLease = (): AnatomyAssetLease => ({
    promise: Promise.resolve(baseResource()),
    release: vi.fn(),
  });
  return render(
    <AnatomyAssetProvider
      acquireLease={acquireLease}
      acquireRegionalLease={acquireRegionalLease}
    >
      <AnatomyControls />
    </AnatomyAssetProvider>,
  );
}

beforeEach(() => {
  useSimulationStore.setState({
    cArmPose: { ...REFERENCE_C_ARM_POSE },
    cArmMode: "isocentric",
    hipAnatomyPose: {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [...REFERENCE_HIP_ANATOMY_POSE.rootPosition],
      rootRotationDegrees: [...REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees],
    },
    anatomyPresentationMode: "bones-only",
    interactionMode: "inspect",
    quality: "medium",
    showBeam: true,
  });
});

function getAnatomyControls() {
  const user = userEvent.setup();
  return { group: screen.getByRole("group", { name: "Anatomy" }), user };
}

describe("AnatomyControls", () => {
  it("is always expanded without a disclosure control", () => {
    renderControls();

    expect(screen.getByRole("group", { name: "Anatomy" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Anatomy" }),
    ).not.toBeInTheDocument();
  });

  it("exposes semantic side visibility controls and one clinical slider", async () => {
    renderControls();
    const { group } = getAnatomyControls();

    expect(group).toBeVisible();
    expect(
      within(group).getByRole("radio", { name: "Both legs" }),
    ).toBeChecked();
    expect(
      within(group).getByRole("radio", { name: "Select left leg" }),
    ).toBeChecked();
    expect(
      within(group).getByRole("slider", {
        name: "Left leg internal or external rotation",
      }),
    ).toHaveAttribute("min", "-45");
    expect(
      within(group).getByText("Rotate the selected complete leg at the hip."),
    ).toBeVisible();
  });

  it("defaults to Bones only and explains that the X-ray is unchanged", () => {
    renderControls();
    const { group } = getAnatomyControls();

    expect(
      within(group).getByRole("radio", { name: "Show bones only in 3D" }),
    ).toBeChecked();
    expect(
      within(group).getByRole("radio", {
        name: "Show full regional anatomy in 3D",
      }),
    ).not.toBeChecked();
    expect(within(group).getByText("X-rays remain bones only")).toBeVisible();
  });

  it("lazy loads Full regional on first selection and reuses the ready resource", async () => {
    const pending = deferred<LoadedRegionalAnatomy>();
    const acquireRegionalLease = vi.fn((): RegionalAnatomyAssetLease => ({
      promise: pending.promise,
      release: vi.fn(),
    }));
    renderControls(acquireRegionalLease);
    const { group, user } = getAnatomyControls();
    const fullRegional = within(group).getByRole("radio", {
      name: "Show full regional anatomy in 3D",
    });

    expect(acquireRegionalLease).not.toHaveBeenCalled();
    await user.click(fullRegional);

    expect(fullRegional).toBeChecked();
    expect(acquireRegionalLease).toHaveBeenCalledOnce();
    expect(
      within(group).getByRole("status", {
        name: "Regional anatomy status",
      }),
    ).toHaveTextContent("Loading full regional anatomy");
    expect(
      within(group).getByRole("radio", { name: "Both legs" }),
    ).toBeEnabled();

    await act(async () => pending.resolve(regionalResource()));
    expect(
      within(group).queryByRole("status", {
        name: "Regional anatomy status",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      within(group).getByRole("radio", { name: "Show bones only in 3D" }),
    );
    await user.click(fullRegional);
    expect(acquireRegionalLease).toHaveBeenCalledOnce();
  });

  it("falls back to Bones only after failure and retries from the retained notice", async () => {
    const first = deferred<LoadedRegionalAnatomy>();
    const second = deferred<LoadedRegionalAnatomy>();
    const acquireRegionalLease = vi
      .fn<() => RegionalAnatomyAssetLease>()
      .mockReturnValueOnce({ promise: first.promise, release: vi.fn() })
      .mockReturnValueOnce({ promise: second.promise, release: vi.fn() });
    renderControls(acquireRegionalLease);
    const { group, user } = getAnatomyControls();

    await user.click(
      within(group).getByRole("radio", {
        name: "Show full regional anatomy in 3D",
      }),
    );
    await act(async () => first.reject(new Error("Regional asset failed")));

    await waitFor(() =>
      expect(
        within(group).getByRole("radio", { name: "Show bones only in 3D" }),
      ).toBeChecked(),
    );
    expect(
      within(group).getByRole("alert", { name: "Regional anatomy status" }),
    ).toHaveTextContent("Full regional anatomy unavailable");

    await user.click(
      within(group).getByRole("button", {
        name: "Retry full regional anatomy",
      }),
    );

    expect(
      within(group).getByRole("radio", {
        name: "Show full regional anatomy in 3D",
      }),
    ).toBeChecked();
    expect(acquireRegionalLease).toHaveBeenCalledTimes(2);
    expect(
      within(group).getByRole("status", {
        name: "Regional anatomy status",
      }),
    ).toHaveTextContent("Loading full regional anatomy");

    await act(async () => second.resolve(regionalResource()));
  });

  it("resumes a persisted Full regional selection when its provider is recreated", async () => {
    const pending = deferred<LoadedRegionalAnatomy>();
    const acquireRegionalLease = vi.fn((): RegionalAnatomyAssetLease => ({
      promise: pending.promise,
      release: vi.fn(),
    }));
    useSimulationStore
      .getState()
      .setAnatomyPresentationMode("full-regional");

    renderControls(acquireRegionalLease);

    await waitFor(() => expect(acquireRegionalLease).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("radio", {
        name: "Show full regional anatomy in 3D",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("status", { name: "Regional anatomy status" }),
    ).toHaveTextContent("Loading full regional anatomy");

    await act(async () => pending.resolve(regionalResource()));
  });

  it("auto-selects a single visible leg and restores the bilateral selector", async () => {
    renderControls();
    const { group, user } = getAnatomyControls();

    await user.click(
      within(group).getByRole("radio", { name: "Right leg only" }),
    );
    expect(useSimulationStore.getState().hipAnatomyPose).toMatchObject({
      selectedSide: "right",
      regionVisibility: {
        "left-leg": false,
        "right-leg": true,
      },
    });
    expect(
      within(group).queryByRole("radio", { name: "Select left leg" }),
    ).not.toBeInTheDocument();
    expect(
      within(group).getByRole("slider", {
        name: "Right leg internal or external rotation",
      }),
    ).toBeVisible();

    await user.click(within(group).getByRole("radio", { name: "Both legs" }));
    expect(
      within(group).getByRole("radio", { name: "Select right leg" }),
    ).toBeChecked();
  });

  it("does not misreport a selected legacy leg mode when both legs are hidden", () => {
    useSimulationStore.getState().hideAllAnatomyRegions();
    renderControls();
    const { group } = getAnatomyControls();

    ["Both legs", "Left leg only", "Right leg only"].forEach((name) => {
      expect(within(group).getByRole("radio", { name })).not.toBeChecked();
    });
    expect(
      within(group).queryByRole("group", { name: "Leg to rotate" }),
    ).not.toBeInTheDocument();
  });

  it("retains independent angles when visibility and selection change", async () => {
    renderControls();
    const { group, user } = getAnatomyControls();
    const leftRotation = within(group).getByRole("slider", {
      name: "Left leg internal or external rotation",
    });

    fireEvent.change(leftRotation, { target: { value: "30" } });
    expect(within(group).getByText("+30°")).toBeVisible();
    await user.click(
      within(group).getByRole("radio", { name: "Select right leg" }),
    );
    fireEvent.change(
      within(group).getByRole("slider", {
        name: "Right leg internal or external rotation",
      }),
      { target: { value: "-12" } },
    );
    expect(within(group).getByText("−12°")).toBeVisible();

    await user.click(
      within(group).getByRole("radio", { name: "Select left leg" }),
    );
    expect(
      within(group).getByRole("slider", {
        name: "Left leg internal or external rotation",
      }),
    ).toHaveValue("30");
    expect(useSimulationStore.getState().hipAnatomyPose).toMatchObject({
      leftHipRotationDegrees: 30,
      rightHipRotationDegrees: -12,
    });
  });

  it("uses a native one-degree range control for keyboard operation", async () => {
    renderControls();
    const { group } = getAnatomyControls();
    const slider = within(group).getByRole("slider", {
      name: "Left leg internal or external rotation",
    });

    expect(slider).toHaveAttribute("max", "45");
    expect(slider).toHaveAttribute("step", "1");
    slider.focus();
    expect(slider).toHaveFocus();
  });

  it("resets anatomy locally without changing C-arm geometry", async () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 27);
    useSimulationStore.getState().setCArmParameter("translationX", 80);
    const cArmBefore = useSimulationStore.getState().cArmPose;
    useSimulationStore.getState().setAnatomyRegionVisible("left-leg", false);
    useSimulationStore.getState().setSelectedHipRotation(31);
    useSimulationStore
      .getState()
      .setAnatomyPresentationMode("full-regional");
    renderControls();
    const { group, user } = getAnatomyControls();

    await user.click(
      within(group).getByRole("button", { name: "Reset anatomy" }),
    );

    expect(useSimulationStore.getState().hipAnatomyPose).toEqual(
      REFERENCE_HIP_ANATOMY_POSE,
    );
    expect(useSimulationStore.getState().cArmPose).toEqual(cArmBefore);
    expect(useSimulationStore.getState().anatomyPresentationMode).toBe(
      "bones-only",
    );
  });

  it("keeps the complete Open3DModel creator and licence attribution inline", () => {
    renderControls();

    expect(
      screen.getByRole("link", { name: "AnatomyTOOL Open3DModel" }),
    ).toHaveAttribute("href", "https://anatomytool.org/open3dmodel");
    expect(screen.getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    expect(screen.getByText(/George J\.R\. Maat/)).toBeVisible();
    expect(screen.getByText(/Jan Kooloos/)).toBeVisible();
    expect(screen.getByText(/full regional derivative/)).toBeVisible();
  });

  it("keeps the anatomy rotation slider at least 44px tall on mobile", () => {
    expect(appCss).toMatch(
      /@media \(max-width: 759px\)\s*\{[\s\S]*?\.anatomy-controls__rotation input[\s\S]*?min-block-size:\s*var\(--target-min\)/,
    );
  });

  it("gives segmented controls 44px targets and visible keyboard focus", () => {
    expect(appCss).toMatch(
      /\.anatomy-controls__segments label > span:first-of-type\s*\{[^}]*min-block-size:\s*var\(--target-min\)/s,
    );
    expect(appCss).toMatch(
      /\.anatomy-controls__segments input:focus-visible \+ span\s*\{[^}]*box-shadow:\s*var\(--focus-ring\)/s,
    );
    expect(appCss).toMatch(
      /\.anatomy-controls__rotation input\s*\{[^}]*min-block-size:\s*var\(--target-min\)/s,
    );
    expect(appCss).toMatch(
      /\.anatomy-controls__reset\s*\{[^}]*min-block-size:\s*var\(--target-min\)/s,
    );
  });
});
