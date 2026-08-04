import { expect, test } from "@playwright/test";

test("@desktop real WebGL projection renderers produce geometry-dependent detector pixels", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/lab/projection-renderer-smoke");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Projection renderer WebGL smoke test",
    }),
  ).toBeVisible();
  const status = page.getByRole("status", {
    name: "Projection renderer smoke status",
  });
  await expect(status).toHaveAttribute("data-complete", "true");

  const metrics = await status.evaluate((element) => ({
    layeredCapabilityReason: element.getAttribute("data-layered-reason"),
    layeredPrecision: element.getAttribute("data-layered-precision"),
    layeredSinglePeak: Number(element.getAttribute("data-layered-single-peak")),
    layeredOverlapPeak: Number(
      element.getAttribute("data-layered-overlap-peak"),
    ),
    poseDelta: Number(element.getAttribute("data-pose-delta")),
    silhouetteNonBlackPixels: Number(
      element.getAttribute("data-silhouette-nonblack"),
    ),
    silhouetteStrategy: element.getAttribute("data-silhouette-strategy"),
    visibilityDelta: Number(element.getAttribute("data-visibility-delta")),
  }));

  expect(metrics.silhouetteStrategy).toBe("mesh-silhouette");
  expect(metrics.silhouetteNonBlackPixels).toBeGreaterThan(0);
  expect(metrics.poseDelta).toBeGreaterThan(0);
  expect(metrics.visibilityDelta).toBeGreaterThan(0);
  if (metrics.layeredCapabilityReason === null) {
    expect(["float32", "float16"]).toContain(metrics.layeredPrecision);
    expect(metrics.layeredSinglePeak).toBeGreaterThan(0);
    expect(metrics.layeredOverlapPeak).toBeGreaterThan(
      metrics.layeredSinglePeak,
    );
  } else {
    expect(metrics.layeredCapabilityReason).toMatch(
      /context-unavailable|webgl2-required|float-color-buffer-unavailable/,
    );
  }
  expect(errors).toEqual([]);
});
