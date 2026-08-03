import { describe, expect, it } from "vitest";
import { cArmCueHint } from "../../src/components/scene/cArmCueHints";

describe("C-arm cue hints", () => {
  it("uses concise semantic labels for rotational cues", () => {
    expect(cArmCueHint("orbit")).toEqual({
      label: "Orbit",
      instruction: "Drag along the arc",
    });
    expect(cArmCueHint("swivel")).toEqual({
      label: "Wig-wag",
      instruction: "Drag around the curved cue",
    });
  });
});
