import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalog,
  detectPeaks,
  identifySpectrum,
  matchLines,
  identificationSettings,
} from "../src/identification.js";
function spectrum(
  lines = [
    [661.657, 500, 15],
    [1173.228, 400, 18],
    [1332.492, 400, 18],
  ],
  length = 1024,
) {
  const energies = Array.from({ length }, (_, i) => i * 3);
  return {
    hasEnergy: true,
    energies,
    counts: energies.map((e) =>
      Math.round(
        10 +
          lines.reduce(
            (sum, [center, height, sigma]) =>
              sum + height * Math.exp(-0.5 * ((e - center) / sigma) ** 2),
            0,
          ),
      ),
    ),
  };
}
test("catalog provenance, daughter emitter, exact pinned reference lines and probabilities", () => {
  assert.equal(
    catalog.sourceRevision,
    "cd75314b56e12b80497531a1fbeed9c8e9968403",
  );
  assert.equal(catalog.lines.length, 161);
  assert.equal(catalog.nuclideCount, 27);
  assert.ok(
    catalog.lines.every(
      (l) =>
        l.energy >= 20 &&
        l.energy <= 3500 &&
        l.emissionProbability >= 0.005 &&
        l.emissionProbability <= 1,
    ),
  );
  const cesium = catalog.lines.find((l) => l.nuclide === "Cs-137");
  assert.equal(cesium.energy, 661.657);
  assert.equal(cesium.emitter, "Ba-137m");
  assert.deepEqual(
    catalog.lines.filter((l) => l.nuclide === "Co-60").map((l) => l.energy),
    [1173.228, 1332.492],
  );
});
test("automatic search resolves separate gamma peaks without mutating original counts or energies", () => {
  const model = spectrum(),
    before = structuredClone(model);
  Object.freeze(model.counts);
  Object.freeze(model.energies);
  Object.freeze(model);
  const result = identifySpectrum(model);
  assert.equal(result.peaks.length, 3);
  assert.ok(Math.abs(result.peaks[0].energy - 661.657) < 2);
  assert.equal(result.peaks[0].candidates[0].nuclide, "Cs-137");
  for (const peak of result.peaks.slice(1))
    assert.equal(peak.candidates.find((l) => l.nuclide === "Co-60").support, 2);
  assert.deepEqual(model, before);
});
test("flat spectra, weak fluctuations and monotonic continua do not produce fingerprints", () => {
  for (const counts of [
    Array(256).fill(20),
    Array.from({ length: 256 }, (_, i) => 20 + i),
    Array.from({ length: 256 }, (_, i) => 20 + (i % 7 === 0 ? 1 : 0)),
  ])
    assert.deepEqual(
      detectPeaks({
        hasEnergy: true,
        counts,
        energies: counts.map((_, i) => i * 3),
      }),
      [],
    );
});
test("missing energy, short spectra, or all-zero calibration never yield nuclides", () => {
  for (const model of [
    { ...spectrum(), hasEnergy: false, energies: null },
    {
      hasEnergy: false,
      energies: Array(20).fill(0),
      counts: Array(20).fill(100),
    },
    { hasEnergy: true, energies: [0, 1, 2], counts: [0, 100, 0] },
  ])
    assert.equal(identifySpectrum(model).peaks.length, 0);
  assert.equal(
    identifySpectrum({ ...spectrum(), hasEnergy: false }).available,
    false,
  );
});
test("186 keV remains ambiguous between U-235 and Ra-226", () => {
  const [peak] = matchLines([{ channel: 62, energy: 186 }], {
    absoluteTolerance: 1,
    relativeTolerance: 0,
  });
  assert.ok(peak.candidates.some((l) => l.nuclide === "U-235"));
  assert.ok(peak.candidates.some((l) => l.nuclide === "Ra-226"));
  assert.ok(peak.candidates.every((l) => l.support === 1));
});
test("511 keV is labelled a possible annihilation feature, never uniquely Na-22", () => {
  const [peak] = matchLines([{ channel: 170, energy: 511 }]);
  assert.ok(peak.annihilation);
  assert.ok(!peak.candidates.some((l) => l.nuclide === "Na-22"));
  assert.ok(peak.candidates.some((l) => l.nuclide === "Tl-208")); // Real overlapping gamma line retained.
});
test("one unresolved peak cannot corroborate multiple lines of the same nuclide", () => {
  const lines = [
    { nuclide: "Test", energy: 100 },
    { nuclide: "Test", energy: 101 },
  ];
  const result = matchLines([{ channel: 1, energy: 100.5 }], {}, lines);
  assert.equal(result[0].candidates.length, 1);
  assert.equal(result[0].candidates[0].support, 1);
  const repeated = matchLines(
    [
      { channel: 1, energy: 100 },
      { channel: 10, energy: 100.1 },
    ],
    {},
    [lines[0]],
  );
  assert.ok(repeated.every((p) => p.candidates[0].support === 1));
});
test("absolute and relative tolerance are combined and no matches are invented", () => {
  const lines = [
    { nuclide: "Low", energy: 100 },
    { nuclide: "High", energy: 1000 },
  ];
  const result = matchLines(
    [104, 106, 1019, 1021].map((energy) => ({ energy })),
    {},
    lines,
  );
  assert.deepEqual(
    result.map((p) => p.candidates.length),
    [1, 0, 1, 0],
  );
  assert.equal(result[0].candidates[0].tolerance, 5);
  assert.equal(result[2].candidates[0].tolerance, 20);
});
test("invalid settings are rejected rather than producing stale confident labels", () => {
  for (const settings of [
    { absoluteTolerance: 0 },
    { relativeTolerance: -1 },
    { threshold: Infinity },
    { window: 3.5 },
    { window: 129 },
    { threshold: NaN },
  ])
    assert.throws(() => identificationSettings(settings));
});
test("full-size spectra produce a bounded report of distinct peaks", () => {
  const counts = Array(65536).fill(10);
  for (let i = 40; i < counts.length - 40; i += 100)
    counts[i] = counts[i + 1] = 400;
  const model = {
    hasEnergy: true,
    counts,
    energies: counts.map((_, i) => i * 0.05),
  };
  const peaks = detectPeaks(model);
  assert.equal(peaks.length, 50);
  assert.equal(new Set(peaks.map((p) => p.channel)).size, 50);
});
