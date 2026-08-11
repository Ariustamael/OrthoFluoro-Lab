import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CArmControls } from "../../src/components/controls/CArmControls";
import { InteractionMode } from "../../src/components/controls/InteractionMode";
import {
  AP_C_ARM_POSE,
  LATERAL_C_ARM_POSE,
} from "../../src/engine/geometry/anatomicalAxes";
import {
  REFERENCE_C_ARM_PHYSICAL_SETUP,
  REFERENCE_C_ARM_POSE,
} from "../../src/engine/geometry/geometryTypes";
import {
  REFERENCE_HIP_ANATOMY_POSE,
  type AnatomyRegion,
} from "../../src/anatomy/anatomyTypes";
import {
  createAnatomyRegionVisibility,
  visibleAnatomyRegions,
} from "../../src/anatomy/anatomyTransforms";
import { REFERENCE_XRAY_DISPLAY_ORIENTATION } from "../../src/components/projection/xrayDisplayOrientation";
import { useSimulationStore } from "../../src/state/simulationStore";

vi.mock("../../src/anatomy/AnatomyAssetProvider", () => ({
  useAnatomyAsset: () => ({
    error: null,
    resource: null,
    retry: vi.fn(),
    status: "ready",
    fullBodyComplement: {
      error: null,
      resource: {},
      retry: vi.fn(),
      status: "ready",
    },
    regional: {
      error: null,
      load: vi.fn(),
      resource: null,
      retry: vi.fn(),
      status: "idle",
    },
  }),
}));

beforeEach(() => {
  useSimulationStore.setState({
    cArmPose: { ...REFERENCE_C_ARM_POSE },
    cArmPhysicalSetup: { ...REFERENCE_C_ARM_PHYSICAL_SETUP },
    xrayDisplayOrientation: { ...REFERENCE_XRAY_DISPLAY_ORIENTATION },
    hipAnatomyPose: {
      ...REFERENCE_HIP_ANATOMY_POSE,
      rootPosition: [...REFERENCE_HIP_ANATOMY_POSE.rootPosition],
      rootRotationDegrees: [...REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees],
    },
    cArmMode: "isocentric",
    showBeam: true,
    interactionMode: "inspect",
    quality: "medium",
    anatomyPresentationMode: "bones-only",
    acquisitionMode: "continuous",
    shotRequestRevision: 0,
  });
});

describe("simulation store", () => {
  it("starts with serializable anatomy presentation and acquisition intent", () => {
    expect(useSimulationStore.getInitialState()).toMatchObject({
      anatomyPresentationMode: "bones-only",
      acquisitionMode: "continuous",
      shotRequestRevision: 0,
    });
  });

  it("increments shot requests monotonically", () => {
    const store = useSimulationStore.getState();

    store.requestShot();
    store.requestShot();

    expect(useSimulationStore.getState().shotRequestRevision).toBe(2);
  });

  it("resetAnatomy restores bones only without resetting acquisition intent", () => {
    const store = useSimulationStore.getState();
    store.setAnatomyPresentationMode("full-regional");
    store.setAcquisitionMode("shots-only");
    store.requestShot();
    store.resetAnatomy();

    expect(useSimulationStore.getState()).toMatchObject({
      anatomyPresentationMode: "bones-only",
      acquisitionMode: "shots-only",
      shotRequestRevision: 1,
    });
  });

  it("resetGeometry restores bones only without resetting acquisition intent", () => {
    const store = useSimulationStore.getState();
    store.setAnatomyPresentationMode("full-regional");
    store.setAcquisitionMode("shots-only");
    store.requestShot();

    store.resetGeometry();

    expect(useSimulationStore.getState()).toMatchObject({
      anatomyPresentationMode: "bones-only",
      acquisitionMode: "shots-only",
      shotRequestRevision: 1,
    });
  });

  it("keeps physical setup and X-ray display orientation independent", () => {
    const store = useSimulationStore.getState();
    store.setApproachSide("right");
    store.setTubeOrientation("source-over");
    store.rotateXrayDisplay(1);
    store.toggleXrayFlip("horizontal");

    expect(useSimulationStore.getState()).toMatchObject({
      cArmPhysicalSetup: {
        approachSide: "right",
        tubeOrientation: "source-over",
      },
      xrayDisplayOrientation: {
        rotationSteps: 1,
        flipHorizontal: true,
        flipVertical: false,
      },
    });
  });

  it("resets geometry and X-ray display independently", () => {
    const store = useSimulationStore.getState();
    store.setApproachSide("right");
    store.setTubeOrientation("source-over");
    store.rotateXrayDisplay(-1);
    store.toggleXrayFlip("vertical");
    store.resetGeometry();

    expect(useSimulationStore.getState().cArmPhysicalSetup).toEqual(
      REFERENCE_C_ARM_PHYSICAL_SETUP,
    );
    expect(useSimulationStore.getState().xrayDisplayOrientation).toEqual({
      rotationSteps: -1,
      flipHorizontal: false,
      flipVertical: true,
    });

    useSimulationStore.getState().resetXrayDisplay();
    expect(useSimulationStore.getState().xrayDisplayOrientation).toEqual(
      REFERENCE_XRAY_DISPLAY_ORIENTATION,
    );
  });

  it("starts from a serializable anatomy pose without aliasing reference arrays", () => {
    const current = useSimulationStore.getState().hipAnatomyPose;

    expect(current).toEqual(REFERENCE_HIP_ANATOMY_POSE);
    expect(current.rootPosition).not.toBe(
      REFERENCE_HIP_ANATOMY_POSE.rootPosition,
    );
    expect(current.rootRotationDegrees).not.toBe(
      REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees,
    );
    expect(JSON.parse(JSON.stringify(current))).toEqual(current);
  });

  it("keeps independent clamped angles and rotates only the effective selected leg", () => {
    const store = useSimulationStore.getState();

    store.setSelectedHipRotation(70);
    store.setSelectedAnatomySide("right");
    store.setSelectedHipRotation(-70);

    expect(useSimulationStore.getState().hipAnatomyPose).toMatchObject({
      selectedSide: "right",
      leftHipRotationDegrees: 45,
      rightHipRotationDegrees: -45,
    });
  });

  it("keeps region updates immutable and selects the only visible leg", () => {
    const store = useSimulationStore.getState();
    const originalVisibility = store.hipAnatomyPose.regionVisibility;
    store.setSelectedHipRotation(18);
    store.setAnatomyRegionVisible("left-leg", false);
    store.setSelectedHipRotation(-12);
    store.setSelectedAnatomySide("left");

    expect(useSimulationStore.getState().hipAnatomyPose).toMatchObject({
      regionVisibility: {
        ...createAnatomyRegionVisibility(true),
        "left-leg": false,
      },
      selectedSide: "right",
      leftHipRotationDegrees: 18,
      rightHipRotationDegrees: -12,
    });
    expect(
      useSimulationStore.getState().hipAnatomyPose.regionVisibility,
    ).not.toBe(originalVisibility);
    expect(originalVisibility["left-leg"]).toBe(true);

    useSimulationStore.getState().setAnatomyRegionVisible("left-leg", true);
    useSimulationStore.getState().setSelectedAnatomySide("left");
    expect(useSimulationStore.getState().hipAnatomyPose).toMatchObject({
      selectedSide: "left",
      leftHipRotationDegrees: 18,
      rightHipRotationDegrees: -12,
    });
  });

  it("shows, hides, and isolates all seven authoritative anatomy regions", () => {
    const store = useSimulationStore.getState();

    store.hideAllAnatomyRegions();
    expect(
      visibleAnatomyRegions(
        useSimulationStore.getState().hipAnatomyPose.regionVisibility,
      ),
    ).toEqual([]);

    store.showAllAnatomyRegions();
    expect(
      visibleAnatomyRegions(
        useSimulationStore.getState().hipAnatomyPose.regionVisibility,
      ),
    ).toEqual([
      "head-neck",
      "torso",
      "pelvis",
      "left-arm",
      "right-arm",
      "left-leg",
      "right-leg",
    ] satisfies AnatomyRegion[]);

    store.isolateAnatomyRegion("left-arm");
    expect(
      visibleAnatomyRegions(
        useSimulationStore.getState().hipAnatomyPose.regionVisibility,
      ),
    ).toEqual(["left-arm"]);
  });

  it("leaves C-arm, acquisition, and display state untouched by region actions", () => {
    const store = useSimulationStore.getState();
    store.setCArmParameter("orbitDegrees", 27);
    store.setAcquisitionMode("shots-only");
    store.rotateXrayDisplay(1);
    const before = useSimulationStore.getState();

    store.isolateAnatomyRegion("torso");

    expect(useSimulationStore.getState()).toMatchObject({
      cArmPose: before.cArmPose,
      acquisitionMode: "shots-only",
      xrayDisplayOrientation: before.xrayDisplayOrientation,
    });
  });

  it("resets both hip angles and pose while preserving quality and fresh arrays", () => {
    useSimulationStore.getState().setQuality("high");
    useSimulationStore.getState().isolateAnatomyRegion("right-leg");
    useSimulationStore.getState().setSelectedHipRotation(30);
    useSimulationStore.setState((state) => ({
      hipAnatomyPose: {
        ...state.hipAnatomyPose,
        upperLimbs: {
          ...state.hipAnatomyPose.upperLimbs,
          left: {
            ...state.hipAnatomyPose.upperLimbs.left,
            elbowFlexionDegrees: 35,
          },
        },
      },
    }));
    useSimulationStore.getState().resetGeometry();

    const state = useSimulationStore.getState();
    expect(state.hipAnatomyPose).toEqual(REFERENCE_HIP_ANATOMY_POSE);
    expect(state.hipAnatomyPose.rootPosition).not.toBe(
      REFERENCE_HIP_ANATOMY_POSE.rootPosition,
    );
    expect(state.hipAnatomyPose.rootRotationDegrees).not.toBe(
      REFERENCE_HIP_ANATOMY_POSE.rootRotationDegrees,
    );
    expect(state.quality).toBe("high");
  });

  it("clamps every C-arm update through the geometry bounds", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 220);
    useSimulationStore.getState().setCArmParameter("translationX", -900);
    useSimulationStore.getState().setCArmParameter("swivelDegrees", 80);

    expect(useSimulationStore.getState().cArmPose).toMatchObject({
      orbitDegrees: 180,
      translationX: -500,
      swivelDegrees: 45,
    });
  });

  it("nudges normally and snaps in the direction of travel", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 10);
    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", 1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);

    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", -1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(10);
  });

  it("snaps fractional values to the adjacent point without skipping it", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 14.9);
    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", 1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);

    useSimulationStore.getState().setCArmParameter("orbitDegrees", 10.1);
    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", -1, 5);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(10);
  });

  it("preserves ordinary and fine unsnapped nudges", () => {
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 10);
    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", 1);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(11);

    useSimulationStore.getState().nudgeCArmParameter("orbitDegrees", 0.1);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(11.1);
  });

  it("updates rig display state and resets the complete geometry", () => {
    useSimulationStore.getState().isolateAnatomyRegion("right-leg");
    useSimulationStore.getState().setSelectedHipRotation(30);
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 25);
    useSimulationStore.getState().setCArmMode("non-isocentric");
    useSimulationStore.getState().setShowBeam(false);
    useSimulationStore.getState().resetGeometry();

    expect(useSimulationStore.getState().cArmPose).toEqual(
      REFERENCE_C_ARM_POSE,
    );
    expect(useSimulationStore.getState().hipAnatomyPose).toEqual(
      REFERENCE_HIP_ANATOMY_POSE,
    );
    expect(useSimulationStore.getState()).toMatchObject({
      cArmMode: "isocentric",
      showBeam: true,
    });
  });
});

describe("CArmControls", () => {
  it("synchronizes the Orbit slider and exact numeric input", () => {
    render(<CArmControls />);
    const slider = screen.getByRole("slider", { name: "Orbit" });
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    fireEvent.change(slider, { target: { value: "12" } });

    expect(exactInput).toHaveValue(12);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(12);
  });

  it("accepts typed exact values and clamps values outside the range", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    await user.clear(exactInput);
    await user.type(exactInput, "15");
    await user.keyboard("{Enter}");
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);

    fireEvent.change(exactInput, { target: { value: "250" } });
    fireEvent.blur(exactInput);
    expect(exactInput).toHaveValue(180);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(180);
  });

  it("keeps the six rigid-body sliders primary and removes legacy XYZ anatomy controls", () => {
    render(<CArmControls />);

    [
      "Lateral translation",
      "Vertical translation",
      "Longitudinal translation",
      "Swivel",
      "Cranial/caudal tilt",
      "Orbit",
    ].forEach((name) => {
      expect(screen.getByRole("slider", { name })).toBeVisible();
    });
    [
      "Lateral translation value",
      "Vertical translation value",
      "Longitudinal translation value",
      "Swivel angle",
      "Cranial/caudal angle",
      "Orbit angle",
    ].forEach((name) => {
      expect(screen.getByRole("spinbutton", { name })).toBeVisible();
    });
    expect(screen.queryByLabelText("Height")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Obliquity")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Source-detector distance"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Detector-patient distance"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Collimation width"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Collimation height"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("spinbutton", { name: "Object rotation X" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Anatomy" })).toBeVisible();
  });

  it("presents three always-expanded semantic control columns", () => {
    render(<CArmControls />);

    expect(screen.getByRole("group", { name: "Move C-arm" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Rig setup" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Anatomy" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Anatomy" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Left approach" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Detector over source" }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "Medium quality" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Show head and neck" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("radio", { name: "Both legs" }),
    ).not.toBeInTheDocument();
  });

  it("preserves physical and display state across presets and resets them independently", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);

    await user.click(screen.getByRole("radio", { name: "Right approach" }));
    await user.click(
      screen.getByRole("radio", { name: "Source over detector" }),
    );
    useSimulationStore.getState().rotateXrayDisplay(3);
    useSimulationStore.getState().toggleXrayFlip("vertical");

    await user.click(screen.getByRole("button", { name: "AP view" }));
    expect(useSimulationStore.getState()).toMatchObject({
      cArmPhysicalSetup: {
        approachSide: "right",
        tubeOrientation: "source-over",
      },
      xrayDisplayOrientation: {
        rotationSteps: 3,
        flipHorizontal: false,
        flipVertical: true,
      },
    });

    await user.click(screen.getByRole("button", { name: "Lateral view" }));
    expect(useSimulationStore.getState()).toMatchObject({
      cArmPhysicalSetup: {
        approachSide: "right",
        tubeOrientation: "source-over",
      },
      xrayDisplayOrientation: {
        rotationSteps: 3,
        flipHorizontal: false,
        flipVertical: true,
      },
    });

    await user.click(screen.getByRole("button", { name: "Reset geometry" }));
    expect(screen.getByRole("radio", { name: "Left approach" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Detector over source" }),
    ).toBeChecked();
    expect(useSimulationStore.getState().xrayDisplayOrientation).toEqual({
      rotationSteps: 3,
      flipHorizontal: false,
      flipVertical: true,
    });
  });

  it("groups exact controls by their matching physical manipulator", () => {
    render(<CArmControls />);

    const expectedGroups = [
      {
        controls: ["Cranial/caudal angle", "Orbit angle"],
        cueName: "Orbit and tilt cue",
        legend: "Orbit and tilt",
      },
      {
        controls: [
          "Lateral translation value",
          "Vertical translation value",
          "Longitudinal translation value",
        ],
        cueName: "Translation cue",
        legend: "Position",
      },
      {
        controls: ["Swivel angle"],
        cueName: "Wig-wag cue",
        legend: "Wig-wag / swivel",
      },
    ] as const;

    expectedGroups.forEach(({ controls, cueName, legend }) => {
      expect(screen.getByText(legend, { selector: "legend" })).toBeVisible();
      const group = screen.getByRole("group", { name: cueName });
      expect(group).toBeVisible();
      expect(within(group).getAllByRole("spinbutton")).toHaveLength(
        controls.length,
      );
      controls.forEach((control) => {
        expect(
          within(group).getByRole("spinbutton", { name: control }),
        ).toBeVisible();
      });
    });
  });

  it("shows fixed construction dimensions as read-only text", () => {
    render(<CArmControls />);

    expect(screen.getByText("SID")).toBeVisible();
    expect(screen.getByText("1000 mm")).toBeVisible();
    expect(screen.getByText("Detector")).toBeVisible();
    expect(screen.getByText("220 × 220 mm")).toBeVisible();
    expect(
      screen.queryByRole("spinbutton", { name: /source.*detector/i }),
    ).not.toBeInTheDocument();
  });

  it("updates rig motion and beam visibility controls", async () => {
    const user = userEvent.setup();
    useSimulationStore.getState().setCArmParameter("orbitDegrees", 12);
    render(<CArmControls />);

    const nonIsocentric = screen.getByRole("button", {
      name: "Non-isocentric",
    });
    expect(screen.getByRole("button", { name: "Isocentric" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(nonIsocentric);
    expect(useSimulationStore.getState().cArmMode).toBe("non-isocentric");
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(12);
    expect(nonIsocentric).toHaveAttribute("aria-pressed", "true");

    const beam = screen.getByRole("checkbox", { name: "Show X-ray beam" });
    expect(beam).toBeChecked();
    await user.click(beam);
    expect(useSimulationStore.getState().showBeam).toBe(false);
  });

  it("supports one-degree keyboard nudges and directional five-degree snapping", () => {
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    fireEvent.keyDown(exactInput, { key: "ArrowRight" });
    expect(exactInput).toHaveValue(1);

    fireEvent.change(exactInput, { target: { value: "10" } });
    fireEvent.keyDown(exactInput, { key: "Enter" });
    fireEvent.keyDown(exactInput, { key: "ArrowRight", shiftKey: true });
    expect(exactInput).toHaveValue(15);

    fireEvent.keyDown(exactInput, { altKey: true, key: "ArrowRight" });
    expect(exactInput).toHaveValue(15.1);
  });

  it("uses ten-millimetre Shift snapping and Alt fine translation", () => {
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Lateral translation value",
    });

    fireEvent.change(exactInput, { target: { value: "14.9" } });
    fireEvent.keyDown(exactInput, { key: "ArrowRight", shiftKey: true });
    expect(exactInput).toHaveValue(20);

    fireEvent.keyDown(exactInput, { altKey: true, key: "ArrowRight" });
    expect(exactInput).toHaveValue(20.1);
  });

  it("snaps from the valid draft currently shown in the exact input", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    await user.clear(exactInput);
    await user.type(exactInput, "14.9");
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");

    expect(exactInput).toHaveValue(15);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBe(15);
  });

  it("applies fine movement from the valid uncommitted draft", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const exactInput = screen.getByRole("spinbutton", {
      name: "Orbit angle",
    });

    await user.clear(exactInput);
    await user.type(exactInput, "10.1");
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");

    expect(exactInput).toHaveValue(10.2);
    expect(useSimulationStore.getState().cArmPose.orbitDegrees).toBeCloseTo(
      10.2,
    );
  });

  it("applies corrected AP and lateral reference presets", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);

    await user.click(screen.getByRole("button", { name: "AP view" }));
    expect(useSimulationStore.getState().cArmPose).toEqual(AP_C_ARM_POSE);
    expect(screen.getByRole("spinbutton", { name: "Orbit angle" })).toHaveValue(
      180,
    );

    await user.click(screen.getByRole("button", { name: "Lateral view" }));
    expect(useSimulationStore.getState().cArmPose).toEqual(LATERAL_C_ARM_POSE);
    expect(screen.getByRole("spinbutton", { name: "Orbit angle" })).toHaveValue(
      90,
    );
  });

  it("preserves the positioned anatomy when applying C-arm view presets", async () => {
    const user = userEvent.setup();
    const positionedAnatomy = {
      ...REFERENCE_HIP_ANATOMY_POSE,
      leftHipRotationDegrees: 22,
      rootPosition: [25, -10, 40] as const,
      rootRotationDegrees: [10, 20, 30] as const,
    };
    useSimulationStore.setState({ hipAnatomyPose: positionedAnatomy });
    render(<CArmControls />);

    await user.click(screen.getByRole("button", { name: "AP view" }));
    expect(useSimulationStore.getState().hipAnatomyPose).toEqual(
      positionedAnatomy,
    );

    await user.click(screen.getByRole("button", { name: "Lateral view" }));
    expect(useSimulationStore.getState().hipAnatomyPose).toEqual(
      positionedAnatomy,
    );
  });

  it("resets the six-DoF pose, rig mode, and beam visibility", async () => {
    const user = userEvent.setup();
    render(<CArmControls />);
    const orbitInput = screen.getByRole("spinbutton", { name: "Orbit angle" });
    fireEvent.change(orbitInput, {
      target: { value: "45" },
    });
    fireEvent.blur(orbitInput);
    await user.click(screen.getByRole("button", { name: "Non-isocentric" }));
    await user.click(screen.getByRole("checkbox", { name: "Show X-ray beam" }));

    await user.click(screen.getByRole("button", { name: "Reset geometry" }));

    expect(screen.getByRole("spinbutton", { name: "Orbit angle" })).toHaveValue(
      0,
    );
    expect(useSimulationStore.getState()).toMatchObject({
      cArmPose: REFERENCE_C_ARM_POSE,
      cArmMode: "isocentric",
      showBeam: true,
    });
    expect(screen.getByRole("button", { name: "Isocentric" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("checkbox", { name: "Show X-ray beam" }),
    ).toBeChecked();
  });

  it("globally resets the hip anatomy along with C-arm geometry", async () => {
    const user = userEvent.setup();
    useSimulationStore.getState().isolateAnatomyRegion("left-leg");
    useSimulationStore.getState().setSelectedHipRotation(20);
    render(<CArmControls />);

    await user.click(screen.getByRole("button", { name: "Reset geometry" }));
    expect(useSimulationStore.getState().hipAnatomyPose).toEqual(
      REFERENCE_HIP_ANATOMY_POSE,
    );
  });

  it("keeps acquisition actions out of Rig setup", () => {
    render(<CArmControls />);

    const rigSetup = screen.getByRole("group", { name: "Rig setup" });
    expect(
      within(rigSetup).queryByRole("button", { name: "Take simulated image" }),
    ).not.toBeInTheDocument();
    expect(
      within(rigSetup).queryByRole("status", { name: "Image capture status" }),
    ).not.toBeInTheDocument();
    expect(
      within(rigSetup).getByRole("button", { name: "Reset geometry" }),
    ).toBeVisible();
  });

  it("provides labelled range and exact inputs with visible units", () => {
    render(<CArmControls />);

    expect(screen.getByRole("slider", { name: "Orbit" })).toHaveAttribute(
      "min",
      "-180",
    );
    expect(
      screen.getByRole("spinbutton", { name: "Orbit angle" }),
    ).toHaveAccessibleName("Orbit angle");
    expect(screen.getAllByText("°").length).toBeGreaterThan(0);
    expect(screen.getAllByText("mm").length).toBeGreaterThan(0);
  });
});

describe("InteractionMode", () => {
  it("exposes only inspection and C-arm manipulation modes", async () => {
    const user = userEvent.setup();
    render(<InteractionMode />);

    expect(screen.getByRole("button", { name: "Inspect" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const moveCArm = screen.getByRole("button", { name: "Move C-arm" });
    await user.click(moveCArm);

    expect(useSimulationStore.getState().interactionMode).toBe("move-carm");
    expect(moveCArm).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: "Move anatomy" }),
    ).not.toBeInTheDocument();
  });
});
