// Explicitly local integration test. Do not put actual measurement files in Git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { decodeAts, parseAts } from "../src/parser.js";
import { toCsv, toXlsx } from "../src/export.js";
const path = process.env.ATS_SAMPLE_PATH;
if (!path)
  throw new Error(
    "Definí ATS_SAMPLE_PATH con la ruta de un ATS privado fuera del repositorio.",
  );
test("private instrument sample: all declared block values survive parsing and XLSX/CSV export", () => {
  const text = decodeAts(readFileSync(path));
  const model = parseAts(text, basename(path));
  const files = unzipSync(toXlsx(model));
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  for (const [key, field, column] of [
    ["SPECTR", "counts", "C"],
    ["ECALIBRATION", "energies", "B"],
    ["EFFCALIBRATION", "efficiency", "D"],
    ["RCALIBRATION", "resolution", "E"],
  ]) {
    // Independent block extraction from the source; comparisons cover every value.
    const match = new RegExp(`^${key}\\s*=\\s*(\\d+)[ \\t]*\\r?\\n`, "m").exec(
      text,
    );
    if (!match) {
      assert.equal(model[field], null);
      continue;
    }
    const size = Number(match[1]);
    const values = text
      .slice(match.index + match[0].length)
      .split(/\r?\n/)
      .slice(0, size)
      .map((v) => Number(v.trim().replace(",", ".")));
    assert.equal(values.length, size);
    assert.deepEqual(model[field], values);
    values.forEach((value, i) => {
      const cell = new RegExp(
        `<c r="${column}${i + 2}"><v>([^<]+)</v></c>`,
      ).exec(sheet);
      assert.ok(cell, `${key} cell ${i}`);
      assert.equal(Number(cell[1]), value);
    });
  }
  const csv = toCsv(model).slice(1).trimEnd().split("\r\n").slice(1);
  assert.equal(csv.length, model.counts.length);
  csv.forEach((row, i) =>
    assert.equal(Number(row.split(";")[2].replace(",", ".")), model.counts[i]),
  );
});
