// ATS text layout verified against the user-provided ejemplo_123.ats.
export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_CHANNELS = 65536;
export class AtsError extends Error {}
const fail = (message) => {
  throw new AtsError(message);
};
const numeric = (token, label) => {
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(token))
    fail(`${label}: número inválido «${token.slice(0, 40)}».`);
  const value = Number(token.replace(",", "."));
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
    fail(`${label}: número fuera de rango seguro.`);
  return value;
};
export function decodeAts(buffer) {
  if (buffer.byteLength > MAX_BYTES)
    fail("El archivo supera el límite de 8 MiB.");
  try {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xff && bytes[1] === 0xfe)
      return new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff)
      return new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(
      "Codificación incompatible. Se admite UTF-8 o UTF-16 con BOM; no se interpretan archivos binarios.",
    );
  }
}
export function parseAts(text, filename = "") {
  if (typeof text !== "string" || !text.trim()) fail("El archivo está vacío.");
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    fail("El archivo supera el límite de 8 MiB.");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
    fail("Contenido binario o caracteres de control incompatibles.");
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const arrays = {},
    metadata = [],
    fields = new Map();
  const blockNames = new Set([
    "SPECTR",
    "ECALIBRATION",
    "EFFCALIBRATION",
    "RCALIBRATION",
  ]);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const match = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match)
      fail(`Línea ${i + 1}: se esperaba CAMPO = valor o BLOQUE = longitud.`);
    const key = match[1].toUpperCase(),
      value = match[2].trim();
    if (fields.has(key))
      fail(`Campo o bloque ${key} repetido (línea ${i + 1}).`);
    fields.set(key, value);
    if (!blockNames.has(key)) {
      metadata.push(["ATS", key, value]);
      continue;
    }
    if (!/^\d+$/.test(value)) fail(`${key}: longitud inválida.`);
    const length = Number(value);
    if (!Number.isSafeInteger(length) || length < 1 || length > MAX_CHANNELS)
      fail(`${key}: cantidad de canales inválida (1–${MAX_CHANNELS}).`);
    if (i + length >= lines.length)
      fail(`${key}: bloque incompleto; se esperaban ${length} valores.`);
    arrays[key] = [];
    for (let j = 0; j < length; j++) {
      const token = lines[++i].trim();
      arrays[key].push(numeric(token, `${key}, canal ${j}`));
    }
  }
  if (!arrays.SPECTR) fail("Falta el bloque SPECTR.");
  const counts = arrays.SPECTR;
  if (counts.some((n) => n < 0))
    fail(
      "SPECTR contiene cuentas negativas. Este lector admite espectros de cuentas no negativas.",
    );
  for (const [key, values] of Object.entries(arrays)) {
    if (values.length !== counts.length)
      fail(
        `Longitud de ${key}: ${values.length}; SPECTR tiene ${counts.length} canales.`,
      );
  }
  const energies = arrays.ECALIBRATION ?? null;
  if (
    energies &&
    energies.some((e, i) => e < 0 || (i > 0 && e < energies[i - 1]))
  )
    fail("ECALIBRATION debe contener energías no negativas y no decrecientes.");
  const hasEnergy = energies?.some((e) => e > 0);
  const warnings = [
    "Lectura contrastada con ejemplo_123.ats; la validez física de la calibración no se verifica.",
  ];
  if (!hasEnergy)
    warnings.push(
      "Sin calibración energética utilizable: se muestran canales; se preservan los valores disponibles.",
    );
  if (hasEnergy && energies.some((e, i) => i > 0 && e === energies[i - 1]))
    warnings.push(
      "Hay energías repetidas (incluidos ceros iniciales); se conservan sin interpolar. Las ROI se definen por canal.",
    );
  return {
    filename,
    counts,
    energies,
    hasEnergy: !!hasEnergy,
    efficiency: arrays.EFFCALIBRATION ?? null,
    resolution: arrays.RCALIBRATION ?? null,
    metadata,
    warnings,
  };
}
