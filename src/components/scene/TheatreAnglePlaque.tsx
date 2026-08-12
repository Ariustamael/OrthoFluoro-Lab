"use client";

import { formatSignedDegrees } from "../../anatomy/anatomyPresentation";
import { useSimulationStore } from "../../state/simulationStore";

export function TheatreAnglePlaque() {
  const orbitDegrees = useSimulationStore(
    (state) => state.cArmPose.orbitDegrees,
  );
  const tiltDegrees = useSimulationStore(
    (state) => state.cArmPose.cranialCaudalDegrees,
  );
  const swivelDegrees = useSimulationStore(
    (state) => state.cArmPose.swivelDegrees,
  );

  return (
    <dl aria-label="C-arm angles" className="theatre-angle-plaque">
      <div>
        <dt>Orbit</dt>{" "}
        <dd>{formatSignedDegrees(Math.round(orbitDegrees))}</dd>
      </div>
      <div>
        <dt>Tilt</dt>{" "}
        <dd>{formatSignedDegrees(Math.round(tiltDegrees))}</dd>
      </div>
      <div>
        <dt>Swivel</dt>{" "}
        <dd>{formatSignedDegrees(Math.round(swivelDegrees))}</dd>
      </div>
    </dl>
  );
}
