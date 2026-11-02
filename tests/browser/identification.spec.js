import { test, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
function file({ calibrated = true, flat = false } = {}) {
  const energies = Array.from({ length: 1024 }, (_, i) => i * 3);
  const counts = energies.map((e) =>
    flat
      ? 10
      : Math.round(
          10 +
            500 * Math.exp(-0.5 * ((e - 661.657) / 15) ** 2) +
            400 * Math.exp(-0.5 * ((e - 1173.228) / 18) ** 2) +
            400 * Math.exp(-0.5 * ((e - 1332.492) / 18) ** 2),
        ),
  );
  return {
    name: "synthetic-peaks.ats",
    mimeType: "text/plain",
    buffer: Buffer.from(
      `ATOMTEXSPECTRUM =\nSPECTR = 1024\n${counts.join("\n")}\n${calibrated ? `ECALIBRATION = 1024\n${energies.join("\n")}\n` : ""}`,
    ),
  };
}
test("brand, logo and favicon are local assets and prior visible references are removed", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page).toHaveTitle("ATS Spectrum Analizer");
  const logo = page.getByRole("img", { name: "Logo de ATS Spectrum Analizer" });
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate((img) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  const favicon = await page.locator("link[rel=icon]").getAttribute("href");
  expect((await page.request.get(favicon)).headers()["content-type"]).toContain(
    "image/png",
  );
  await page.locator("#file").setInputFiles(file());
  await expect(page.locator("body")).not.toContainText(/ATOMTEX|ejemplo_123/i);
});
test("file loading automatically detects peaks, suggests candidates and applies strongest ROI locally", async ({
  page,
}) => {
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4173/") || r.method() !== "GET")
      external.push(r.url());
  });
  await page.goto("./");
  await page.locator("#file").setInputFiles(file());
  await expect(page.locator("#peak-rows tr")).toHaveCount(3);
  await expect(page.locator("#peak-rows")).toContainText("Cs-137 ?");
  await expect(page.locator("#peak-rows")).toContainText("Co-60 ?");
  await expect(page.locator("#roi-values")).toBeVisible();
  await expect(page.locator("#identification-status")).toContainText(
    "no son identificaciones confirmadas",
  );
  await page.locator("#baseline-method").selectOption("constant");
  await page
    .getByRole("button", { name: /Analizar pico de/ })
    .last()
    .click();
  await expect(page.locator("#baseline-method")).toHaveValue("constant");
  await expect(page.locator("#roi-values")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.locator("#xlsx").click();
  const files = unzipSync(await readFile(await (await download).path()));
  expect(strFromU8(files["xl/worksheets/sheet3.xml"])).toContain("Cs-137");
  expect(strFromU8(files["xl/worksheets/sheet2.xml"])).toContain(
    "sandia-subset-1",
  );
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("unusable energy and featureless spectra clear previous candidates; parameters reanalyze automatically", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#file").setInputFiles(file());
  await page.locator("#auto-peak-roi").uncheck();
  await page.locator("#file").setInputFiles(file());
  await expect(page.locator("#roi-values")).toBeHidden();
  await expect(page.locator("#peak-rows tr")).toHaveCount(3);
  await page.locator("#id-tolerance").fill("0");
  await expect(page.locator("#identification-status")).toContainText(
    "no aplicado",
  );
  await expect(page.locator("#peak-rows tr")).toHaveCount(0);
  await page.locator("#id-tolerance").fill("5");
  await expect(page.locator("#peak-rows tr")).toHaveCount(3);
  await page.locator("#file").setInputFiles(file({ calibrated: false }));
  await expect(page.locator("#identification-status")).toContainText(
    "Sin calibración",
  );
  await expect(page.locator("#peak-rows tr")).toHaveCount(0);
  await page.locator("#file").setInputFiles(file({ flat: true }));
  await expect(page.locator("#identification-status")).toContainText(
    "No se detectaron picos",
  );
});
