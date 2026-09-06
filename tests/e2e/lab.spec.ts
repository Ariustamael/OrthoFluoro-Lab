import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";

const consoleErrors = new WeakMap<Page, string[]>();
test.describe.configure({ mode: "serial", timeout: 120_000 });
const RETIRED_PATHS = [
  "/lab",
  "/guided",
  "/guided/wrist-true-lateral",
  "/library",
  "/library/wrist-neutral",
  "/communication",
  "/saved",
  "/about",
  "/settings",
] as const;

function sourceSignature(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function projectionImageSignature(page: Page): Promise<string> {
  const detector = page.getByTestId("projection-detector-display");
  const image = page
    .getByRole("region", { name: "Simulated X-ray view" })
    .locator("img.projection-view__surface");
  await expect(detector).toHaveAttribute("aria-busy", "false", {
    timeout: 30_000,
  });
  await expect(image).toBeVisible();
  const source = await image.getAttribute("src");
  expect(source).toMatch(/^data:image\/(png|svg\+xml)/);
  expect(source!.length).toBeGreaterThan(100);
  return sourceSignature(source!);
}

async function theatreSignature(page: Page): Promise<string> {
  const theatre = page.getByRole("region", { name: "3D theatre" });
  await expect(theatre).toBeVisible();
  return sourceSignature((await theatre.screenshot()).toString("base64"));
}

async function waitForTheatreChange(
  page: Page,
  previousSignature: string,
): Promise<string> {
  await expect
    .poll(() => theatreSignature(page), { timeout: 30_000 })
    .not.toBe(previousSignature);
  return theatreSignature(page);
}

async function waitForProjectionChange(
  page: Page,
  previousSignature: string,
): Promise<string> {
  const detector = page.getByTestId("projection-detector-display");
  const image = page
    .getByRole("region", { name: "Simulated X-ray view" })
    .locator("img.projection-view__surface");
  await expect
    .poll(async () => {
      if ((await detector.getAttribute("aria-busy")) !== "false") {
        return previousSignature;
      }
      const source = await image.getAttribute("src");
      return source === null ? null : sourceSignature(source);
    }, { timeout: 30_000 })
    .not.toBe(previousSignature);
  return projectionImageSignature(page);
}

async function waitForProjectionSettlementAfter(
  page: Page,
  action: () => Promise<void>,
): Promise<string> {
  const detector = page.getByTestId("projection-detector-display");
  const settled = detector.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        let sawPending = element.getAttribute("aria-busy") === "true";
        const timeout = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error("Projection did not complete a pending cycle"));
        }, 30_000);
        const observer = new MutationObserver(() => {
          const busy = element.getAttribute("aria-busy") === "true";
          sawPending ||= busy;
          if (!sawPending || busy) return;
          window.clearTimeout(timeout);
          observer.disconnect();
          resolve();
        });
        observer.observe(element, {
          attributeFilter: ["aria-busy"],
          attributes: true,
        });
      }),
  );
  await action();
  await settled;
  return projectionImageSignature(page);
}

async function waitForUiScheduling(page: Page, frameCount = 4): Promise<void> {
  await page.evaluate(
    (frames) =>
      new Promise<void>((resolve) => {
        const nextFrame = (remaining: number) => {
          if (remaining === 0) {
            resolve();
            return;
          }
          requestAnimationFrame(() => nextFrame(remaining - 1));
        };
        nextFrame(frames);
      }),
    frameCount,
  );
}

async function expectInside(inner: Locator, outer: Locator): Promise<void> {
  const [innerBox, outerBox] = await Promise.all([
    inner.boundingBox(),
    outer.boundingBox(),
  ]);
  expect(innerBox).not.toBeNull();
  expect(outerBox).not.toBeNull();

  const tolerance = 1;
  expect(innerBox!.x).toBeGreaterThanOrEqual(outerBox!.x - tolerance);
  expect(innerBox!.y).toBeGreaterThanOrEqual(outerBox!.y - tolerance);
  expect(innerBox!.x + innerBox!.width).toBeLessThanOrEqual(
    outerBox!.x + outerBox!.width + tolerance,
  );
  expect(innerBox!.y + innerBox!.height).toBeLessThanOrEqual(
    outerBox!.y + outerBox!.height + tolerance,
  );
}

async function pointRangePositive(slider: Locator): Promise<number> {
  const box = await slider.boundingBox();
  expect(box).not.toBeNull();
  await slider.click({
    position: { x: box!.width * 0.75, y: box!.height / 2 },
  });
  await expect.poll(() => slider.inputValue()).not.toBe("0");
  return Number(await slider.inputValue());
}

const ISOLATED_REGIONS = [
  ["head and neck", "Head and neck only"],
  ["torso", "Torso only"],
  ["pelvis", "Pelvis only"],
  ["left arm", "Left arm only"],
  ["right arm", "Right arm only"],
  ["left leg", "Left leg only"],
  ["right leg", "Right leg only"],
] as const;

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  consoleErrors.set(page, errors);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Projection geometry lab" }),
  ).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

test("@desktop separates physical setup from X-ray display orientation", async ({
  page,
}) => {
  const neutral = await projectionImageSignature(page);
  const orbit = page.getByRole("spinbutton", { name: "Orbit angle" });
  await orbit.fill("30");
  await orbit.press("Enter");

  const initial = await waitForProjectionChange(page, neutral);
  await page.getByRole("button", { name: "Show only left leg" }).click();
  const leftLegBaseline = await waitForProjectionChange(page, initial);

  await page.getByRole("radio", { name: "Right approach" }).check();
  const rightApproach = await waitForProjectionChange(page, leftLegBaseline);

  await page.getByRole("radio", { name: "Source over detector" }).check();
  const switchedTube = await waitForProjectionChange(page, rightApproach);

  const rotateRight = page.getByRole("button", {
    name: "Rotate X-ray right 10 degrees",
  });
  const rotationStatus = page.getByLabel("X-ray rotation");
  const flipHorizontal = page.getByRole("button", {
    name: "Flip X-ray horizontally",
  });
  const flipVertical = page.getByRole("button", {
    name: "Flip X-ray vertically",
  });
  const displayTransform = page.getByTestId("xray-display-transform");

  await rotateRight.click();
  await expect(rotationStatus).toHaveText("10°");
  expect(await projectionImageSignature(page)).toBe(switchedTube);
  const rotatedTransform = await displayTransform.evaluate(
    (element) => getComputedStyle(element).transform,
  );

  await flipHorizontal.click();
  await expect(flipHorizontal).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      displayTransform.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe(rotatedTransform);
  expect(await projectionImageSignature(page)).toBe(switchedTube);
  const horizontallyFlippedTransform = await displayTransform.evaluate(
    (element) => getComputedStyle(element).transform,
  );

  await flipVertical.click();
  await expect(flipVertical).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      displayTransform.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe(horizontallyFlippedTransform);
  expect(await projectionImageSignature(page)).toBe(switchedTube);

  await page.getByRole("button", { name: "Reset geometry" }).click();
  await expect(page.getByRole("radio", { name: "Left approach" })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Detector over source" }),
  ).toBeChecked();
  await expect(orbit).toHaveValue("0");
  await expect(rotationStatus).toHaveText("10°");
  await expect(flipHorizontal).toHaveAttribute("aria-pressed", "true");
  await expect(flipVertical).toHaveAttribute("aria-pressed", "true");

  const resetGeometryProjection = await waitForProjectionChange(
    page,
    switchedTube,
  );
  await page.getByRole("button", { name: "Reset X-ray display" }).click();
  await expect(rotationStatus).toHaveText("0°");
  await expect(flipHorizontal).toHaveAttribute("aria-pressed", "false");
  await expect(flipVertical).toHaveAttribute("aria-pressed", "false");
  expect(await projectionImageSignature(page)).toBe(resetGeometryProjection);
  await expect(page.getByRole("radio", { name: "Left approach" })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Detector over source" }),
  ).toBeChecked();
});

test("@desktop rotates continuously in 10-degree steps", async ({ page }) => {
  const rotateRight = page.getByRole("button", {
    name: "Rotate X-ray right 10 degrees",
  });
  const rotateLeft = page.getByRole("button", {
    name: "Rotate X-ray left 10 degrees",
  });
  const rotationStatus = page.getByLabel("X-ray rotation");

  await rotateRight.evaluate((button) => {
    for (let step = 0; step < 37; step += 1) (button as HTMLElement).click();
  });
  await expect(rotationStatus).toHaveText("10°");

  await rotateLeft.evaluate((button) => {
    for (let step = 0; step < 38; step += 1) (button as HTMLElement).click();
  });
  await expect(rotationStatus).toHaveText("350°");
});

test("@desktop centres the C-arm from head through both feet", async ({ page }) => {
  const lateral = page.getByRole("spinbutton", {
    name: "Lateral translation value",
  });
  const longitudinal = page.getByRole("spinbutton", {
    name: "Longitudinal translation value",
  });

  await page
    .getByRole("button", { name: "Centre C-arm on Head / neck" })
    .click();
  await expect(longitudinal).toHaveValue("713");

  await page
    .getByRole("button", { name: "Centre C-arm on Left foot" })
    .click();
  await expect(lateral).toHaveValue("99");
  await expect(longitudinal).toHaveValue("-812");

  await page
    .getByRole("button", { name: "Centre C-arm on Right foot" })
    .click();
  await expect(lateral).toHaveValue("-99");
  await expect(longitudinal).toHaveValue("-812");
});

test("@desktop positions and resets the complete patient independently", async ({
  page,
}) => {
  const patient = page.getByRole("group", { name: "Patient position" });
  const patientLongitudinal = patient.getByRole("spinbutton", {
    name: "Patient longitudinal position value",
  });
  const patientRoll = patient.getByRole("spinbutton", {
    name: "Patient roll value",
  });
  const orbit = page.getByRole("spinbutton", { name: "Orbit angle" });

  const neutral = await projectionImageSignature(page);
  await patientLongitudinal.fill("120");
  await waitForProjectionChange(page, neutral);

  await patient.getByRole("button", { name: "Prone neutral" }).click();
  await expect(patientLongitudinal).toHaveValue("0");
  await expect(patientRoll).toHaveValue("180");

  await orbit.fill("22");
  const direct = patient.getByRole("button", {
    name: "Move patient directly",
  });
  await direct.click();
  await expect(direct).toHaveAttribute("aria-pressed", "true");

  await patient.getByRole("button", { name: "Reset patient position" }).click();
  await expect(patientLongitudinal).toHaveValue("0");
  await expect(patientRoll).toHaveValue("0");
  await expect(orbit).toHaveValue("22");
});

test("@desktop direct pointer interaction updates every signed angle plaque value", async ({
  page,
}) => {
  const plaque = page.getByLabel("C-arm angles");
  for (const [sliderName, plaqueName] of [
    ["Orbit", "Orbit"],
    ["Cranial/caudal tilt", "Tilt"],
    ["Swivel", "Swivel"],
  ] as const) {
    const value = await pointRangePositive(
      page.getByRole("slider", { name: sliderName, exact: true }),
    );
    await expect(plaque).toContainText(
      `${plaqueName} +${Math.round(value)}°`,
    );
  }
});

test("@desktop keeps the complete rotated X-ray inside its black stage", async ({
  page,
}) => {
  await projectionImageSignature(page);
  const stage = page.locator(".projection-view__display-stage");
  const transformedImage = page.getByTestId("xray-display-transform");
  const rotateRight = page.getByRole("button", {
    name: "Rotate X-ray right 10 degrees",
  });
  const rotationStatus = page.getByLabel("X-ray rotation");

  await rotateRight.click();
  await expect(rotationStatus).toHaveText("10°");
  await expect(transformedImage).toHaveCSS("transform", /matrix\(/);
  await expectInside(transformedImage, stage);

  for (let step = 0; step < 3; step += 1) await rotateRight.click();
  await expect(rotationStatus).toHaveText("40°");
  await expectInside(transformedImage, stage);
});

test("@desktop exposes the full-length support-free table in an oblique theatre view", async ({
  page,
}) => {
  const theatre = page.getByRole("region", { name: "3D theatre" });
  const geometryStatus = page.getByRole("status", {
    name: "3D theatre geometry",
  });
  await expect(geometryStatus).toContainText("Tabletop 2100 × 550 × 50 mm");
  await expect(geometryStatus).toContainText("Central pedestal absent");
  const ap = sourceSignature((await theatre.screenshot()).toString("base64"));

  const orbit = page.getByRole("spinbutton", { name: "Orbit angle" });
  await orbit.fill("35");
  await orbit.press("Enter");
  await expect(page.getByLabel("C-arm angles")).toContainText("Orbit +35°");
  const oblique = await theatre.screenshot();
  expect(oblique.length).toBeGreaterThan(10_000);
  expect(sourceSignature(oblique.toString("base64"))).not.toBe(ap);
});

test("@desktop retired public routes redirect to the root simulator", async ({
  page,
}) => {
  for (const path of RETIRED_PATHS) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Projection geometry lab",
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toHaveCount(0);
});

test("@desktop root simulator retains complete anatomy attribution", async ({
  page,
}) => {
  const anatomy = page.getByRole("group", { name: "Anatomy", exact: true });
  await expect(anatomy).toContainText("George J.R. Maat (LUMC)");
  await expect(anatomy).toContainText("Jan Kooloos (RadboudUMC)");
  await expect(
    anatomy.getByRole("link", { name: "AnatomyTOOL Open3DModel" }),
  ).toHaveAttribute("href", "https://anatomytool.org/open3dmodel");
  await expect(
    anatomy.getByRole("link", { name: "CC BY-SA 4.0" }),
  ).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by-sa/4.0/",
  );
});

test("@desktop full regional presentation follows anatomy controls without changing the X-ray", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const neutralProjection = await projectionImageSignature(page);
  const orbit = page.getByRole("spinbutton", { name: "Orbit angle" });
  await orbit.fill("30");
  await orbit.press("Enter");
  const detectorBaseline = await waitForProjectionChange(
    page,
    neutralProjection,
  );
  const displayTransform = page.getByTestId("xray-display-transform");
  const displayBaseline = await displayTransform.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  const theatreBaseline = await theatreSignature(page);
  const fullRegional = page.getByRole("radio", {
    name: "Show full regional anatomy in 3D",
  });
  const regionalStatus = page.getByRole("status", {
    name: "3D presentation status",
  });
  await expect(regionalStatus).toContainText("All regions visible");

  await fullRegional.check();
  await expect(fullRegional).toBeChecked();
  await expect(
    page.getByRole("status", { name: "Regional anatomy status" }),
  ).toHaveCount(0, { timeout: 30_000 });
  await expect(
    page.getByText("Full regional anatomy unavailable", { exact: true }),
  ).toHaveCount(0);
  const regionalBaseline = await waitForTheatreChange(page, theatreBaseline);
  await expect(regionalStatus).toContainText("Full regional ready");
  await expect(regionalStatus).toContainText("Both legs");
  expect(await projectionImageSignature(page)).toBe(detectorBaseline);
  expect(
    await displayTransform.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
  ).toBe(displayBaseline);

  const leftOnly = page.getByRole("button", { name: "Show only left leg" });
  await leftOnly.click();
  await expect(regionalStatus).toContainText("Left leg only");
  const leftOnlySignature = await waitForTheatreChange(page, regionalBaseline);
  const leftOnlyProjection = await waitForProjectionChange(
    page,
    detectorBaseline,
  );

  const rotation = page.getByRole("slider", {
    name: "Left leg internal or external rotation",
  });
  await rotation.fill("25");
  await expect(rotation).toHaveValue("25");
  await expect(regionalStatus).toContainText("Left leg rotation +25°");
  const rotatedSignature = await waitForTheatreChange(page, leftOnlySignature);
  const rotatedProjection = await waitForProjectionChange(
    page,
    leftOnlyProjection,
  );
  expect(
    await displayTransform.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
  ).toBe(displayBaseline);

  await page.getByRole("button", { name: "Show only right leg" }).click();
  await expect(regionalStatus).toContainText("Right leg only");
  await expect(regionalStatus).toContainText("Right leg rotation 0°");
  await waitForTheatreChange(page, rotatedSignature);
  await waitForProjectionChange(page, rotatedProjection);
});

test("@desktop isolates every body region and keeps camera fitting out of the X-ray", async ({
  page,
}) => {
  test.setTimeout(360_000);
  const angles = page.getByLabel("C-arm angles");
  const presentation = page.getByRole("status", {
    name: "3D presentation status",
  });
  await expect(angles).toContainText("Orbit 0°");
  await expect(angles).toContainText("Tilt 0°");
  await expect(angles).toContainText("Swivel 0°");

  let projection = await projectionImageSignature(page);
  await page.getByRole("button", { name: "Hide all" }).click();
  await expect(presentation).toContainText("No anatomy visible");
  await expect(page.getByRole("button", { name: "Fit anatomy" })).toBeDisabled();
  const hiddenProjection = await waitForProjectionChange(page, projection);

  await page.getByRole("button", { name: "Show all" }).click();
  await expect(presentation).toContainText("All regions visible");
  projection = await waitForProjectionChange(page, hiddenProjection);

  for (const [index, [accessibleRegion, expectedStatus]] of ISOLATED_REGIONS.entries()) {
    if (index > 0) {
      const showAll = page.getByRole("button", { name: "Show all" });
      projection =
        ISOLATED_REGIONS[index - 1][0] === "pelvis"
          ? await waitForProjectionSettlementAfter(page, () => showAll.click())
          : await (async () => {
              await showAll.click();
              return waitForProjectionChange(page, projection);
            })();
      await expect(presentation).toContainText("All regions visible");
    }
    const isolate = page.getByRole("button", {
      name: `Show only ${accessibleRegion}`,
    });
    projection =
      accessibleRegion === "pelvis"
        ? await waitForProjectionSettlementAfter(page, () => isolate.click())
        : await (async () => {
            await isolate.click();
            return waitForProjectionChange(page, projection);
          })();
    await expect(presentation).toContainText(expectedStatus);
    await expect(presentation).not.toContainText(
      `${expectedStatus} · ${expectedStatus}`,
    );

    const theatreBeforeFit = await theatreSignature(page);
    await page.getByRole("button", { name: "Fit anatomy" }).click();
    await waitForTheatreChange(page, theatreBeforeFit);
    expect(await projectionImageSignature(page)).toBe(projection);
  }
});

test("@desktop applies region changes only to the next shot in Shots only", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const shotsOnly = page.getByRole("radio", { name: "Shots only" });
  const takeShot = page.getByRole("button", { name: "Take shot" });
  await projectionImageSignature(page);
  await shotsOnly.check();
  await takeShot.click();
  const initialShot = await projectionImageSignature(page);

  await page.getByRole("button", { name: "Show only left leg" }).click();
  await expect(
    page.getByRole("status", { name: "3D presentation status" }),
  ).toContainText("Left leg only");
  await waitForUiScheduling(page);
  expect(await projectionImageSignature(page)).toBe(initialShot);

  await page.getByRole("button", { name: "Fit anatomy" }).click();
  expect(await projectionImageSignature(page)).toBe(initialShot);
  await takeShot.click();
  await waitForProjectionChange(page, initialShot);
});

test("@desktop uses explicit settled and interactive detector resolutions", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const projection = page.getByRole("region", { name: "Simulated X-ray view" });
  const detector = page.getByTestId("projection-detector-display");
  const image = projection.locator("img.projection-view__surface");
  const orbit = page.getByRole("spinbutton", { name: "Orbit angle" });

  await projectionImageSignature(page);
  await expect(projection).toHaveAttribute("data-render-width", "768");
  await expect(projection).toHaveAttribute("data-render-height", "768");
  await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBe(768);

  await page.getByRole("radio", { name: "High quality" }).check();
  await expect(detector).toHaveAttribute("aria-busy", "false", {
    timeout: 240_000,
  });
  await expect(projection).toHaveAttribute("data-render-width", "1024");
  await expect(projection).toHaveAttribute("data-render-height", "1024");
  await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBe(1024);

  await orbit.dispatchEvent("pointerdown", { pointerId: 41 });
  await orbit.fill("20");
  await expect(projection).toHaveAttribute("data-render-width", "512");
  await expect(projection).toHaveAttribute("data-render-height", "512");
  await expect
    .poll(async () => {
      const busy = await detector.getAttribute("aria-busy");
      const width = await image.evaluate((node) => node.naturalWidth);
      return busy === "false" ? width : null;
    }, { timeout: 240_000 })
    .toBe(512);
  const interactiveProjection = await projectionImageSignature(page);
  await orbit.dispatchEvent("pointerup", { pointerId: 41 });
  await expect(projection).toHaveAttribute("data-render-width", "1024");
  await waitForProjectionChange(page, interactiveProjection);
  await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBe(1024);
});

test("@desktop shots only freezes exposures while display orientation remains independent", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await projectionImageSignature(page);
  const projection = page.getByRole("region", { name: "Simulated X-ray view" });
  const detector = page.getByTestId("projection-detector-display");
  const image = projection.locator("img.projection-view__surface");
  const orbit = page.getByRole("spinbutton", { name: "Orbit angle" });
  const shotsOnly = page.getByRole("radio", { name: "Shots only" });
  const continuous = page.getByRole("radio", { name: "Continuous imaging" });
  const takeShot = page.getByRole("button", { name: "Take shot" });

  await shotsOnly.check();
  await expect(shotsOnly).toBeChecked();
  await expect(
    page.getByRole("status", { name: "X-ray acquisition status" }),
  ).toHaveText("Ready for exposure");
  await expect(
    projection.getByText("Preparing detector projection…", { exact: true }),
  ).toHaveCount(0);
  await expect(detector).toHaveAttribute("aria-busy", "false");
  await expect(image).toHaveCount(0);

  await orbit.fill("20");
  await orbit.press("Enter");
  await waitForUiScheduling(page);
  await expect(detector).toHaveAttribute("aria-busy", "false");
  await expect(image).toHaveCount(0);
  await expect(takeShot).toBeEnabled();
  await takeShot.click();
  const firstShot = await projectionImageSignature(page);
  await expect(
    page.getByRole("status", { name: "X-ray acquisition status" }),
  ).toHaveText("Image captured");

  await orbit.fill("40");
  await orbit.press("Enter");
  await waitForUiScheduling(page);
  await expect(detector).toHaveAttribute("aria-busy", "false");
  expect(await projectionImageSignature(page)).toBe(firstShot);

  await page
    .getByRole("button", { name: "Rotate X-ray right 10 degrees" })
    .click();
  await page.getByRole("button", { name: "Flip X-ray horizontally" }).click();
  await page.getByRole("button", { name: "Flip X-ray vertically" }).click();
  await expect(page.getByLabel("X-ray rotation")).toHaveText("10°");
  expect(await projectionImageSignature(page)).toBe(firstShot);

  await takeShot.click();
  const secondShot = await waitForProjectionChange(page, firstShot);
  expect(secondShot).not.toBe(firstShot);

  await orbit.fill("55");
  await orbit.press("Enter");
  await waitForUiScheduling(page);
  await expect(detector).toHaveAttribute("aria-busy", "false");
  expect(await projectionImageSignature(page)).toBe(secondShot);
  await continuous.check();
  await expect(continuous).toBeChecked();
  const resumed = await waitForProjectionChange(page, secondShot);
  expect(resumed).not.toBe(secondShot);
  await expect(
    page.getByRole("status", { name: "Projection status" }),
  ).toContainText("Orbit 55.0°");
});

test("@desktop production root remains usable offline", async ({
  context,
  page,
}) => {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error("Service worker is not active");
  });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Projection geometry lab" }),
  ).toBeVisible();
  const offlineOrbit = page.getByRole("spinbutton", { name: "Orbit angle" });
  await offlineOrbit.fill("10");
  await offlineOrbit.press("Enter");
  await expect(
    page.getByRole("status", { name: "Projection status" }),
  ).toContainText("Orbit 10.0°");
  await expect(page.getByText("Anatomy loading")).toHaveCount(0);
  await expect(
    page.getByText("Anatomy unavailable", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Full-body anatomy unavailable", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Show only left arm" }).click();
  await expect(
    page.getByRole("status", { name: "3D presentation status" }),
  ).toContainText("Left arm only");
  await page.getByRole("button", { name: "Show only left leg" }).click();
  await expect(
    page.getByRole("status", { name: "3D presentation status" }),
  ).toContainText("Left leg only");
  const theatreBaseline = await theatreSignature(page);
  const fullRegional = page.getByRole("radio", {
    name: "Show full regional anatomy in 3D",
  });
  await fullRegional.check();
  await expect(fullRegional).toBeChecked();
  await expect(
    page.getByRole("status", { name: "Regional anatomy status" }),
  ).toHaveCount(0, { timeout: 30_000 });
  await expect(
    page.getByText("Full regional anatomy unavailable", { exact: true }),
  ).toHaveCount(0);
  await waitForTheatreChange(page, theatreBaseline);
  await context.setOffline(false);
});

test("@desktop complement failure keeps the detailed base usable and retry recovers", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
    serviceWorkers: "block",
    viewport: { height: 1000, width: 1440 },
  });
  const page = await context.newPage();
  let failComplement = true;
  await page.route(
    "**/anatomy/open3dmodel-full-body-complement.glb",
    async (route) => {
      if (failComplement) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    },
  );

  await page.goto("/");
  await expect(
    page.getByText("Full-body anatomy unavailable", { exact: true }),
  ).toBeVisible();
  for (const label of [
    "Show head and neck",
    "Show torso",
    "Show left arm",
    "Show right arm",
  ]) {
    await expect(page.getByRole("button", { name: label })).toBeDisabled();
  }
  for (const label of ["Show pelvis", "Show left leg", "Show right leg"]) {
    await expect(page.getByRole("button", { name: label })).toBeEnabled();
  }

  const completeBase = await projectionImageSignature(page);
  await page.getByRole("button", { name: "Show only left leg" }).click();
  await expect(
    page.getByRole("status", { name: "3D presentation status" }),
  ).toContainText("Left leg only");
  await waitForProjectionChange(page, completeBase);

  failComplement = false;
  await page.getByRole("button", { name: "Retry full-body anatomy" }).click();
  await expect(
    page.getByText("Full-body anatomy unavailable", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show left arm" })).toBeEnabled();
  await page.getByRole("button", { name: "Show only left arm" }).click();
  await expect(
    page.getByRole("status", { name: "3D presentation status" }),
  ).toContainText("Left arm only");
  await context.close();
});

test("@mobile mounts the X-ray, theatre, and all controls without tabs", async ({
  page,
}) => {
  await expect(
    page.getByRole("region", { name: "Simulated X-ray view" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "3D theatre" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Move C-arm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Rig setup", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Anatomy", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Show full regional anatomy in 3D" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Continuous imaging" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Shots only" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take shot" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show all" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide all" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit anatomy" })).toBeVisible();
  for (const [accessibleRegion] of ISOLATED_REGIONS) {
    const only = page.getByRole("button", {
      name: `Show only ${accessibleRegion}`,
    });
    await expect(only).toBeVisible();
    await expect(only).toBeEnabled();
  }
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
});
