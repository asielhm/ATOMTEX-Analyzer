import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAts, decodeAts, MAX_CHANNELS } from "../src/parser.js";
const sample = readFileSync(
  new URL("./fixtures/synthetic.ats", import.meta.url),
);
const spectrum = (counts) =>
  `ATOMTEXSPECTRUM =\nSPECTR = ${counts.length}\n${counts.join("\n")}\n`;
test("synthetic ATS: all blocks and metadata preserved", () => {
  const model = parseAts(decodeAts(sample), "synthetic.ats");
  assert.deepEqual(model.counts, [0, 2, 4, 12, 30, 12, 4, 0]);
  assert.deepEqual(
    model.energies,
    [0, 1.51, 3.04, 4.59, 6.16, 7.75, 9.36, 10.99],
  );
  assert.deepEqual(model.efficiency, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
  assert.deepEqual(model.resolution, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(
    model.metadata.some(([, key, value]) => key === "TIME" && value === "60"),
  );
});
test("repeated calibrated energies are retained, not interpolated", () => {
  const model = parseAts(
    spectrum([1, 2, 3, 4]) + "ECALIBRATION = 4\n0\n0\n1\n2",
  );
  assert.deepEqual(model.energies, [0, 0, 1, 2]);
  assert.ok(model.hasEnergy);
  assert.ok(model.warnings.some((w) => w.includes("repetidas")));
});
test("decimal commas, scientific notation, BOM and CRLF, counts are not rounded", () => {
  const m = parseAts(
    "\uFEFFATOMTEXSPECTRUM =\r\nSPECTR = 3\r\n1,5\r\n2e1\r\n0\r\n",
  );
  assert.deepEqual(m.counts, [1.5, 20, 0]);
  assert.equal(m.energies, null);
  assert.equal(m.efficiency, null);
});
test("UTF-16LE BOM is decoded; invalid UTF-8 rejected", () => {
  const source = spectrum([1, 2]);
  assert.equal(
    decodeAts(
      Buffer.concat([Buffer.from([255, 254]), Buffer.from(source, "utf16le")]),
    ),
    source,
  );
  assert.throws(() => decodeAts(new Uint8Array([0xff, 0x88])), /Codificación/);
});
test("missing, duplicate, truncated, wrong-length and malformed data are rejected", () => {
  const cases = [
    ["", /vacío/],
    ["TIME = 10", /Falta/],
    ["SPECTR = 0", /cantidad/],
    [`SPECTR = ${MAX_CHANNELS + 1}`, /cantidad/],
    ["SPECTR = nope", /longitud/],
    ["SPECTR = 2\n1", /incompleto/],
    ["SPECTR = 2\n1\nTIME = 10", /número inválido/],
    ["SPECTR = 1\n2\nSPECTR = 1\n3", /repetido/],
    [spectrum([1, 2]) + "ECALIBRATION = 1\n1", /Longitud/],
    [spectrum([1]) + "EFFCALIBRATION = 2\n0\n0", /Longitud/],
    [spectrum([1]) + "RCALIBRATION = 2\n0\n0", /Longitud/],
    [spectrum(["NaN"]), /inválido/],
    [spectrum(["Infinity"]), /inválido/],
    [spectrum(["1e400"]), /rango/],
    [spectrum(["9007199254740992"]), /rango/],
    [spectrum([-1]), /negativas/],
    [spectrum([1]) + "trailing garbage", /Línea/],
    [spectrum([1, 2]) + "ECALIBRATION = 2\n2\n1", /no decrecientes/],
    [spectrum([1]) + "ECALIBRATION = 1\n-1", /no negativas/],
    ["SPECTR = 1\n\x00", /binario/],
    ["TIME = 1\nTIME = 2\n" + spectrum([1]), /repetido/],
  ];
  for (const [source, expected] of cases)
    assert.throws(() => parseAts(source), expected, source.slice(0, 60));
});
test("zero calibration is preserved but not offered as an energy axis", () => {
  const model = parseAts(spectrum([2, 3]) + "ECALIBRATION = 2\n0\n0");
  assert.deepEqual(model.energies, [0, 0]);
  assert.equal(model.hasEnergy, false);
});
test("maximum supported channel count and file size are enforced", () => {
  assert.equal(
    parseAts(spectrum(Array(MAX_CHANNELS).fill(0))).counts.length,
    MAX_CHANNELS,
  );
  assert.throws(() => decodeAts(new Uint8Array(8 * 1024 * 1024 + 1)), /8 MiB/);
});
