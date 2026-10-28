import { normalizeSeed, piLength, piProgress } from "./pi.js";
import { FIELDS, OPTIONS } from "./traits.js";
import { outlineDistance } from "./geometry.js";
export { FIELDS };
export const CATEGORY_OPTIONS = OPTIONS;
export const recordID = (r) =>
  `${r.generatorVersion ?? r.identity.generatorVersion ?? Number(r.identity.version.slice(1))}:${r.identity.seed}`;
export function validRecord(r) {
  try {
    const version =
      r.generatorVersion ??
      r.identity.generatorVersion ??
      Number(r.identity.version.slice(1));
    if (
      ![1, 2].includes(version) ||
      normalizeSeed(r.identity.seed, version) !== r.identity.seed ||
      ![2, 3].includes(r.schemaVersion)
    )
      return false;
    if (
      r.identity.version !== `v${version}` ||
      (r.identity.generatorVersion !== undefined &&
        r.identity.generatorVersion !== version)
    )
      return false;
    if (r.kind === "pi-path")
      return (
        version === 2 &&
        r.pi &&
        piLength(r.identity.seed) === r.pi.m &&
        r.pi.t === piProgress(r.pi.m)
      );
    return Object.keys(FIELDS).every((k) => {
      const v = r.measurements[k];
      if (v === null) return version === 1;
      const type = FIELDS[k].type;
      return type === "category"
        ? typeof v === "string"
        : type === "boolean"
          ? typeof v === "boolean"
          : typeof v === "number" && Number.isFinite(v);
    });
  } catch {
    return false;
  }
}
export function validateFilters(filters) {
  if (!Array.isArray(filters))
    throw new TypeError("Use an array of characteristics.");
  for (const f of filters) {
    const d = FIELDS[f.field];
    if (!d || !["eq", "min", "max", "near"].includes(f.op))
      throw new TypeError("Unknown filter.");
    if (["number", "hue"].includes(d.type)) {
      if (typeof f.value !== "number" || !Number.isFinite(f.value))
        throw new TypeError("A filter requires a finite number.");
    } else if (
      f.op !== "eq" ||
      (d.type === "boolean"
        ? typeof f.value !== "boolean"
        : !OPTIONS[f.field]?.includes(f.value))
    )
      throw new TypeError("Invalid categorical filter.");
  }
  return filters;
}
export function distance(field, a, b) {
  if (typeof a !== "number" || typeof b !== "number") return a === b ? 0 : 1;
  const delta = Math.abs(a - b);
  return field === "hue" ? Math.min(delta % 360, 360 - (delta % 360)) : delta;
}
export function assessment(c, actual) {
  const f = FIELDS[c.field],
    delta =
      actual == null
        ? Infinity
        : c.op === "min"
          ? Math.max(0, c.value - actual)
          : c.op === "max"
            ? Math.max(0, actual - c.value)
            : distance(c.field, actual, c.value),
    tolerance =
      c.op === "near"
        ? (c.tolerance ?? (c.field === "hue" ? 0.1 : 0.001))
        : 1e-9;
  return {
    field: c.field,
    op: c.op,
    requested: c.value,
    actual,
    tolerance,
    met: delta <= tolerance,
    distance: delta / (f.range?.[1] - f.range?.[0] || 1),
  };
}
export const matches = (record, filters) =>
  validateFilters(filters).every(
    (c) => assessment(c, record.measurements[c.field]).met,
  );
export function similarity(
  a,
  b,
  weights = { anatomy: 1, appearance: 1, ecology: 0.5 },
) {
  if (Object.values(weights).some((w) => !Number.isFinite(w) || w < 0))
    throw new TypeError("Invalid similarity weight.");
  if (
    !validRecord(a) ||
    !validRecord(b) ||
    a.generatorVersion !== b.generatorVersion
  )
    return null;
  if (a.kind === "pi-path" && b.kind === "pi-path")
    return {
      score: 1 - Math.abs(a.pi.t - b.pi.t),
      terms: [],
      category: "pi-path",
    };
  if (a.kind === "pi-path" || b.kind === "pi-path") return null;
  let total = 0,
    sum = 0;
  const terms = [];
  for (const [k, f] of Object.entries(FIELDS)) {
    const x = a.measurements[k],
      y = b.measurements[k];
    if (x == null || y == null) continue;
    const weight = weights[f.group] ?? 1;
    if (!weight) continue;
    const d = Math.min(
      1,
      distance(k, x, y) /
        (["number", "hue"].includes(f.type) ? f.range[1] - f.range[0] : 1),
    );
    sum += weight * d;
    total += weight;
    terms.push({ field: k, distance: d, weight });
  }
  if (!total) return null;
  const same = a.phenotype === b.phenotype;
  const outlines = a.shapeSignature?.anatomy && b.shapeSignature?.anatomy;
  const shapeDistance = outlines
    ? Math.min(
        1,
        outlineDistance(a.shapeSignature.anatomy, b.shapeSignature.anatomy) / 2,
      )
    : null;
  const traitScore = 1 - sum / total;
  const shapeWeight = weights.anatomy > 0 && shapeDistance !== null ? 0.55 : 0;
  return {
    score:
      ((1 - shapeWeight) * traitScore +
        shapeWeight * (1 - (shapeDistance ?? 0))) *
      (same ? 1 : 0.65),
    traitScore,
    shapeDistance,
    terms,
    samePhenotype: same,
    category: same ? "same phenotype" : "different phenotype",
  };
}
export function search(
  records,
  { filters = [], target = null, weights, limit = 40 } = {},
) {
  validateFilters(filters);
  const seen = new Set(),
    results = [];
  for (const r of records) {
    if (
      !validRecord(r) ||
      r.kind === "pi-path" ||
      seen.has(recordID(r)) ||
      !matches(r, filters)
    )
      continue;
    seen.add(recordID(r));
    if (target && recordID(target) === recordID(r)) continue;
    const comparison = target ? similarity(target, r, weights) : null;
    if (target && !comparison) continue;
    results.push({ record: r, comparison });
  }
  results.sort((a, b) =>
    target
      ? b.comparison.score - a.comparison.score
      : a.record.identity.seed.localeCompare(
          b.record.identity.seed,
          undefined,
          { numeric: true },
        ),
  );
  return { total: results.length, results: results.slice(0, limit) };
}
export function rarity(record, records) {
  if (record.kind === "pi-path") return null;
  const sample = records.filter(
    (r) =>
      r.kind !== "pi-path" &&
      validRecord(r) &&
      r.generatorVersion === record.generatorVersion &&
      recordID(r) !== recordID(record),
  );
  if (sample.length < 30) return null;
  return {
    sampleSize: sample.length,
    traits: Object.keys(FIELDS).flatMap((field) => {
      const frequency =
        sample.filter(
          (r) => r.measurements[field] === record.measurements[field],
        ).length / sample.length;
      return FIELDS[field].type === "category" && frequency < 0.1
        ? [
            {
              field,
              value: record.measurements[field],
              frequency,
              n: sample.length,
            },
          ]
        : [];
    }),
  };
}
