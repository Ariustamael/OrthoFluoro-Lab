"use client";

import { useEffect } from "react";
import { useAnatomyAsset } from "../../anatomy/AnatomyAssetProvider";
import { formatSignedDegrees } from "../../anatomy/anatomyPresentation";
import type {
  AnatomyPresentationMode,
  AnatomySide,
} from "../../anatomy/anatomyTypes";
import { useSimulationStore } from "../../state/simulationStore";

type LegVisibilityOption = "bilateral" | "left-only" | "right-only";
type LegVisibility = LegVisibilityOption | "hidden";

const VISIBILITY_OPTIONS: readonly {
  label: string;
  shortLabel: string;
  value: LegVisibilityOption;
}[] = [
  { label: "Both legs", shortLabel: "Both", value: "bilateral" },
  { label: "Left leg only", shortLabel: "Left", value: "left-only" },
  { label: "Right leg only", shortLabel: "Right", value: "right-only" },
];

const SIDE_OPTIONS: readonly {
  label: string;
  shortLabel: string;
  value: AnatomySide;
}[] = [
  { label: "Select left leg", shortLabel: "Left", value: "left" },
  { label: "Select right leg", shortLabel: "Right", value: "right" },
];

const PRESENTATION_OPTIONS: readonly {
  label: string;
  shortLabel: string;
  value: AnatomyPresentationMode;
}[] = [
  {
    label: "Show bones only in 3D",
    shortLabel: "Bones only",
    value: "bones-only",
  },
  {
    label: "Show full regional anatomy in 3D",
    shortLabel: "Full regional",
    value: "full-regional",
  },
];

export function AnatomyControls() {
  const anatomy = useAnatomyAsset();
  const {
    load: loadRegionalAnatomy,
    retry: retryRegionalAnatomyAsset,
    status: regionalStatus,
  } = anatomy.regional;
  const pose = useSimulationStore((state) => state.hipAnatomyPose);
  const presentationMode = useSimulationStore(
    (state) => state.anatomyPresentationMode,
  );
  const setPresentationMode = useSimulationStore(
    (state) => state.setAnatomyPresentationMode,
  );
  const setRegionVisible = useSimulationStore(
    (state) => state.setAnatomyRegionVisible,
  );
  const setSelectedSide = useSimulationStore(
    (state) => state.setSelectedAnatomySide,
  );
  const setSelectedRotation = useSimulationStore(
    (state) => state.setSelectedHipRotation,
  );
  const resetAnatomy = useSimulationStore((state) => state.resetAnatomy);
  const selectedRotation =
    pose.selectedSide === "left"
      ? pose.leftHipRotationDegrees
      : pose.rightHipRotationDegrees;
  const sideName = pose.selectedSide === "left" ? "Left" : "Right";
  const legVisibility: LegVisibility =
    pose.regionVisibility["left-leg"] && pose.regionVisibility["right-leg"]
      ? "bilateral"
      : pose.regionVisibility["left-leg"]
        ? "left-only"
        : pose.regionVisibility["right-leg"]
          ? "right-only"
          : "hidden";

  useEffect(() => {
    if (
      regionalStatus === "idle" &&
      presentationMode === "full-regional"
    ) {
      loadRegionalAnatomy();
      return;
    }
    if (
      regionalStatus === "error" &&
      presentationMode === "full-regional"
    ) {
      setPresentationMode("bones-only");
    }
  }, [
    loadRegionalAnatomy,
    presentationMode,
    regionalStatus,
    setPresentationMode,
  ]);

  const selectPresentation = (mode: AnatomyPresentationMode) => {
    setPresentationMode(mode);
    if (mode === "full-regional") {
      loadRegionalAnatomy();
    }
  };

  const retryRegionalAnatomy = () => {
    setPresentationMode("full-regional");
    retryRegionalAnatomyAsset();
  };

  const setLegVisibility = (visibility: LegVisibilityOption) => {
    setRegionVisible("left-leg", visibility !== "right-only");
    setRegionVisible("right-leg", visibility !== "left-only");
  };

  return (
    <fieldset
      aria-label="Anatomy"
      className="anatomy-controls control-column"
    >
      <legend className="control-column__title">Anatomy</legend>
      <p className="anatomy-controls__instruction">
        Rotate the selected complete leg at the hip.
      </p>

      <fieldset className="anatomy-controls__option-group anatomy-controls__option-group--presentation">
        <legend>3D presentation</legend>
        <div className="anatomy-controls__segments">
          {PRESENTATION_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                checked={presentationMode === option.value}
                name="anatomy-presentation"
                onChange={() => selectPresentation(option.value)}
                type="radio"
              />
              <span aria-hidden="true">{option.shortLabel}</span>
              <span className="visually-hidden">{option.label}</span>
            </label>
          ))}
        </div>
        <p className="anatomy-controls__presentation-helper">
          X-rays remain bones only
        </p>
        {regionalStatus === "loading" ? (
          <p
            aria-label="Regional anatomy status"
            className="anatomy-controls__regional-status"
            role="status"
          >
            Loading full regional anatomy
          </p>
        ) : null}
        {regionalStatus === "error" ? (
          <div
            aria-label="Regional anatomy status"
            className="anatomy-controls__regional-status anatomy-controls__regional-status--error"
            role="alert"
          >
            <span>Full regional anatomy unavailable</span>
            <button onClick={retryRegionalAnatomy} type="button">
              Retry full regional anatomy
            </button>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="anatomy-controls__option-group">
        <legend>Visible anatomy</legend>
        <div className="anatomy-controls__segments">
          {VISIBILITY_OPTIONS.map((option) => (
            <label key={option.value}>
              <input
                checked={legVisibility === option.value}
                name="anatomy-visibility"
                onChange={() => setLegVisibility(option.value)}
                type="radio"
              />
              <span aria-hidden="true">{option.shortLabel}</span>
              <span className="visually-hidden">{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {legVisibility === "bilateral" ? (
        <fieldset className="anatomy-controls__option-group anatomy-controls__option-group--side">
          <legend>Leg to rotate</legend>
          <div className="anatomy-controls__segments">
            {SIDE_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  checked={pose.selectedSide === option.value}
                  name="selected-anatomy-side"
                  onChange={() => setSelectedSide(option.value)}
                  type="radio"
                />
                <span aria-hidden="true">{option.shortLabel}</span>
                <span className="visually-hidden">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="anatomy-controls__rotation">
        <label htmlFor="hip-rotation">
          {sideName} leg internal or external rotation
        </label>
        <output aria-live="polite" htmlFor="hip-rotation">
          {formatSignedDegrees(selectedRotation)}
        </output>
        <input
          id="hip-rotation"
          max={45}
          min={-45}
          onChange={(event) =>
            setSelectedRotation(event.currentTarget.valueAsNumber)
          }
          step={1}
          type="range"
          value={selectedRotation}
        />
        <div aria-hidden="true" className="anatomy-controls__rotation-scale">
          <span>External</span>
          <span>Neutral</span>
          <span>Internal</span>
        </div>
      </div>

      <button
        className="anatomy-controls__reset"
        onClick={resetAnatomy}
        type="button"
      >
        Reset anatomy
      </button>

      <p className="anatomy-controls__attribution">
        <a href="https://anatomytool.org/open3dmodel">
          AnatomyTOOL Open3DModel
        </a>
        : Skeleton by the Open3D project, George J.R. Maat (LUMC), Eungyeol Lee
        (LUMC) et al.; lower-limb bones and full regional derivative from the
        Open3D project model by Jan Kooloos (RadboudUMC), Eungyeol Lee (LUMC) et
        al. Shared under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/">
          CC BY-SA 4.0
        </a>
        .
      </p>
    </fieldset>
  );
}
