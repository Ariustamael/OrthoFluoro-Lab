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

  return (
    <p aria-label={label} className="visually-hidden" role="status">
      Anatomy {pose.visibility} · {sideName} leg rotation{" "}
      {formatSignedDegrees(rotation)}
    </p>
  );
}
