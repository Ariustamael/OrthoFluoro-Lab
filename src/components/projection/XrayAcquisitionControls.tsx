"use client";

import { useSimulationStore } from "../../state/simulationStore";

export interface XrayAcquisitionControlsProps {
  readonly shotPending: boolean;
}

export function XrayAcquisitionControls({
  shotPending,
}: XrayAcquisitionControlsProps) {
  const acquisitionMode = useSimulationStore((state) => state.acquisitionMode);
  const setAcquisitionMode = useSimulationStore(
    (state) => state.setAcquisitionMode,
  );
  const requestShot = useSimulationStore((state) => state.requestShot);
  const shotDisabled = acquisitionMode === "continuous" || shotPending;

  return (
    <div className="xray-acquisition-controls">
      <fieldset className="xray-acquisition-controls__modes">
        <legend className="visually-hidden">X-ray acquisition mode</legend>
        <label>
          <input
            checked={acquisitionMode === "continuous"}
            name="xray-acquisition-mode"
            onChange={() => setAcquisitionMode("continuous")}
            type="radio"
          />
          <span>Continuous imaging</span>
        </label>
        <label>
          <input
            checked={acquisitionMode === "shots-only"}
            name="xray-acquisition-mode"
            onChange={() => setAcquisitionMode("shots-only")}
            type="radio"
          />
          <span>Shots only</span>
        </label>
      </fieldset>
      <button disabled={shotDisabled} onClick={requestShot} type="button">
        Take shot
      </button>
    </div>
  );
}
