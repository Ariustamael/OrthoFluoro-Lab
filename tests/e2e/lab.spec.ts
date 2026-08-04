import { expect, test, type Page } from "@playwright/test";

const consoleErrors = new WeakMap<Page, string[]>();
const SIX_POSE_LABELS = [
  "Lateral translation value",
  "Vertical translation value",
  "Longitudinal translation value",
  "Swivel angle",
  "Cranial/caudal angle",
  "Orbit angle",
] as const;

async function poseValues(page: Page): Promise<string[]> {
  return Promise.all(
    SIX_POSE_LABELS.map((label) =>
      page.getByRole("spinbutton", { name: label }).inputValue(),
    ),
  );
}

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

test("@desktop learner completes the linked C-arm simulator journey", async ({
  page,
}) => {
  await expect(page.getByRole("region", { name: "3D theatre" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Simulated X-ray view" }),
  ).toBeVisible();

  const orbit = page.getByRole("spinbutton", { name: "Orbit angle" });
  const projectionStatus = page.getByRole("status", {
    name: "Projection status",
  });
  await orbit.fill("30");
  await orbit.press("Enter");
  await expect(projectionStatus).toContainText("Orbit 30.0°");

  const beamToggle = page.getByRole("checkbox", { name: "Show X-ray beam" });
  const statusBeforeBeamToggle = await projectionStatus.textContent();
  expect(statusBeforeBeamToggle).not.toBeNull();
  await beamToggle.uncheck();
  await expect(beamToggle).not.toBeChecked();
  await expect(projectionStatus).toHaveText(statusBeforeBeamToggle!);
  await beamToggle.check();
  await expect(beamToggle).toBeChecked();
  await expect(projectionStatus).toHaveText(statusBeforeBeamToggle!);

  const poseBeforeModeChange = await poseValues(page);
  const nonIsocentric = page.getByRole("button", { name: "Non-isocentric" });
  await nonIsocentric.click();
  await expect(nonIsocentric).toHaveAttribute("aria-pressed", "true");
  expect(await poseValues(page)).toEqual(poseBeforeModeChange);

  const moveCArm = page.getByRole("button", { name: "Move C-arm" });
  await moveCArm.click();
  await expect(moveCArm).toHaveAttribute("aria-pressed", "true");
  const companionSemantics = [
    ["Orbit and tilt cue", ["Orbit angle", "Cranial/caudal angle"]],
    [
      "Translation cue",
      [
        "Lateral translation value",
        "Vertical translation value",
        "Longitudinal translation value",
      ],
    ],
    ["Wig-wag cue", ["Swivel angle"]],
  ] as const;
  for (const [manipulatorName, controlLabels] of companionSemantics) {
    await test.step(`${manipulatorName} is exposed with its companion controls`, async () => {
      const manipulatorGroup = page.getByRole("group", {
        name: manipulatorName,
        exact: true,
      });
      await expect(manipulatorGroup).toBeVisible();
      for (const label of controlLabels) {
        await expect(
          manipulatorGroup.getByRole("spinbutton", { name: label }),
        ).toBeVisible();
      }
    });
  }

  await page.getByRole("button", { name: "Reset geometry" }).click();
  await expect(
    page.getByRole("button", { name: "Isocentric", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(beamToggle).toBeChecked();
  for (const label of SIX_POSE_LABELS) {
    await expect(page.getByRole("spinbutton", { name: label })).toHaveValue(
      "0",
    );
  }
});

test("@desktop geometry review exposes the three reference views", async ({
  page,
}) => {
  await page.goto("/lab/c-arm-review");
  await expect(
    page.getByRole("heading", { level: 1, name: "C-arm geometry review" }),
  ).toBeVisible();
  for (const name of ["Side", "Detector-facing", "Oblique"]) {
    const button = page.getByRole("button", { name });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }

  const beamToggle = page.getByRole("button", { name: "Beam off" });
  await beamToggle.click();
  await expect(page.getByRole("button", { name: "Beam on" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("@desktop production shell remains usable offline", async ({
  context,
  page,
}) => {
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
  await expect(page.getByText("Anatomy loading")).toHaveCount(0);
  await expect(page.getByText("Anatomy unavailable")).toHaveCount(0);
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

test("@mobile learner mounts only the selected lab surface", async ({
  page,
}) => {
  const checks = [
    ["3D Scene", "3D theatre"],
    ["Fluoroscopy", "Simulated X-ray view"],
    ["Controls", "C-arm controls"],
    ["Information", "Information"],
  ] as const;

  for (const [tabName, regionName] of checks) {
    const tab = page.getByRole("tab", { name: tabName });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: regionName })).toBeVisible();
    if (tabName !== "3D Scene") {
      await expect(
        page.getByRole("region", { name: "3D theatre" }),
      ).toHaveCount(0);
    }
    if (tabName !== "Fluoroscopy") {
      await expect(
        page.getByRole("region", { name: "Simulated X-ray view" }),
      ).toHaveCount(0);
    }
  }
});
