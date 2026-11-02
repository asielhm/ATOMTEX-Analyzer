import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { parseAts, decodeAts } from "../src/parser.js";
import { toCsv, toXlsx, dataRows } from "../src/export.js";
import { analyzeRoi } from "../src/analysis.js";
const sample = parseAts(
  decodeAts(readFileSync(new URL("./fixtures/synthetic.ats", import.meta.url))),
  "synthetic.ats",
);
test("Spanish Excel CSV uses BOM, semicolon, decimal comma and CRLF with every channel", () => {
  const csv = toCsv(sample);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const rows = csv.slice(1).trimEnd().split("\r\n");
  assert.equal(rows.length, 9);
  assert.equal(rows[7], "6;9,36;4;0,7;7;");
  assert.equal(rows[8].split(";")[1], "10,99");
  assert.equal(
    rows
      .slice(1)
      .reduce(
        (sum, row) => sum + Number(row.split(";")[2].replace(",", ".")),
        0,
      ),
    64,
  );
});
test("XLSX contains native scatter chart, numeric cells, metadata, raw calibrations and ROI trace", () => {
  const model = structuredClone(sample);
  model.analysis = analyzeRoi(model, { start: 1, end: 6, left: 2, right: 4 });
  const before = structuredClone(model);
  const files = unzipSync(toXlsx(model));
  const read = (path) => strFromU8(files[path]);
  assert.match(read("xl/workbook.xml"), /name="Espectro"/);
  assert.match(read("xl/workbook.xml"), /name="Metadatos"/);
  const sheet = read("xl/worksheets/sheet1.xml");
  assert.equal((sheet.match(/<row /g) ?? []).length, 9);
  assert.match(sheet, /<c r="B9"><v>10.99<\/v><\/c>/);
  assert.match(sheet, /<c r="C2"><v>0<\/v><\/c>/);
  assert.match(sheet, /<c r="F3"><v>2<\/v><\/c>/);
  assert.match(read("xl/worksheets/sheet2.xml"), /Área neta/);
  assert.match(read("xl/charts/chart1.xml"), /<c:scatterChart>/);
  assert.match(read("xl/charts/chart1.xml"), /Espectro!\$B\$2:\$B\$9/);
  assert.match(
    read("xl/drawings/_rels/drawing1.xml.rels"),
    /..\/charts\/chart1.xml/,
  );
  assert.equal(
    (read("xl/charts/chart1.xml").match(/<c:ser>/g) ?? []).length,
    2,
  );
  assert.match(read("xl/charts/chart1.xml"), /Espectro!\$F\$3:\$F\$8/);
  assert.deepEqual(model, before);
});
test("untrusted metadata stays literal XML text, never formulas; absent energy stays blank", () => {
  const m = parseAts(
    'SPECTR = 2\n0\n5\nREMARK = =HYPERLINK("evil") < & >',
    "x<&.ats",
  );
  const files = unzipSync(toXlsx(m));
  const metadata = strFromU8(files["xl/worksheets/sheet2.xml"]);
  assert.match(metadata, /=HYPERLINK\(&quot;evil&quot;\) &lt; &amp; &gt;/);
  assert.doesNotMatch(metadata, /<f>/);
  assert.match(
    strFromU8(files["xl/charts/chart1.xml"]),
    /Espectro!\$A\$2:\$A\$3/,
  );
  assert.equal(dataRows(m)[0][1], null);
  assert.match(toCsv(m), /0;;0;;;/);
});
