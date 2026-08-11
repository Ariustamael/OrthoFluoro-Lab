"use client";

import { formatSignedDegrees } from "../../anatomy/anatomyPresentation";
import { useSimulationStore } from "../../state/simulationStore";

export function AnatomyPoseStatus({ label }: { readonly label: string }) {
  const pose = useSimulationStore((state) => state.hipAnatomyPose);
  const rotation =
    pose.selectedSide === "left"
      ? pose.leftHipRotationDegrees
      : pose.rightHipRotationDegrees;
  const sideName = pose.selectedSide === "left" ? "Left" : "Right";
  const legVisibility =
    pose.regionVisibility["left-leg"] && pose.regionVisibility["right-leg"]
      ? "bilateral"
      : pose.regionVisibility["left-leg"]
        ? "left-only"
        : pose.regionVisibility["right-leg"]
          ? "right-only"
          : "hidden";

  return (
    <p aria-label={label} className="visually-hidden" role="status">
      Anatomy {legVisibility} · {sideName} leg rotation{" "}
      {formatSignedDegrees(rotation)}
    </p>
  );
}
