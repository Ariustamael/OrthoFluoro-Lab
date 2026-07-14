import { expect, test, type Page } from "@playwright/test";

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  consoleErrors.set(page, errors);
  await page.goto("/lab");
  await expect(
    page.getByRole("heading", { level: 1, name: "Projection geometry lab" }),
  ).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

test("@desktop learner completes the core geometry journey", async ({
  context,
  page,
}) => {
  await expect(page.getByRole("region", { name: "3D theatre" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Simplified anatomical projection" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Move C-arm" }).click();
  await expect(
    page.getByRole("button", { name: "Move C-arm" }),
  ).toHaveAttribute("aria-pressed", "true");

  const orbit = page.getByRole("spinbutton", { name: "Orbit angle" });
  const projectionImage = page
    .getByRole("region", { name: "Simplified anatomical projection" })
    .locator("img");
  await expect(projectionImage).toBeVisible();
  await orbit.fill("15");
  await orbit.press("Enter");
  await expect(
    page.getByRole("status", { name: "Projection status" }),
  ).toContainText("Orbit 15.0°");

  const objectRotation = page.getByRole("spinbutton", {
    name: "Object rotation X",
  });
  const projectionBeforeRotation = await projectionImage.getAttribute("src");
  await page.getByRole("button", { name: "Move anatomy" }).click();
  await expect(
    page.getByRole("button", { name: "Move anatomy" }),
  ).toHaveAttribute("aria-pressed", "true");
  await objectRotation.fill("20");
  await objectRotation.press("Enter");
  await expect(objectRotation).toHaveValue("20");
  await expect
    .poll(() => projectionImage.getAttribute("src"))
    .not.toBe(projectionBeforeRotation);

  await page.getByRole("button", { name: "Take simulated image" }).click();
  await expect(
    page.getByRole("status", { name: "Image capture status" }),
  ).toHaveText("Synthetic image captured");

  await page.getByRole("button", { name: "Reset geometry" }).click();
  await expect(orbit).toHaveValue("0");

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error("Service worker is not active");
  });
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Projection geometry lab" }),
  ).toBeVisible();
  const offlineOrbit = page.getByRole("spinbutton", { name: "Orbit angle" });
  await offlineOrbit.fill("10");
  await offlineOrbit.press("Enter");
  await expect(
    page.getByRole("status", { name: "Projection status" }),
  ).toContainText("Orbit 10.0°");
  await context.setOffline(false);
});

test("@desktop declared routes render distinct learning pages", async ({
  page,
}) => {
  const routes = [
    ["/", "Explore fluoroscopy in three dimensions"],
    ["/guided", "Guided views"],
    ["/guided/wrist-true-lateral", "Wrist true lateral"],
    ["/library", "Case library"],
    ["/library/wrist-neutral", "Wrist neutral case"],
    ["/communication", "Communication practice"],
    ["/saved", "Saved learning"],
    ["/about", "About OrthoFluoro Lab"],
    ["/settings", "Settings"],
  ] as const;

  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
  }
});

test("@mobile learner can switch between every lab surface", async ({
  page,
}) => {
  const checks = [
    ["3D Scene", "3D theatre"],
    ["Fluoroscopy", "Simplified anatomical projection"],
    ["Controls", "C-arm controls"],
    ["Information", "Information"],
  ] as const;

  for (const [tabName, regionName] of checks) {
    const tab = page.getByRole("tab", { name: tabName });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: regionName })).toBeVisible();
  }
});
