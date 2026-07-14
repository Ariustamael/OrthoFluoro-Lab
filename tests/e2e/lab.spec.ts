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
  await orbit.fill("15");
  await orbit.press("Enter");
  await expect(
    page.getByRole("status", { name: "Projection status" }),
  ).toContainText("Orbit 15.0°");

  const objectRotation = page.getByRole("spinbutton", {
    name: "Object rotation X",
  });
  await objectRotation.fill("20");
  await objectRotation.press("Enter");
  await expect(objectRotation).toHaveValue("20");

  await page.getByRole("button", { name: "Take simulated image" }).click();
  await expect(
    page.getByRole("status", { name: "Image capture status" }),
  ).toHaveText("Synthetic image captured");

  await page.getByRole("button", { name: "Reset geometry" }).click();
  await expect(orbit).toHaveValue("0");
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
