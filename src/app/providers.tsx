"use client";

import { useEffect, type ReactNode } from "react";
import { getDatabase } from "../persistence/database";
import {
  useSimulationStore,
  type QualityPreset,
} from "../state/simulationStore";

const QUALITY_KEY = "graphics-quality";
const QUALITY_VALUES: readonly QualityPreset[] = ["low", "medium", "high"];

function isQualityPreset(value: string): value is QualityPreset {
  return QUALITY_VALUES.includes(value as QualityPreset);
}

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!("indexedDB" in globalThis)) return;
    const database = getDatabase();
    let active = true;
    void database.settings
      .get(QUALITY_KEY)
      .then((stored) => {
        if (active && stored && isQualityPreset(stored.value))
          useSimulationStore.getState().setQuality(stored.value);
      })
      .catch(() => undefined);
    const unsubscribe = useSimulationStore.subscribe((state, previous) => {
      if (state.quality !== previous.quality) {
        void database.settings
          .put({ key: QUALITY_KEY, value: state.quality })
          .catch(() => undefined);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return children;
}
