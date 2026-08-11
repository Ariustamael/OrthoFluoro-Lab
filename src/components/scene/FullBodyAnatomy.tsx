"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import type { LoadedHipAnatomy } from "../../anatomy/anatomyAssetLoader";
import {
  createFullBodyAnatomyViewportScene,
  updateFullBodyAnatomyViewportScene,
  type FullBodyAnatomyViewportScene,
} from "../../anatomy/fullBodyAnatomyScene";
import type { LoadedFullBodyComplement } from "../../anatomy/fullBodyAnatomyTypes";
import { useSimulationStore } from "../../state/simulationStore";

export function useFullBodyAnatomyScene(
  hip: LoadedHipAnatomy,
  complement: LoadedFullBodyComplement | null,
): FullBodyAnatomyViewportScene {
  const pose = useSimulationStore((state) => state.hipAnatomyPose);
  const view = useMemo(
    () =>
      createFullBodyAnatomyViewportScene(
        { complement, hip },
        { cloneMaterials: true },
      ),
    [complement, hip],
  );

  useLayoutEffect(() => {
    updateFullBodyAnatomyViewportScene(view, pose);
  }, [pose, view]);
  useEffect(
    () => () => {
      view.dispose();
    },
    [view],
  );

  return view;
}

export function FullBodyAnatomy({
  complement,
  hip,
}: {
  readonly complement: LoadedFullBodyComplement | null;
  readonly hip: LoadedHipAnatomy;
}) {
  const view = useFullBodyAnatomyScene(hip, complement);
  return <primitive dispose={null} object={view.root} />;
}
