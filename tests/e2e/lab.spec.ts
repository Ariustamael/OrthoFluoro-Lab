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
  const image = page
    .getByRole("region", { name: "Simulated X-ray view" })
    .locator("img.projection-view__surface");
  await expect(image).toBeVisible();
  const source = await image.getAttribute("src");
  expect(source).toMatch(/^data:image\/(png|svg\+xml)/);
  expect(source!.length).toBeGreaterThan(100);
  return sourceSignature(source!);
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
  const rotationStatus = page.getByRole("status", { name: "X-ray rotation" });
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
  const rotationStatus = page.getByRole("status", { name: "X-ray rotation" });

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
  const rotationStatus = page.getByRole("status", { name: "X-ray rotation" });

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
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
});
