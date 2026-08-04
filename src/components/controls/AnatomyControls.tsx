"use client";

import { useState } from "react";
import { formatSignedDegrees } from "../../anatomy/anatomyPresentation";
import type {
  AnatomySide,
  AnatomyVisibility,
} from "../../anatomy/anatomyTypes";
import { useSimulationStore } from "../../state/simulationStore";

const VISIBILITY_OPTIONS: readonly {
  label: string;
  shortLabel: string;
  value: AnatomyVisibility;
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

export function AnatomyControls() {
  const [expanded, setExpanded] = useState(false);
  const pose = useSimulationStore((state) => state.hipAnatomyPose);
  const setVisibility = useSimulationStore(
    (state) => state.setAnatomyVisibility,
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

  return (
    <section className="anatomy-controls">
      <button
        aria-expanded={expanded}
        className="anatomy-controls__summary"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        Anatomy
      </button>
      {expanded ? (
        <fieldset aria-label="Anatomy" className="anatomy-controls__group">
          <legend className="visually-hidden">Anatomy</legend>
          <p className="anatomy-controls__instruction">
            Rotate the selected complete leg at the hip.
          </p>

          <fieldset className="anatomy-controls__option-group">
            <legend>Visible anatomy</legend>
            <div className="anatomy-controls__segments">
              {VISIBILITY_OPTIONS.map((option) => (
                <label key={option.value}>
                  <input
                    checked={pose.visibility === option.value}
                    name="anatomy-visibility"
                    onChange={() => setVisibility(option.value)}
                    type="radio"
                  />
                  <span aria-hidden="true">{option.shortLabel}</span>
                  <span className="visually-hidden">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {pose.visibility === "bilateral" ? (
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
            <div
              aria-hidden="true"
              className="anatomy-controls__rotation-scale"
            >
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
        </fieldset>
      ) : null}
    </section>
  );
}
