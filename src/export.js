import { zipSync, strToU8 } from "fflate";
const xml = (value) =>
  String(value)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
const headers = [
  "Canal",
  "Energía (keV)",
  "Cuentas",
  "Eficiencia (ATS)",
  "Resolución (ATS)",
  "Línea base ROI (cuentas)",
];
export const dataRows = (model) =>
  model.counts.map((count, i) => [
    i,
    model.energies?.[i] ?? null,
    count,
    model.efficiency?.[i] ?? null,
    model.resolution?.[i] ?? null,
    model.analysis && i >= model.analysis.start && i <= model.analysis.end
      ? model.analysis.baseline[i - model.analysis.start]
      : null,
  ]);
export function peakRows(report) {
  return report.peaks.flatMap((peak) => {
    const lines = peak.candidates.length ? peak.candidates : [null];
    const rows = lines.map((line) => [
      peak.channel,
      peak.energy,
      line?.nuclide ?? "Sin coincidencias en catálogo parcial",
      line?.energy ?? null,
      line?.delta ?? null,
      line?.tolerance ?? null,
      line?.support ?? 0,
      "Orientativo; no confirmado",
      line?.emitter ?? "",
      peak.start,
      peak.end,
    ]);
    if (peak.annihilation)
      rows.push([
        peak.channel,
        peak.energy,
        "Posible aniquilación; no identifica radionúclido",
        510.999,
        peak.energy - 510.999,
        null,
        0,
        "Fenómeno compatible, no confirmado",
        "",
        peak.start,
        peak.end,
      ]);
    return rows;
  });
}
export function metadataRows(model) {
  return [
    ["Archivo", model.filename],
    ["Aplicación", "ATS Spectrum Analizer"],
    ["Formato", "ATS; contrastado con una muestra real"],
    ["Canales", model.counts.length],
    ["Origen del canal", 0],
    [
      "Calibración energética",
      model.energies
        ? "Tabla de energía por canal, conservada"
        : "No disponible",
    ],
    ["Validez física de calibración", "No verificada"],
    ...(model.analysis
      ? [
          ["ROI inicio (canal)", model.analysis.start],
          ["ROI fin (canal)", model.analysis.end],
          ["Línea base: método", model.analysis.method],
          ["Ventana de extremos (canales)", model.analysis.edge ?? "Manual"],
          ["Base izquierda (cuentas)", model.analysis.left],
          ["Base derecha (cuentas)", model.analysis.right],
          ["Área bruta (cuentas)", model.analysis.gross],
          ["Área base (cuentas)", model.analysis.background],
          ["Área neta (cuentas)", model.analysis.net],
          [
            "Cálculo",
            "Suma discreta inclusiva por canal; sin recortar áreas negativas",
          ],
        ]
      : []),
    ...(model.identification
      ? [
          ["Búsqueda de radionúclidos", model.identification.status],
          ["Catálogo gamma", model.identification.catalogVersion],
          ["Fuente del catálogo", model.identification.sourceUrl],
          [
            "Tolerancia absoluta (keV)",
            model.identification.settings.absoluteTolerance,
          ],
          [
            "Tolerancia relativa (%)",
            model.identification.settings.relativeTolerance,
          ],
          ["Umbral heurístico", model.identification.settings.threshold],
          ["Semiventana (canales)", model.identification.settings.window],
          [
            "Interpretación",
            "Coincidencias por energía; no confirman identidad, ausencia, actividad ni equilibrio de cadenas",
          ],
        ]
      : []),
    ...model.metadata
      .filter(([, key]) => key.toUpperCase() !== "ATOMTEXSPECTRUM")
      .map(([block, key, value]) => [`${block}${key ? `.${key}` : ""}`, value]),
  ];
}
// Numeric CSV columns only: no source metadata can become an Excel formula.
export function toCsv(model) {
  const format = (value) =>
    value == null ? "" : String(value).replace(".", ",");
  return (
    "\uFEFF" +
    [
      headers.join(";"),
      ...dataRows(model).map((row) => row.map(format).join(";")),
    ].join("\r\n") +
    "\r\n"
  );
}
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const rel =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRel =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const content = "http://schemas.openxmlformats.org/package/2006/content-types";
function worksheet(rows, drawing = false) {
  return `<worksheet xmlns="${main}" xmlns:r="${rel}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="3" width="28" customWidth="1"/></cols><sheetData>${rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((value, c) => {
            if (value == null) return "";
            const address = `${String.fromCharCode(65 + c)}${r + 1}`;
            return typeof value === "number"
              ? `<c r="${address}"><v>${value}</v></c>`
              : `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join(
      "",
    )}</sheetData>${drawing ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;
}
export function toXlsx(model) {
  const last = model.counts.length + 1;
  const hasPeaks = !!model.identification;
  const energy = model.hasEnergy ?? !!model.energies;
  const xcol = energy ? "B" : "A";
  const files = {};
  const put = (path, body) => {
    files[path] = strToU8(declaration + body);
  };
  put(
    "[Content_Types].xml",
    `<Types xmlns="${content}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[
      ["/xl/workbook.xml", "spreadsheetml.sheet.main"],
      ["/xl/worksheets/sheet1.xml", "spreadsheetml.worksheet"],
      ["/xl/worksheets/sheet2.xml", "spreadsheetml.worksheet"],
      ...(hasPeaks
        ? [["/xl/worksheets/sheet3.xml", "spreadsheetml.worksheet"]]
        : []),
      ["/xl/drawings/drawing1.xml", "drawing"],
      ["/xl/charts/chart1.xml", "drawingml.chart"],
    ]
      .map(
        ([path, type]) =>
          `<Override PartName="${path}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`,
      )
      .join("")}</Types>`,
  );
  const relationships = (entries) =>
    `<Relationships xmlns="${packageRel}">${entries.map(([id, type, target]) => `<Relationship Id="${id}" Type="${rel}/${type}" Target="${target}"/>`).join("")}</Relationships>`;
  put(
    "_rels/.rels",
    relationships([["rId1", "officeDocument", "xl/workbook.xml"]]),
  );
  put(
    "xl/workbook.xml",
    `<workbook xmlns="${main}" xmlns:r="${rel}"><sheets><sheet name="Espectro" sheetId="1" r:id="rId1"/><sheet name="Metadatos" sheetId="2" r:id="rId2"/>${hasPeaks ? '<sheet name="Picos" sheetId="3" r:id="rId3"/>' : ""}</sheets></workbook>`,
  );
  put(
    "xl/_rels/workbook.xml.rels",
    relationships([
      ["rId1", "worksheet", "worksheets/sheet1.xml"],
      ["rId2", "worksheet", "worksheets/sheet2.xml"],
      ...(hasPeaks ? [["rId3", "worksheet", "worksheets/sheet3.xml"]] : []),
    ]),
  );
  put(
    "xl/worksheets/sheet1.xml",
    worksheet([headers, ...dataRows(model)], true),
  );
  put(
    "xl/worksheets/sheet2.xml",
    worksheet([["Campo", "Valor"], ...metadataRows(model)]),
  );
  if (hasPeaks)
    put(
      "xl/worksheets/sheet3.xml",
      worksheet([
        [
          "Canal",
          "Energía observada (keV)",
          "Candidato",
          "Energía referencia (keV)",
          "Diferencia (keV)",
          "Tolerancia (keV)",
          "Líneas compatibles",
          "Tipo de resultado",
          "Emisor",
          "ROI inicio",
          "ROI fin",
        ],
        ...peakRows(model.identification),
      ]),
    );
  put(
    "xl/worksheets/_rels/sheet1.xml.rels",
    relationships([["rId1", "drawing", "../drawings/drawing1.xml"]]),
  );
  put(
    "xl/drawings/drawing1.xml",
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>20</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>25</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Espectro gamma"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${rel}" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`,
  );
  put(
    "xl/drawings/_rels/drawing1.xml.rels",
    relationships([["rId1", "chart", "../charts/chart1.xml"]]),
  );
  const cache = (values) =>
    `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("")}</c:numCache>`;
  const title = (text) =>
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xml(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
  const axis = (id, cross, pos, text) =>
    `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${title(text)}<c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
  const roi = model.analysis;
  const baselineSeries = roi
    ? `<c:ser><c:idx val="1"/><c:order val="1"/><c:tx><c:v>Línea base ROI</c:v></c:tx><c:spPr><a:ln w="25400"><a:solidFill><a:srgbClr val="C2782C"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker><c:xVal><c:numRef><c:f>Espectro!$${xcol}$${roi.start + 2}:$${xcol}$${roi.end + 2}</c:f>${cache(model.counts.slice(roi.start, roi.end + 1).map((_, j) => (energy ? model.energies[roi.start + j] : roi.start + j)))}</c:numRef></c:xVal><c:yVal><c:numRef><c:f>Espectro!$F$${roi.start + 2}:$F$${roi.end + 2}</c:f>${cache(roi.baseline)}</c:numRef></c:yVal><c:smooth val="0"/></c:ser>`
    : "";
  put(
    "xl/charts/chart1.xml",
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart>${title("Espectro gamma (datos brutos)")}<c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="line"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Cuentas</c:v></c:tx><c:marker><c:symbol val="none"/></c:marker><c:xVal><c:numRef><c:f>Espectro!$${xcol}$2:$${xcol}$${last}</c:f>${cache(energy ? model.energies : model.counts.map((_, i) => i))}</c:numRef></c:xVal><c:yVal><c:numRef><c:f>Espectro!$C$2:$C$${last}</c:f>${cache(model.counts)}</c:numRef></c:yVal><c:smooth val="0"/></c:ser>${baselineSeries}<c:axId val="1"/><c:axId val="2"/></c:scatterChart>${axis(1, 2, "b", energy ? "Energía (keV)" : "Canal")}${axis(2, 1, "l", "Cuentas")}</c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`,
  );
  return zipSync(files, { level: 6 });
}
