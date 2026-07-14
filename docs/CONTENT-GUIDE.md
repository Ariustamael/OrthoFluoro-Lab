# Content guide

Future teaching content should be represented as data consumed by the existing
route and renderer boundaries, not embedded in geometry functions.

Each guided view should define a stable ID, plain-language goal, reference
C-arm pose, acceptable geometric tolerance, ordered cues, common errors,
reflection prompt, and links to its evidence/source notes. Each case should use
synthetic or appropriately licensed assets and identify whether a displayed
view is a target, an example, or an approximation.

Use wording such as “simplified projection,” “reference pose,” and “geometric
cue.” Never claim clinical accuracy or imply that matching the synthetic image
validates real positioning. Keep exact angles visible alongside orientation
language and preserve the medical-limitation notice in every learning flow.

Recommended integration sequence:

1. add typed content records under a future `src/content` boundary;
2. render them through `/guided/:viewId` or `/library/:caseId`;
3. test stable IDs, reference poses, tolerances, and missing-content fallbacks;
4. register any external asset and licence before committing it.
