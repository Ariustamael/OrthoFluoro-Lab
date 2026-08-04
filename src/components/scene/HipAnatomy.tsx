"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import type { LoadedHipAnatomy } from "../../anatomy/anatomyAssetLoader";
import {
  createHipAnatomyViewportScene,
  updateHipAnatomyViewportScene,
} from "../../anatomy/hipAnatomyScene";
import { useSimulationStore } from "../../state/simulationStore";

export {
  createHipAnatomyViewportScene,
  updateHipAnatomyViewportScene,
} from "../../anatomy/hipAnatomyScene";

export function HipAnatomy({ resource }: { resource: LoadedHipAnatomy }) {
  const pose = useSimulationStore((state) => state.hipAnatomyPose);
  const view = useMemo(
    () => createHipAnatomyViewportScene(resource),
    [resource],
  );

  useLayoutEffect(() => {
    updateHipAnatomyViewportScene(view, pose);
  }, [pose, view]);
  useEffect(
    () => () => {
      view.dispose();
    },
    [view],
  );

  return <primitive dispose={null} object={view.root} />;
}
