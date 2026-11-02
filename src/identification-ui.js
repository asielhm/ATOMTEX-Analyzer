import { catalog, identifySpectrum } from "./identification.js";
const $ = (id) => document.getElementById(id);
const fmt = (value) =>
  value.toLocaleString("es-AR", { maximumFractionDigits: 3 });
export function createIdentificationPanel({ getModel, onSelect, onUpdate }) {
  let timer;
  $("catalog-info").textContent =
    `${catalog.nuclideCount} radionúclidos · ${catalog.lines.length} líneas gamma · Catálogo parcial`;
  $("catalog-source").href = catalog.sourceUrl;
  function run({ autoSelect = false } = {}) {
    clearTimeout(timer);
    const model = getModel();
    if (!model) return;
    $("peak-rows").replaceChildren();
    try {
      const read = (id) =>
        $(id).value.trim() === "" ? NaN : Number($(id).value);
      const report = identifySpectrum(model, {
        absoluteTolerance: read("id-tolerance"),
        relativeTolerance: read("id-relative"),
        threshold: read("id-threshold"),
        window: read("id-window"),
      });
      model.identification = report;
      $("identification-status").textContent = !report.available
        ? report.status
        : report.peaks.length
          ? `${report.peaks.length} picos detectados. Candidatos por proximidad energética; no son identificaciones confirmadas.`
          : "No se detectaron picos con estos parámetros. Esto no demuestra ausencia de radionúclidos.";
      for (const peak of report.peaks) {
        const tr = document.createElement("tr");
        const td = (text) => {
          const el = document.createElement("td");
          el.textContent = text;
          tr.append(el);
          return el;
        };
        td(peak.channel);
        td(fmt(peak.energy));
        const candidates = td("");
        candidates.className = "candidate-lines";
        if (peak.annihilation) {
          const note = document.createElement("p");
          note.textContent =
            "≈511 keV: posible aniquilación; no identifica un radionúclido por sí sola.";
          candidates.append(note);
        }
        if (!peak.candidates.length) {
          const p = document.createElement("p");
          p.textContent = "Sin coincidencias en este catálogo parcial.";
          candidates.append(p);
        }
        for (const line of peak.candidates) {
          const p = document.createElement("p");
          const strong = document.createElement("strong");
          strong.textContent = `${line.nuclide} ?`;
          p.append(
            strong,
            ` · ${fmt(line.energy)} keV · Δ ${fmt(line.delta)} keV · tolerancia ±${fmt(line.tolerance)} keV · ${line.support} línea(s) compatible(s)`,
          );
          if (line.emitter !== line.nuclide)
            p.append(` · emisor ${line.emitter}`);
          candidates.append(p);
        }
        const button = document.createElement("button");
        button.textContent = "Analizar pico";
        button.setAttribute(
          "aria-label",
          `Analizar pico de ${fmt(peak.energy)} keV`,
        );
        button.addEventListener("click", () => onSelect(peak));
        td("").append(button);
        $("peak-rows").append(tr);
      }
      onUpdate(report);
      if (autoSelect && $("auto-peak-roi").checked && report.peaks.length) {
        const strongest = report.peaks.reduce((best, p) =>
          p.prominence > best.prominence ? p : best,
        );
        onSelect(strongest);
      }
    } catch (error) {
      delete model.identification;
      $("identification-status").textContent =
        `Análisis automático no aplicado: ${error.message}`;
      onUpdate(null);
    }
  }
  $("reidentify").addEventListener("click", () => run());
  for (const id of ["id-tolerance", "id-relative", "id-threshold", "id-window"])
    $(id).addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => run(), 250);
    });
  return { run };
}
export const peakMarkers = (getModel) => ({
  id: "nuclidePeakMarkers",
  afterDatasetsDraw(chart) {
    const model = getModel();
    if (!model?.identification?.available) return;
    const peaks = model.identification.peaks;
    const labelled = [...peaks]
      .sort((a, b) => b.prominence - a.prominence)
      .slice(0, 8);
    const { ctx, chartArea, scales } = chart;
    ctx.save();
    ctx.fillStyle = "#6851a1";
    ctx.strokeStyle = "#6851a1";
    ctx.font = "11px sans-serif";
    const boxes = [];
    for (const peak of peaks) {
      const energy = $("axis").value === "energy";
      const x = scales.x.getPixelForValue(
          energy ? model.energies[peak.channel] : peak.channel,
        ),
        y = scales.y.getPixelForValue(model.counts[peak.channel]);
      if (
        x < chartArea.left ||
        x > chartArea.right ||
        y < chartArea.top ||
        y > chartArea.bottom
      )
        continue;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
      if (!labelled.includes(peak)) continue;
      const label = peak.candidates[0]
        ? `${peak.candidates[0].nuclide} ?`
        : peak.annihilation
          ? "≈511 keV ?"
          : `${Math.round(peak.energy)} keV`;
      const width = ctx.measureText(label).width,
        lx = Math.max(chartArea.left, Math.min(x + 6, chartArea.right - width)),
        ly = Math.max(chartArea.top + 13, y - 10);
      if (
        boxes.some(
          (box) =>
            Math.abs(box.y - ly) < 15 &&
            lx < box.x + box.width &&
            lx + width > box.x,
        )
      )
        continue;
      ctx.fillText(label, lx, ly);
      boxes.push({ x: lx, y: ly, width });
    }
    ctx.restore();
  },
});
