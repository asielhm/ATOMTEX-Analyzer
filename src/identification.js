import catalog from "./data/gamma-lines.json" with { type: "json" };
export { catalog };
export const DEFAULT_IDENTIFICATION = Object.freeze({
  absoluteTolerance: 5,
  relativeTolerance: 2,
  threshold: 4,
  window: 16,
});
export function identificationSettings(input = {}) {
  const settings = { ...DEFAULT_IDENTIFICATION, ...input };
  for (const [key, min, max, integer] of [
    ["absoluteTolerance", 0.1, 100, false],
    ["relativeTolerance", 0, 10, false],
    ["threshold", 1, 20, false],
    ["window", 3, 128, true],
  ])
    if (
      !Number.isFinite(settings[key]) ||
      settings[key] < min ||
      settings[key] > max ||
      (integer && !Number.isInteger(settings[key]))
    )
      throw new Error(
        `Parámetro ${key}: se requiere ${integer ? "un entero" : "un número"} entre ${min} y ${max}.`,
      );
  return settings;
}
/** Heuristic peak search on a separate smoothed copy; raw counts never change. */
export function detectPeaks(model, settings = {}) {
  const { threshold, window } = identificationSettings(settings);
  const { counts, energies } = model;
  if (!model.hasEnergy || !energies || counts.length < 7) return [];
  const n = counts.length;
  const smooth = counts.map((_, i) => {
    let total = 0,
      weight = 0;
    for (let k = -2; k <= 2; k++)
      if (i + k >= 0 && i + k < n) {
        const w = 3 - Math.abs(k);
        total += counts[i + k] * w;
        weight += w;
      }
    return total / weight;
  });
  const found = [];
  for (let i = 2; i < n - 2; i++) {
    if (!(smooth[i] >= smooth[i - 1] && smooth[i] > smooth[i + 1])) continue;
    let left = i,
      right = i;
    for (let j = Math.max(0, i - window); j < i; j++)
      if (smooth[j] < smooth[left]) left = j;
    for (let j = i + 1; j <= Math.min(n - 1, i + window); j++)
      if (smooth[j] < smooth[right]) right = j;
    if (left === i || right === i) continue;
    const background = Math.max(smooth[left], smooth[right]);
    const prominence = smooth[i] - background;
    if (prominence < Math.max(5, threshold * Math.sqrt(background + 1)))
      continue;
    const half = background + prominence / 2;
    let a = i,
      b = i;
    while (a > left && smooth[a - 1] >= half) a--;
    while (b < right && smooth[b + 1] >= half) b++;
    let sum = 0,
      centroid = 0;
    for (let j = a; j <= b; j++) {
      const w = Math.max(0, smooth[j] - background);
      sum += w;
      centroid += w * energies[j];
    }
    const energy = centroid / sum;
    if (!Number.isFinite(energy) || energy <= 0) continue;
    found.push({
      channel: i,
      energy,
      start: left,
      end: right,
      prominence,
      widthChannels: b - a + 1,
    });
  }
  const kept = [];
  for (const peak of found.sort((a, b) => b.prominence - a.prominence)) {
    if (
      kept.some(
        (other) =>
          Math.abs(other.channel - peak.channel) <=
          Math.max(2, Math.min(other.widthChannels, peak.widthChannels) / 2),
      )
    )
      continue;
    kept.push(peak);
    if (kept.length === 50) break;
  }
  return kept.sort((a, b) => a.energy - b.energy);
}
export function matchLines(peaks, settings = {}, lines = catalog.lines) {
  const { absoluteTolerance, relativeTolerance } =
    identificationSettings(settings);
  const result = peaks.map((peak) => ({
    ...peak,
    candidates: lines
      .map((line) => ({
        ...line,
        delta: peak.energy - line.energy,
        tolerance: Math.max(
          absoluteTolerance,
          (line.energy * relativeTolerance) / 100,
        ),
      }))
      .filter((line) => Math.abs(line.delta) <= line.tolerance),
    // 511 keV is not a nuclide fingerprint. Real nearby gamma lines remain listed.
    annihilation:
      Math.abs(peak.energy - 510.999) <=
      Math.max(absoluteTolerance, (510.999 * relativeTolerance) / 100),
  }));
  const support = new Map();
  const pairs = result
    .flatMap((peak, index) => peak.candidates.map((line) => ({ index, line })))
    .sort(
      (a, b) =>
        Math.abs(a.line.delta) / a.line.tolerance -
        Math.abs(b.line.delta) / b.line.tolerance,
    );
  // Never count a single unresolved peak as two independent lines of one nuclide.
  for (const { index, line } of pairs) {
    if (!support.has(line.nuclide))
      support.set(line.nuclide, { peaks: new Set(), lines: new Set() });
    const item = support.get(line.nuclide);
    if (item.peaks.has(index) || item.lines.has(line.energy)) continue;
    item.peaks.add(index);
    item.lines.add(line.energy);
  }
  for (const peak of result) {
    const best = new Map();
    for (const line of peak.candidates)
      if (
        !best.has(line.nuclide) ||
        Math.abs(line.delta) < Math.abs(best.get(line.nuclide).delta)
      )
        best.set(line.nuclide, line);
    peak.candidates = [...best.values()]
      .map((line) => ({
        ...line,
        support: support.get(line.nuclide).lines.size,
      }))
      .sort(
        (a, b) =>
          Math.abs(a.delta) / a.tolerance - Math.abs(b.delta) / b.tolerance ||
          b.support - a.support,
      );
  }
  return result;
}
export function identifySpectrum(model, input = {}) {
  const settings = identificationSettings(input);
  const available = !!model.hasEnergy;
  return {
    available,
    settings,
    catalogVersion: catalog.version,
    sourceUrl: catalog.sourceUrl,
    status: available
      ? "Candidatos orientativos por energía; identificación no confirmada."
      : "Sin calibración energética utilizable: no se asignan radionúclidos.",
    peaks: available ? matchLines(detectPeaks(model, settings), settings) : [],
  };
}
