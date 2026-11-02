import Chart from "chart.js/auto";
import zoomPlugin from "chartjs-plugin-zoom";
import { decodeAts, parseAts, MAX_BYTES } from "./parser.js";
import { toCsv, toXlsx, metadataRows } from "./export.js";
import { analyzeRoi } from "./analysis.js";
import "./style.css";
Chart.register(zoomPlugin);
const $ = (id) => document.getElementById(id);
let model,
  chart,
  generation = 0,
  pickMode = null,
  picks = [];
function setPick(mode) {
  pickMode = mode;
  picks = [];
  $("pick-roi").setAttribute("aria-pressed", String(mode === "roi"));
  $("pick-base").setAttribute("aria-pressed", String(mode === "base"));
  if (chart) {
    chart.options.plugins.zoom.pan.enabled = !mode;
    chart.update("none");
  }
  $("chart").style.cursor = mode ? "crosshair" : "default";
  if (mode)
    $("roi-status").textContent =
      mode === "roi"
        ? "Hacé dos clics para marcar los canales límite."
        : "Hacé dos clics: el primero fija la altura izquierda y el segundo la derecha de la ROI actual.";
}
function resetAnalysis() {
  if (model) delete model.analysis;
  $("roi-values").hidden = true;
  $("focus-roi").disabled = true;
  $("roi-status").textContent =
    "Sin ROI aplicada. Volvé a calcular después de editar los parámetros.";
}
function applyAnalysis() {
  if (!model) return;
  $("error").hidden = true;
  try {
    const read = (id) =>
      $(id).value.trim() === "" ? NaN : Number($(id).value);
    model.analysis = analyzeRoi(model, {
      start: read("roi-start"),
      end: read("roi-end"),
      left: read("base-left"),
      right: read("base-right"),
      method: $("baseline-method").value,
      edge: read("edge"),
    });
    const result = model.analysis;
    $("base-left").value = result.left;
    $("base-right").value = result.right;
    for (const id of ["gross", "background", "net"])
      $(id).textContent = fmt(result[id]);
    $("roi-values").hidden = false;
    $("focus-roi").disabled = false;
    $("roi-status").textContent =
      `ROI aplicada: canales ${result.start}–${result.end} (inclusive). Línea base ${result.method === "manual" ? "manual" : result.method === "linear" ? "lineal" : "constante"}.`;
    setPick(null);
    renderChart(true);
  } catch (error) {
    resetAnalysis();
    renderChart(true);
    message(error.message);
  }
}
const fmt = (value) =>
  value.toLocaleString("es-AR", { maximumFractionDigits: 8 });
function message(error) {
  $("error").textContent = error;
  $("error").hidden = false;
}
function cell(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function renderChart(preserveView = false) {
  const view =
    preserveView && chart
      ? { min: chart.scales.x.min, max: chart.scales.x.max }
      : {};
  chart?.destroy();
  const energy = $("axis").value === "energy";
  const logarithmic = $("scale").value === "logarithmic";
  const analysis = model.analysis;
  const datasets = [
    {
      label: "Cuentas",
      data: model.counts.map((count, i) => ({
        x: energy ? model.energies[i] : i,
        y: logarithmic && count === 0 ? null : count,
      })),
      borderColor: "#137b70",
      borderWidth: 1.5,
      pointRadius: model.counts.length === 1 ? 4 : 0,
      pointHitRadius: 8,
      spanGaps: false,
    },
  ];
  if (analysis) {
    const points = (values) =>
      values.map((value, j) => ({
        x: energy ? model.energies[analysis.start + j] : analysis.start + j,
        y: logarithmic && value <= 0 ? null : value,
      }));
    datasets.push({
      label: "Línea base",
      data: points(analysis.baseline),
      borderColor: "#c2782c",
      borderWidth: 2,
      pointRadius: 0,
    });
    datasets.push({
      label: "ROI",
      data: points(model.counts.slice(analysis.start, analysis.end + 1)),
      borderColor: "#137b70",
      backgroundColor: "#137b7025",
      fill: { target: 1 },
      pointRadius: 0,
      borderWidth: 1,
    });
  }
  chart = new Chart($("chart"), {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: false,
      onClick: onChartClick,
      interaction: { intersect: false, mode: "nearest", axis: "x" },
      scales: {
        x: {
          type: "linear",
          ...view,
          title: { display: true, text: energy ? "Energía (keV)" : "Canal" },
        },
        y: {
          type: logarithmic ? "logarithmic" : "linear",
          min: logarithmic ? 0.1 : 0,
          title: { display: true, text: "Cuentas" },
        },
      },
      plugins: {
        legend: { display: !!analysis },
        tooltip: {
          callbacks: {
            title: (items) =>
              `Canal ${items[0].dataIndex + (items[0].datasetIndex ? analysis.start : 0)}`,
            label: (item) => {
              const i =
                item.dataIndex + (item.datasetIndex ? analysis.start : 0);
              return [
                `${item.dataset.label}: ${fmt(item.parsed.y)}`,
                `Energía: ${model.energies ? fmt(model.energies[i]) + " keV" : "No disponible"}`,
              ];
            },
          },
        },
        zoom: {
          pan: { enabled: !pickMode, mode: "x" },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "x",
          },
        },
      },
    },
  });
}
async function load(files) {
  const ticket = ++generation;
  model = null;
  chart?.destroy();
  chart = null;
  setPick(null);
  $("results").hidden = true;
  document.querySelector("main").classList.remove("has-spectrum");
  $("error").hidden = true;
  $("status").textContent = "";
  try {
    if (files.length !== 1) throw new Error("Seleccioná un único archivo ATS.");
    const file = files[0];
    if (!/\.ats$/i.test(file.name))
      throw new Error("El archivo debe tener extensión .ats.");
    if (file.size > MAX_BYTES)
      throw new Error("El archivo supera el límite de 8 MiB.");
    $("status").textContent = "Leyendo archivo local…";
    const text = decodeAts(await file.arrayBuffer());
    if (ticket !== generation) return;
    model = parseAts(text, file.name);
    $("filename").textContent = file.name;
    $("channels").textContent = fmt(model.counts.length);
    $("total").textContent = fmt(model.counts.reduce((sum, n) => sum + n, 0));
    $("calibration").textContent = model.hasEnergy
      ? "Leída · No verificada"
      : "No disponible";
    $("axis").value = model.hasEnergy ? "energy" : "channel";
    $("axis").querySelector('[value="energy"]').disabled = !model.hasEnergy;
    $("scale").value = "linear";
    setPick(null);
    resetAnalysis();
    $("roi-start").value = 0;
    $("roi-end").value = Math.min(100, model.counts.length - 1);
    $("roi-start").max = $("roi-end").max = model.counts.length - 1;
    $("warnings").replaceChildren(...model.warnings.map((w) => cell("li", w)));
    $("rows").replaceChildren(
      ...model.counts.slice(0, 100).map((count, i) => {
        const tr = document.createElement("tr");
        tr.append(
          ...[i, model.energies?.[i] ?? "—", count].map((v) =>
            cell("td", typeof v === "number" ? fmt(v) : v),
          ),
        );
        return tr;
      }),
    );
    $("metadata").replaceChildren(
      ...metadataRows(model).flatMap(([key, value]) => [
        cell("dt", key),
        cell("dd", value),
      ]),
    );
    $("results").hidden = false;
    document.querySelector("main").classList.add("has-spectrum");
    renderChart();
    $("status").textContent =
      "Archivo ATS leído localmente. Datos listos para analizar y exportar.";
  } catch (error) {
    if (ticket !== generation) return;
    model = null;
    $("results").hidden = true;
    $("status").textContent = "";
    message(error.message);
  }
}
$("file").addEventListener("change", (event) => {
  if (event.target.files.length) void load(event.target.files);
  event.target.value = "";
});
for (const type of ["dragenter", "dragover"])
  $("drop").addEventListener(type, (event) => {
    event.preventDefault();
    $("drop").classList.add("drag");
  });
for (const type of ["dragleave", "drop"])
  $("drop").addEventListener(type, (event) => {
    event.preventDefault();
    $("drop").classList.remove("drag");
  });
$("drop").addEventListener(
  "drop",
  (event) => void load(event.dataTransfer.files),
);
// Avoid accidental navigation when a file is dropped outside the target.
for (const type of ["dragover", "drop"])
  window.addEventListener(type, (event) => event.preventDefault());
$("axis").addEventListener("change", renderChart);
$("scale").addEventListener("change", renderChart);
$("reset").addEventListener("click", () => chart?.resetZoom());
$("zoom-in").addEventListener("click", () => chart?.zoom(1.3));
$("zoom-out").addEventListener("click", () => chart?.zoom(0.7));
function download(kind) {
  if (!model) return;
  try {
    const content = kind === "csv" ? toCsv(model) : toXlsx(model);
    const url = URL.createObjectURL(
      new Blob([content], {
        type:
          kind === "csv"
            ? "text/csv;charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${model.filename.replace(/\.ats$/i, "")}.${kind}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("status").textContent =
      `Exportación ${kind.toUpperCase()} generada con todos los canales.`;
  } catch (error) {
    message(`No se pudo exportar: ${error.message}`);
  }
}
$("csv").addEventListener("click", () => download("csv"));
$("xlsx").addEventListener("click", () => download("xlsx"));

function onChartClick(event) {
  if (!pickMode || !model || !chart) return;
  const { left, right, top, bottom } = chart.chartArea;
  if (event.x < left || event.x > right || event.y < top || event.y > bottom)
    return;
  if (pickMode === "roi") {
    const x = chart.scales.x.getValueForPixel(event.x);
    const values =
      $("axis").value === "energy"
        ? model.energies
        : model.counts.map((_, i) => i);
    let nearest = 0;
    for (let i = 1; i < values.length; i++)
      if (Math.abs(values[i] - x) < Math.abs(values[nearest] - x)) nearest = i;
    picks.push(nearest);
    $("roi-status").textContent =
      `Primer límite: canal ${nearest}. Elegí el segundo.`;
    if (picks.length === 2) {
      const [start, end] = picks.toSorted((a, b) => a - b);
      $("roi-start").value = start;
      $("roi-end").value = end;
      if ($("baseline-method").value === "manual") {
        $("base-left").value = model.counts[start];
        $("base-right").value = model.counts[end];
      }
      applyAnalysis();
    }
  } else {
    picks.push(Math.max(0, chart.scales.y.getValueForPixel(event.y)));
    $("roi-status").textContent =
      "Altura izquierda marcada. Elegí la altura derecha.";
    if (picks.length === 2) {
      $("baseline-method").value = "manual";
      updateMethod();
      $("base-left").value = picks[0];
      $("base-right").value = picks[1];
      applyAnalysis();
    }
  }
}
function updateMethod() {
  const manual = $("baseline-method").value === "manual";
  $("base-left").disabled = $("base-right").disabled = !manual;
  $("edge").disabled = manual;
}
$("analyze").addEventListener("click", applyAnalysis);
$("pick-roi").addEventListener("click", () =>
  setPick(pickMode === "roi" ? null : "roi"),
);
$("pick-base").addEventListener("click", () =>
  setPick(pickMode === "base" ? null : "base"),
);
$("clear-roi").addEventListener("click", () => {
  setPick(null);
  resetAnalysis();
  renderChart(true);
});
for (const id of [
  "roi-start",
  "roi-end",
  "base-left",
  "base-right",
  "edge",
  "baseline-method",
])
  $(id).addEventListener("input", () => {
    setPick(null);
    updateMethod();
    resetAnalysis();
    renderChart(true);
  });

$("focus-roi").addEventListener("click", () => {
  if (!model?.analysis || !chart) return;
  const { start, end } = model.analysis;
  const x = (i) => ($("axis").value === "energy" ? model.energies[i] : i);
  const padding = Math.max((x(end) - x(start)) * 0.1, 0.5);
  chart.zoomScale("x", {
    min: Math.max(0, x(start) - padding),
    max: x(end) + padding,
  });
});
