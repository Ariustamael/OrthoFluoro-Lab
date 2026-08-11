"use client";

import { useEffect } from "react";
import { useAnatomyAsset } from "../../anatomy/AnatomyAssetProvider";
import { formatSignedDegrees } from "../../anatomy/anatomyPresentation";
import type {
  AnatomyPresentationMode,
  AnatomyRegion,
  AnatomySide,
} from "../../anatomy/anatomyTypes";
import { useSimulationStore } from "../../state/simulationStore";

const REGION_OPTIONS: readonly {
  region: AnatomyRegion;
  label: string;
  requiresComplement: boolean;
}[] = [
  { label: "Head and neck", region: "head-neck", requiresComplement: true },
  { label: "Torso", region: "torso", requiresComplement: true },
  { label: "Pelvis", region: "pelvis", requiresComplement: false },
  { label: "Left arm", region: "left-arm", requiresComplement: true },
  { label: "Right arm", region: "right-arm", requiresComplement: true },
  { label: "Left leg", region: "left-leg", requiresComplement: false },
  { label: "Right leg", region: "right-leg", requiresComplement: false },
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
  const { retry: retryFullBodyAnatomy, status: fullBodyStatus } =
    anatomy.fullBodyComplement;
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
  const showAllRegions = useSimulationStore(
    (state) => state.showAllAnatomyRegions,
  );
  const hideAllRegions = useSimulationStore(
    (state) => state.hideAllAnatomyRegions,
  );
  const isolateRegion = useSimulationStore(
    (state) => state.isolateAnatomyRegion,
  );
  const setSelectedSide = useSimulationStore(
    (state) => state.setSelectedAnatomySide,
  );
  const setSelectedRotation = useSimulationStore(
    (state) => state.setSelectedHipRotation,
  );
  const resetAnatomy = useSimulationStore((state) => state.resetAnatomy);
  const requestFitAnatomy = useSimulationStore(
    (state) => state.requestFitAnatomy,
  );
  const selectedRotation =
    pose.selectedSide === "left"
      ? pose.leftHipRotationDegrees
      : pose.rightHipRotationDegrees;
  const sideName = pose.selectedSide === "left" ? "Left" : "Right";
  const bothLegsVisible =
    pose.regionVisibility["left-leg"] && pose.regionVisibility["right-leg"];
  const eitherLegVisible =
    pose.regionVisibility["left-leg"] || pose.regionVisibility["right-leg"];
  const baseAnatomyReady =
    anatomy.status === "ready" && anatomy.resource !== null;
  const hasEffectivelyVisibleRegion =
    baseAnatomyReady &&
    REGION_OPTIONS.some(
      (option) =>
        pose.regionVisibility[option.region] &&
        (!option.requiresComplement || fullBodyStatus === "ready"),
    );

  useEffect(() => {
    if (regionalStatus === "idle" && presentationMode === "full-regional") {
      loadRegionalAnatomy();
      return;
    }
    if (regionalStatus === "error" && presentationMode === "full-regional") {
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

  return (
    <fieldset aria-label="Anatomy" className="anatomy-controls control-column">
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
          Regional detail is concentrated in the lower torso, pelvis and lower
          limbs. X-rays remain bones only.
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
        {fullBodyStatus === "loading" ? (
          <p
            aria-label="Full-body anatomy status"
            className="anatomy-controls__complement-status"
            role="status"
          >
            Loading full-body anatomy
          </p>
        ) : null}
        {fullBodyStatus === "error" ? (
          <div
            aria-label="Full-body anatomy status"
            className="anatomy-controls__complement-status anatomy-controls__complement-status--error"
            role="alert"
          >
            <span>Full-body anatomy unavailable</span>
            <button onClick={retryFullBodyAnatomy} type="button">
              Retry full-body anatomy
            </button>
          </div>
        ) : null}
        <div className="anatomy-controls__region-actions">
          <button onClick={showAllRegions} type="button">
            Show all
          </button>
          <button onClick={hideAllRegions} type="button">
            Hide all
          </button>
          <button
            disabled={!hasEffectivelyVisibleRegion}
            onClick={requestFitAnatomy}
            type="button"
          >
            Fit anatomy
          </button>
        </div>
        <div className="anatomy-controls__region-grid">
          {REGION_OPTIONS.map((option) => {
            const unavailable =
              option.requiresComplement && fullBodyStatus !== "ready";
            const accessibleLabel = option.label.toLowerCase();
            return (
              <div
                className="anatomy-controls__region-tile"
                key={option.region}
              >
                <button
                  aria-label={`Show ${accessibleLabel}`}
                  aria-pressed={pose.regionVisibility[option.region]}
                  className="anatomy-controls__region-toggle"
                  disabled={unavailable}
                  onClick={() =>
                    setRegionVisible(
                      option.region,
                      !pose.regionVisibility[option.region],
                    )
                  }
                  type="button"
                >
                  {option.label}
                </button>
                <button
                  aria-label={`Show only ${accessibleLabel}`}
                  className="anatomy-controls__region-only"
                  disabled={unavailable}
                  onClick={() => isolateRegion(option.region)}
                  type="button"
                >
                  Only
                </button>
              </div>
            );
          })}
        </div>
      </fieldset>

      {bothLegsVisible ? (
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
          disabled={!eitherLegVisible}
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
        {!eitherLegVisible ? (
          <p className="anatomy-controls__rotation-unavailable">
            Show a leg to adjust hip rotation.
          </p>
        ) : null}
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
