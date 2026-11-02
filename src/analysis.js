/** Discrete ROI integration in counts, always inclusive and indexed by channel. */
export function analyzeRoi(
  model,
  { start, end, left, right, method = "manual", edge = 3 },
) {
  if (
    ![start, end].every(Number.isInteger) ||
    start < 0 ||
    end >= model.counts.length ||
    start >= end
  )
    throw new Error(
      "La ROI requiere dos canales distintos dentro del espectro, en orden creciente.",
    );
  if (!["manual", "linear", "constant"].includes(method))
    throw new Error("Método de línea base desconocido.");
  if (method !== "manual") {
    if (
      !Number.isInteger(edge) ||
      edge < 1 ||
      edge > Math.floor((end - start + 1) / 2)
    )
      throw new Error(
        "La ventana de extremos debe ser un entero entre 1 y la mitad de los canales de la ROI.",
      );
    const mean = (values) => values.reduce((s, n) => s + n, 0) / values.length;
    left = mean(model.counts.slice(start, start + edge));
    right = mean(model.counts.slice(end - edge + 1, end + 1));
    if (method === "constant") left = right = (left + right) / 2;
  }
  if (
    ![left, right].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER,
    )
  )
    throw new Error("La línea base requiere alturas finitas y no negativas.");
  const baseline = Array.from(
    { length: end - start + 1 },
    (_, i) => left + ((right - left) * i) / (end - start),
  );
  const gross = model.counts
    .slice(start, end + 1)
    .reduce((sum, n) => sum + n, 0);
  const background = baseline.reduce((sum, n) => sum + n, 0);
  return {
    start,
    end,
    left,
    right,
    method,
    edge: method === "manual" ? null : edge,
    baseline,
    gross,
    background,
    net: gross - background,
  };
}
