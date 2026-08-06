"use client";

import { AnatomyControls } from "./AnatomyControls";
import { CArmMotionControls } from "./CArmMotionControls";
import { CArmSetupControls } from "./CArmSetupControls";

export function CArmControls() {
  return (
    <section
      aria-labelledby="c-arm-controls-heading"
      className="c-arm-controls"
    >
      <h2 className="visually-hidden" id="c-arm-controls-heading">
        C-arm controls
      </h2>
      <div className="c-arm-controls__columns">
        <CArmMotionControls />
        <CArmSetupControls />
        <AnatomyControls />
      </div>
    </section>
  );
}
