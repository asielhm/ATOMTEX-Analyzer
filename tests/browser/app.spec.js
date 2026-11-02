import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
const fixture = fileURLToPath(
  new URL("../fixtures/synthetic.ats", import.meta.url),
);
const synthetic = fileURLToPath(
  new URL("../fixtures/synthetic.ats", import.meta.url),
);
test("synthetic file, chart, ROI, baseline edits, full CSV/XLSX downloads; local processing", async ({
  page,
}) => {
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() !== "GET" || !r.url().startsWith("http://127.0.0.1:4173/"))
      requests.push(r.url());
  });
  await page.goto("./");
  await page.locator("#file").setInputFiles(fixture);
  await expect(page.locator("#channels")).toHaveText("8");
  await expect(page.locator("#total")).toHaveText("64");
  await expect(page.locator("#results")).toBeVisible();
  await page.locator("#scale").selectOption("logarithmic");
  await page.locator("#axis").selectOption("channel");
  await page.locator("#zoom-in").click();
  await page.locator("#reset").click();
  await page.locator("#roi-start").fill("1");
  await page.locator("#roi-end").fill("6");
  await page.locator("#base-left").fill("10");
  await page.locator("#base-right").fill("20");
  await page.locator("#analyze").click();
  await expect(page.locator("#roi-values")).toBeVisible();
  await expect(page.locator("#background")).toHaveText("90");
  await page.locator("#base-right").fill("30");
  await expect(page.locator("#roi-values")).toBeHidden();
  await page.locator("#analyze").click();
  await expect(page.locator("#background")).toHaveText("120");
  const csvDownload = page.waitForEvent("download");
  await page.locator("#csv").click();
  const csv = await readFile(await (await csvDownload).path(), "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv.trimEnd().split("\r\n")).toHaveLength(9);
  const xlsxDownload = page.waitForEvent("download");
  await page.locator("#xlsx").click();
  const files = unzipSync(await readFile(await (await xlsxDownload).path()));
  expect(strFromU8(files["xl/worksheets/sheet2.xml"])).toContain("Área neta");
  await page.locator("#focus-roi").click();
  await page.locator("#reset").click();
  await page.locator("#clear-roi").click();
  await expect(page.locator("#roi-values")).toBeHidden();
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});
test("file errors clear previous results; missing energy is never fabricated", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#file").setInputFiles(synthetic);
  await expect(page.locator("#results")).toBeVisible();
  await page.locator("#file").setInputFiles({
    name: "broken.ats",
    mimeType: "text/plain",
    buffer: Buffer.from("SPECTR = 2\n1"),
  });
  await expect(page.locator("#error")).toContainText("incompleto");
  await expect(page.locator("#results")).toBeHidden();
  await page.locator("#file").setInputFiles({
    name: "no-energy.ats",
    mimeType: "text/plain",
    buffer: Buffer.from("SPECTR = 2\n0\n5"),
  });
  await expect(page.locator("#calibration")).toHaveText("No disponible");
  await expect(page.locator("#axis option[value=energy]")).toHaveJSProperty(
    "disabled",
    true,
  );
});
test("mobile layout, drag/drop and numeric automatic baseline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.locator("#drop").evaluate(
    (element, text) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], "synthetic.ats", { type: "text/plain" }));
      element.dispatchEvent(
        new DragEvent("drop", { bubbles: true, dataTransfer: dt }),
      );
    },
    await readFile(synthetic, "utf8"),
  );
  await expect(page.locator("#results")).toBeVisible();
  await page.locator("#roi-start").fill("1");
  await page.locator("#roi-end").fill("6");
  await page.locator("#baseline-method").selectOption("linear");
  await page.locator("#edge").fill("1");
  await page.locator("#analyze").click();
  await expect(page.locator("#net")).toHaveText("46");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("graph clicks select ROI and edit baseline, keyboard controls remain available", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.locator("#file").setInputFiles(synthetic);
  await page.locator("#axis").selectOption("channel");
  await page.locator("#pick-roi").click();
  await page.locator("#chart").click({ position: { x: 160, y: 140 } });
  await page.locator("#chart").click({ position: { x: 680, y: 140 } });
  await expect(page.locator("#roi-values")).toBeVisible();
  await expect(page.locator("#pick-roi")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator("#pick-base").click();
  await page.locator("#chart").click({ position: { x: 200, y: 250 } });
  await page.locator("#chart").click({ position: { x: 650, y: 220 } });
  await expect(page.locator("#pick-base")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#roi-status")).toContainText("manual");
  await expect(page.locator("#roi-values")).toBeVisible();
  expect(Number(await page.locator("#base-left").inputValue())).toBeGreaterThan(
    0,
  );
  expect(errors).toEqual([]);
});

async function dragLimit(page, slider, pixels) {
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + 35;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + pixels, y, { steps: 8 });
  await page.mouse.up();
}

test("integration limits drag independently, recalculate areas and retain manual heights", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.locator("#file").setInputFiles(synthetic);
  await page.locator("#axis").selectOption("channel");
  await page.locator("#roi-start").fill("1");
  await page.locator("#roi-end").fill("6");
  await page.locator("#base-left").fill("2");
  await page.locator("#base-right").fill("4");
  await page.locator("#analyze").click();
  const start = page.getByRole("slider", {
    name: "Límite inicial de integración",
  });
  const end = page.getByRole("slider", { name: "Límite final de integración" });
  await expect(start).toHaveAttribute("aria-valuenow", "1");
  await expect(end).toHaveAttribute("aria-valuenow", "6");
  const step =
    ((await end.boundingBox()).x - (await start.boundingBox()).x) / 5;
  await dragLimit(page, start, step);
  await expect(page.locator("#roi-start")).toHaveValue("2");
  await expect(page.locator("#roi-end")).toHaveValue("6");
  await expect(page.locator("#net")).toHaveText("47");
  await dragLimit(page, end, -step);
  await expect(page.locator("#roi-end")).toHaveValue("5");
  await expect(page.locator("#net")).toHaveText("46");
  await expect(page.locator("#base-left")).toHaveValue("2");
  await expect(page.locator("#base-right")).toHaveValue("4");
  await expect(page.locator("#baseline-method")).toHaveValue("manual");
  await start.focus();
  await page.keyboard.press("End");
  await expect(page.locator("#roi-start")).toHaveValue("4");
  await end.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#roi-end")).toHaveValue("5");
  const download = page.waitForEvent("download");
  await page.locator("#xlsx").click();
  const files = unzipSync(await readFile(await (await download).path()));
  expect(strFromU8(files["xl/charts/chart1.xml"])).toContain(
    "Espectro!$F$6:$F$7",
  );
  await page.locator("#clear-roi").click();
  await expect(start).toBeHidden();
  await expect(end).toBeHidden();
  expect(errors).toEqual([]);
});

for (const method of ["linear", "constant"])
  test(`drag limits preserves ${method} baseline and minimum endpoint windows`, async ({
    page,
  }) => {
    await page.goto("./");
    await page.locator("#file").setInputFiles(synthetic);
    await page.locator("#axis").selectOption("channel");
    await page.locator("#roi-start").fill("1");
    await page.locator("#roi-end").fill("6");
    await page.locator("#baseline-method").selectOption(method);
    await page.locator("#edge").fill("2");
    await page.locator("#analyze").click();
    const start = page.getByRole("slider", {
      name: "Límite inicial de integración",
    });
    await dragLimit(page, start, 600);
    await expect(page.locator("#roi-start")).toHaveValue("3");
    await expect(page.locator("#roi-end")).toHaveValue("6");
    await expect(page.locator("#baseline-method")).toHaveValue(method);
    await expect(page.locator("#edge")).toHaveValue("2");
    await expect(page.locator("#base-left")).toBeDisabled();
    await expect(page.locator("#roi-values")).toBeVisible();
    await expect(page.locator("#error")).toBeHidden();
  });

test("limits follow energy and log axes after zoom, and repeated clicks can be corrected", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#file").setInputFiles(synthetic);
  await page.locator("#pick-roi").click();
  await page.locator("#chart").click({ position: { x: 160, y: 140 } });
  await page.locator("#chart").click({ position: { x: 160, y: 140 } });
  await expect(page.locator("#pick-roi")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#chart").click({ position: { x: 680, y: 140 } });
  await expect(page.locator("#roi-values")).toBeVisible();
  await page.locator("#scale").selectOption("logarithmic");
  await page.locator("#focus-roi").click();
  const start = page.getByRole("slider", {
    name: "Límite inicial de integración",
  });
  await start.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#roi-values")).toBeVisible();
  await expect(start).toHaveAttribute(
    "aria-valuenow",
    await page.locator("#roi-start").inputValue(),
  );
  await page.locator("#axis").selectOption("channel");
  await expect(start).toBeVisible();
});

test.describe("touch integration controls", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("a finger moves a limit without panning the spectrum", async ({
    page,
  }) => {
    await page.goto("./");
    await page.locator("#file").setInputFiles(synthetic);
    await page.locator("#axis").selectOption("channel");
    await page.locator("#roi-start").fill("1");
    await page.locator("#roi-end").fill("6");
    await page.locator("#analyze").click();
    const start = page.getByRole("slider", {
      name: "Límite inicial de integración",
    });
    const end = page.getByRole("slider", {
      name: "Límite final de integración",
    });
    await start.scrollIntoViewIfNeeded();
    const a = await start.boundingBox(),
      b = await end.boundingBox();
    const x = a.x + a.width / 2,
      y = a.y + 35,
      step = (b.x - a.x) / 5;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + step, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator("#roi-start")).toHaveValue("2");
    await expect(page.locator("#roi-end")).toHaveValue("6");
    await expect(page.locator("#roi-values")).toBeVisible();
    await cdp.detach();
  });
});

test("both handles remain reachable for repeated energies", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#file").setInputFiles({
    name: "duplicates.ats",
    mimeType: "text/plain",
    buffer: Buffer.from("SPECTR = 4\n1\n2\n3\n4\nECALIBRATION = 4\n0\n0\n1\n2"),
  });
  await page.locator("#roi-start").fill("0");
  await page.locator("#roi-end").fill("1");
  await page.locator("#analyze").click();
  const start = page.getByRole("slider", {
    name: "Límite inicial de integración",
  });
  const end = page.getByRole("slider", { name: "Límite final de integración" });
  await expect(start).toBeVisible();
  await expect(end).toBeVisible();
  await start.click({ position: { x: 14, y: 14 } });
  await expect(start).toBeFocused();
  await end.click({ position: { x: 14, y: 14 } });
  await expect(end).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#roi-end")).toHaveValue("2");
});
