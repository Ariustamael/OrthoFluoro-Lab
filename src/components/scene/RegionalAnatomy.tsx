"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import type { LoadedRegionalAnatomy } from "../../anatomy/regionalAnatomyTypes";
import {
  createRegionalAnatomyScene,
  updateRegionalAnatomyScene,
  type RegionalAnatomyViewportScene,
} from "../../anatomy/regionalAnatomyScene";
import { useSimulationStore } from "../../state/simulationStore";

export function useRegionalAnatomyScene(
  resource: LoadedRegionalAnatomy,
): RegionalAnatomyViewportScene {
  const pose = useSimulationStore((state) => state.hipAnatomyPose);
  const view = useMemo(() => createRegionalAnatomyScene(resource), [resource]);

  useLayoutEffect(() => {
    updateRegionalAnatomyScene(view, pose);
  }, [pose, view]);
  useEffect(
    () => () => {
      view.dispose();
    },
    [view],
  );

  return view;
}

export function RegionalAnatomy({
  resource,
}: {
  resource: LoadedRegionalAnatomy;
}) {
  const view = useRegionalAnatomyScene(resource);
  return <primitive dispose={null} object={view.root} />;
}
