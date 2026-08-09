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
  await page.getByRole("radio", { name: "Left leg only" }).check();
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
  await expect(page.getByRole("radio", { name: "Both legs" })).toBeChecked();

  await fullRegional.check();
  await expect(fullRegional).toBeChecked();
  await expect(
    page.getByRole("status", { name: "Regional anatomy status" }),
  ).toHaveCount(0, { timeout: 30_000 });
  await expect(
    page.getByText("Full regional anatomy unavailable", { exact: true }),
  ).toHaveCount(0);
  const regionalBaseline = await waitForTheatreChange(page, theatreBaseline);
  const regionalStatus = page.getByRole("status", {
    name: "3D presentation status",
  });
  await expect(regionalStatus).toContainText("Full regional ready");
  await expect(regionalStatus).toContainText("Both legs");
  expect(await projectionImageSignature(page)).toBe(detectorBaseline);
  expect(
    await displayTransform.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
  ).toBe(displayBaseline);

  const leftOnly = page.getByRole("radio", { name: "Left leg only" });
  await leftOnly.check();
  await expect(leftOnly).toBeChecked();
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

  await page.getByRole("radio", { name: "Right leg only" }).check();
  await expect(
    page.getByRole("radio", { name: "Right leg only" }),
  ).toBeChecked();
  await expect(regionalStatus).toContainText("Right leg only");
  await expect(regionalStatus).toContainText("Right leg rotation 0°");
  await waitForTheatreChange(page, rotatedSignature);
  await waitForProjectionChange(page, rotatedProjection);
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
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
});
