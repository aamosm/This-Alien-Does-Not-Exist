import { baseLimbCount } from "./anatomy.js";
import { generate, catalogueRecord } from "./engine.js";
import {
  decode,
  encode,
  ordinarySeed,
  setUnit,
  setChoice,
  choiceInterval,
  tableChoice,
  GENES,
  unit,
} from "./grammar-genome.js";
import { parameters, TABLES, POOLS, MOTIFS } from "./grammar.js";
import { DIRECT, FIELDS, LABELS, OPTIONS, COUNTS, UNITS } from "./traits.js";
import { validateFilters, assessment, similarity } from "./registry.js";
import { normalizeSeed, piLength, piSeed } from "./pi.js";
import { mix64, hashKey } from "./random.js";
import { outlineDistance } from "./geometry.js";
export const MIN_OUTLINE_DISTANCE = 0.06;
export {
  LABELS,
  OPTIONS,
  COUNTS,
  UNITS,
  FIELDS,
  decode as decodeSeed,
  encode as seedFromGenome,
};
export function normalizeQuery(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Use a query object.");
  const allowed = new Set([
    "constraints",
    "filters",
    "like",
    "likePi",
    "generatorVersion",
    "category",
    "samePhenotype",
    "limit",
    "variant",
    "direction",
  ]);
  for (const key of Object.keys(input))
    if (!allowed.has(key))
      throw new TypeError(`Unknown query property: ${key}.`);
  if (input.constraints !== undefined && input.filters !== undefined)
    throw new TypeError("Use constraints or filters, not both.");
  if (
    input.samePhenotype !== undefined &&
    typeof input.samePhenotype !== "boolean"
  )
    throw new TypeError("samePhenotype must be a boolean.");
  const constraints = structuredClone(input.constraints ?? input.filters ?? []);
  validateFilters(constraints);
  if (constraints.length > 80)
    throw new RangeError("Use at most 80 characteristics.");
  for (const c of constraints) {
    for (const key of Object.keys(c))
      if (!["field", "op", "value", "tolerance", "weight"].includes(key))
        throw new TypeError(`Unknown characteristic property: ${key}.`);
    if (
      c.weight !== undefined &&
      (!Number.isFinite(c.weight) || c.weight <= 0 || c.weight > 100)
    )
      throw new TypeError("Weight must be in (0,100].");
    if (
      c.tolerance !== undefined &&
      (!Number.isFinite(c.tolerance) || c.tolerance < 0)
    )
      throw new TypeError("Tolerance must be non-negative.");
  }
  const limit = input.limit ?? 6,
    variant = input.variant ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 12)
    throw new RangeError("Request 1–12 results.");
  if (!Number.isSafeInteger(variant) || variant < 0 || variant > 1000000)
    throw new RangeError("Invalid variant.");
  const generatorVersion = Number(input.generatorVersion ?? 2);
  if (generatorVersion !== 2)
    throw new RangeError(
      "Inverse construction uses the current generator. Original seeds can be generated and exported with generatorVersion: 1.",
    );
  const category =
    input.category ?? (input.like || input.likePi ? "closest" : "traits");
  if (
    !["traits", "closest", "anatomy", "appearance", "ecology"].includes(
      category,
    )
  )
    throw new TypeError("Unknown search category.");
  const direction =
    input.direction ??
    (input.likePi === 1000 ||
    (input.like != null && piLength(normalizeSeed(input.like)) === 1000)
      ? "backward"
      : "forward");
  if (!["forward", "backward"].includes(direction))
    throw new TypeError("Direction must be forward or backward.");
  if (input.like != null && input.likePi != null)
    throw new TypeError("Use like or likePi, not both.");
  return {
    generatorVersion,
    category,
    constraints,
    like:
      input.likePi != null
        ? piSeed(input.likePi)
        : input.like == null
          ? null
          : normalizeSeed(input.like),
    samePhenotype: input.samePhenotype !== false,
    limit,
    variant,
    direction,
  };
}
const score = (values, cs) =>
  cs.reduce(
    (sum, c) =>
      sum +
      (c.weight ?? 1) *
        (c.op === "near" ? 1 : 20) *
        assessment(c, values[c.field]).distance,
    0,
  );
const checks = (r, cs) => cs.map((c) => assessment(c, r.measurements[c.field]));
function conflicts(cs) {
  const messages = [];
  for (const field of Object.keys(FIELDS)) {
    const rows = cs.filter((c) => c.field === field),
      eq = rows.filter((c) => c.op === "eq");
    if (new Set(eq.map((c) => c.value)).size > 1)
      messages.push(`${LABELS[field]} cannot have two exact values.`);
    const lo = Math.max(
        -Infinity,
        ...rows.filter((c) => c.op === "min").map((c) => c.value),
      ),
      hi = Math.min(
        Infinity,
        ...rows.filter((c) => c.op === "max").map((c) => c.value),
      );
    if (
      lo > hi ||
      eq.some(
        (c) => typeof c.value === "number" && (c.value < lo || c.value > hi),
      )
    )
      messages.push(`${LABELS[field]} has contradictory bounds.`);
  }
  return messages;
}
function projectDirect(g, cs, proof) {
  for (const [field, spec] of Object.entries(DIRECT)) {
    const rows = cs.filter((c) => c.field === field);
    if (!rows.length) continue;
    if (
      field === "contrast" &&
      cs.some(
        (c) => c.field === "pattern" && c.op === "eq" && c.value === "Plain",
      )
    ) {
      proof[field] = {
        method: "conditional-surface",
        value: 0,
        feasible: rows.every((c) => assessment(c, 0).met),
      };
      continue;
    }
    if (
      ["eyeStyle", "pupil"].includes(field) &&
      rows.some((c) => ["None", "Central"].includes(c.value))
    )
      continue;
    if (spec.table) {
      const candidates = spec.table
        .map(([, v]) => v)
        .map((value) => ({ value, cost: score({ [field]: value }, rows) }))
        .sort((a, b) => a.cost - b.cost);
      const current = tableChoice(g.digits[spec.gene], spec.table);
      const best =
        candidates.find(
          (c) => c.value === current && c.cost === candidates[0].cost,
        ) ?? candidates[0];
      setChoice(g, spec.gene, best.value, spec.table);
      proof[field] = {
        method: "cdf-interval",
        interval: choiceInterval(best.value, spec.table),
        value: best.value,
        feasible: candidates[0].cost === 0,
      };
    } else {
      let lo = 0,
        hi = 65535;
      const range = spec.max - spec.min,
        coordinates = [];
      for (const c of rows) {
        const d = ((c.value - spec.min) / range) * 65535,
          tol =
            c.op === "near"
              ? ((c.tolerance ?? (field === "hue" ? 0.1 : 0.001)) / range) *
                65535
              : 1e-7;
        coordinates.push(Math.floor(d), Math.ceil(d));
        if (c.op === "min") lo = Math.max(lo, Math.ceil(d - 1e-7));
        else if (c.op === "max") hi = Math.min(hi, Math.floor(d + 1e-7));
        else {
          lo = Math.max(lo, Math.ceil(d - tol));
          hi = Math.min(hi, Math.floor(d + tol));
        }
      }
      if (lo <= hi)
        g.digits[spec.gene] = Math.max(lo, Math.min(hi, g.digits[spec.gene]));
      else {
        const candidates = [0, 65535, ...coordinates].map((d) =>
          Math.max(0, Math.min(65535, d)),
        );
        candidates.sort(
          (a, b) =>
            score({ [field]: spec.min + (range * a) / 65535 }, rows) -
            score({ [field]: spec.min + (range * b) / 65535 }, rows),
        );
        g.digits[spec.gene] = candidates[0];
      }
      proof[field] = {
        method: "linear-inverse",
        interval: lo <= hi ? [lo, hi] : null,
        feasible: lo <= hi,
        step: range / 65535,
      };
    }
  }
}
function constraintsWithAliases(cs) {
  const out = [...cs];
  for (const c of cs) {
    if (
      c.field === "contrast" &&
      c.value === 0 &&
      ["eq", "near", "max"].includes(c.op)
    )
      out.push({ field: "pattern", op: "eq", value: "Plain" });
    if (
      c.field === "contrast" &&
      c.value > 0 &&
      ["eq", "near", "min"].includes(c.op) &&
      !cs.some((x) => x.field === "pattern")
    )
      out.push({ field: "pattern", op: "eq", value: "Spots" });
    if (c.field === "eyeStyle") {
      out.push({
        field: "eyeCount",
        op: ["None", "Central"].includes(c.value) ? "eq" : "min",
        value: c.value === "None" ? 0 : c.value === "Central" ? 1 : 2,
      });
    }
    if (c.field === "pupil") {
      out.push({
        field: "eyeCount",
        op: c.value === "None" ? "eq" : "min",
        value: c.value === "None" ? 0 : 1,
      });
    }
    if (c.field === "wingCount" && c.op === "eq" && [0, 2].includes(c.value))
      out.push({ field: "wings", op: "eq", value: c.value === 2 });
    if (
      c.field === "hornCount" &&
      c.op === "eq" &&
      Number.isInteger(c.value) &&
      c.value >= 0 &&
      c.value <= 3
    )
      out.push({ field: "horns", op: "eq", value: c.value > 0 });
    if (c.field === "tailType")
      out.push({ field: "tailPresent", op: "eq", value: c.value !== "None" });
    if (c.field === "medium" && c.op === "eq") {
      out.push({ field: "wings", op: "eq", value: c.value === "Air" });
      if (c.value !== "Air")
        out.push({ field: "tentacles", op: "eq", value: c.value === "Water" });
    }
    if (c.field === "motif2") {
      out.push({
        field: "motifCount",
        op: "eq",
        value: c.value === "None" ? 1 : 2,
      });
    }
  }
  return out;
}
function projectTopology(g, cs) {
  const relevant = cs.filter((c) =>
    ["limbCount", "legCount", "hornCount", "wingCount", "extraLimbs"].includes(
      c.field,
    ),
  );
  if (!relevant.length) return;
  const allowed = (key) =>
    TABLES[key]
      .filter(([, v]) => {
        const field = Object.keys(DIRECT).find((k) => DIRECT[k].gene === key);
        return cs
          .filter((c) => c.field === field)
          .every((c) => assessment(c, v).met);
      })
      .map(([, v]) => v);
  const keys = ["limbSet", "symmetry", "extraLimbs", "tentacles"],
    options = keys.map((k) => allowed(k));
  if (options.some((x) => !x.length)) return;
  let best = null,
    bestScore = Infinity,
    bestChange = Infinity;
  const current = Object.fromEntries(
    keys.map((k) => [k, tableChoice(g.digits[k], TABLES[k])]),
  );
  for (const limbSet of options[0])
    for (const symmetry of options[1])
      for (const extraLimbs of options[2])
        for (const tentacles of options[3])
          for (let n = 0; n < 7; n++) {
            const detail = (n + 0.5) / 7,
              count =
                symmetry === "Radial"
                  ? 3 + Math.floor(detail * 6.999)
                  : tentacles
                    ? 6 + Math.floor(detail * 2.999)
                    : extraLimbs
                      ? 6 + 2 * Math.floor(detail * 1.999)
                      : baseLimbCount(limbSet);
            const cost = score(
                {
                  limbCount: count,
                  legCount: tentacles ? 0 : count,
                  extraLimbs: extraLimbs || count > 4,
                },
                relevant.filter((c) =>
                  ["limbCount", "legCount", "extraLimbs"].includes(c.field),
                ),
              ),
              candidate = { limbSet, symmetry, extraLimbs, tentacles },
              change =
                keys.filter((k) => candidate[k] !== current[k]).length +
                Math.abs(unit(g, "detail") - detail) * 0.01;
            if (
              cost < bestScore ||
              (cost === bestScore && change < bestChange)
            ) {
              bestScore = cost;
              bestChange = change;
              best = { ...candidate, detail };
            }
          }
  if (best) {
    for (const key of keys) setChoice(g, key, best[key], TABLES[key]);
    if (best.symmetry === "Radial" || best.extraLimbs || best.tentacles)
      setUnit(g, "detail", best.detail);
  }
  const horn = cs.find((c) => c.field === "hornCount" && c.op === "eq");
  if (horn && horn.value > 0)
    setUnit(g, "iconCount", (horn.value - 0.5) / 2.999);
}
function desired(field, current, cs) {
  const rows = cs.filter((c) => c.field === field),
    eq = rows.find((c) => ["eq", "near"].includes(c.op));
  let value = eq?.value ?? current;
  for (const c of rows) {
    if (c.op === "min") value = Math.max(value, c.value);
    if (c.op === "max") value = Math.min(value, c.value);
  }
  return value;
}
function projectDerived(g, cs) {
  let { p } = parameters(ordinarySeed(g));
  for (const c of cs.filter(
    (c) => c.field === "motif2" && c.value !== "None",
  )) {
    setChoice(g, "motif2", c.value, TABLES.motif2);
    if (p.motif1 === c.value && !cs.some((x) => x.field === "motif1"))
      setChoice(
        g,
        "motif1",
        MOTIFS[(MOTIFS.indexOf(c.value) + 1) % MOTIFS.length],
        TABLES.motif1,
      );
  }
  const mapping = {
    headBodyRatio: ["headSize", 12, 45, p.length / 2],
    neckBodyRatio: ["neck", 6, 58, p.length],
    limbBodyRatio: ["limbLength", 35, 180, p.length],
    limbThicknessRatio: ["limbWidth", 2.5, 10, p.width],
    tailBodyRatio: ["tailLength", 30, 150, p.length],
  };
  let lower = 145,
    upper = 300;
  for (const [field, [gene, min, max, mult]] of Object.entries(mapping)) {
    if (field === "limbThicknessRatio") continue;
    const c = cs.find(
      (c) => c.field === field && ["eq", "near"].includes(c.op),
    );
    if (c && c.value > 0) {
      const factor = field === "headBodyRatio" ? 2 : 1;
      lower = Math.max(lower, (min * factor) / c.value);
      upper = Math.min(upper, (max * factor) / c.value);
    }
  }
  if (lower <= upper && !cs.some((c) => c.field === "bodyLength")) {
    setUnit(
      g,
      "length",
      (Math.max(lower, Math.min(upper, p.length)) - 145) / 155,
    );
    p = parameters(ordinarySeed(g)).p;
  }
  for (const [field, [gene, min, max]] of Object.entries(mapping))
    if (cs.some((c) => c.field === field)) {
      const divisor =
        field === "headBodyRatio"
          ? p.length / 2
          : field === "limbThicknessRatio"
            ? p.width
            : p.length;
      const current =
        (field === "headBodyRatio"
          ? p.headSize
          : field === "neckBodyRatio"
            ? p.neck
            : field === "limbBodyRatio"
              ? p.limbLength
              : field === "limbThicknessRatio"
                ? p.limbWidth
                : p.tailLength) / divisor;
      const value = desired(field, current, cs);
      setUnit(g, gene, (value * divisor - min) / (max - min));
    }
  if (cs.some((c) => c.field === "exploration")) {
    const y = desired("exploration", p.exploration, cs),
      a = 0.12 * (0.5 - p.resources);
    const x =
      Math.abs(a) < 1e-12
        ? y
        : (2 * y) / (1 + a + Math.sqrt((1 + a) ** 2 - 4 * a * y));
    setUnit(g, "exploration", x);
  }
}
const DEPENDENCIES = {
  bodyAspect: [
    "length",
    "width",
    "bend",
    "pose",
    "headSize",
    "neck",
    "limbLength",
    "limbWidth",
  ],
  circularity: ["length", "width", "bend", "lobes", "limbLength", "pose"],
  radialVariance: ["length", "width", "bend", "lobes", "limbLength"],
  eyeSizeVariation: ["eyeVariance", "eyeSize"],
  headBodyRatio: ["headSize", "length"],
  neckBodyRatio: ["neck", "length"],
  limbBodyRatio: ["limbLength", "length"],
  limbThicknessRatio: ["limbWidth", "width"],
  tailBodyRatio: ["tailLength", "length"],
  exploration: ["exploration"],
};
const pause = () => new Promise((r) => setTimeout(r, 0));
export async function solveQuery(
  input,
  { isCancelled = () => false, onProgress = () => {} } = {},
) {
  const query = normalizeQuery(input),
    target = query.like ? generate(query.like) : null,
    started = performance.now();
  const check = () => {
    if (isCancelled()) throw new DOMException("Cancelled", "AbortError");
  };
  check();
  if (target?.kind === "pi-path" && !query.constraints.length) {
    const results = [];
    for (let i = 1; i <= query.limit; i++) {
      const m = target.pi.m + (query.direction === "backward" ? -i : i);
      if (m < 1 || m > 1000) break;
      const record = generate(piSeed(m));
      results.push({
        record: catalogueRecord(record),
        checks: [],
        exact: true,
        loss: Math.abs(record.pi.t - target.pi.t),
        comparison: similarity(target, record),
        category: "next pi path",
      });
    }
    return {
      method: "pi-prefix",
      status: "matched",
      query,
      results,
      evaluated: results.length,
      conflicts: [],
      elapsedMs: Math.round(performance.now() - started),
    };
  }
  let cs = constraintsWithAliases(query.constraints);
  if (target && query.samePhenotype && target.kind !== "pi-path")
    for (const field of [
      "bodyPlan",
      "headModule",
      "limbSet",
      "symmetry",
      "limbShape",
    ])
      cs.push({ field, op: "eq", value: target.measurements[field] });
  if (target?.kind === "pi-path")
    for (const field of [
      "bodyPlan",
      "limbCount",
      "tailPresent",
      "mouth",
      "pattern",
    ])
      if (
        !cs.some((c) => c.field === field) &&
        target.measurements[field] != null &&
        (!OPTIONS[field] || OPTIONS[field].includes(target.measurements[field]))
      ) {
        const candidate = [
          ...cs,
          { field, op: "eq", value: target.measurements[field] },
        ];
        if (!conflicts(candidate).length)
          cs.push({ field, op: "eq", value: target.measurements[field] });
      }
  const problem = conflicts(cs);
  if (problem.length)
    return {
      method: "inverse-genome",
      status: "conflict",
      query,
      conflicts: problem,
      results: [],
      evaluated: 0,
      elapsedMs: 0,
    };
  const results = [];
  const outlines = target?.shapeSignature?.anatomy
    ? [target.shapeSignature.anatomy]
    : [];
  const seedIDs = new Set(target ? [target.identity.seed] : []);
  let duplicatesSkipped = 0;
  let evaluated = 0;
  const evaluate = (g) => {
    evaluated++;
    return generate(ordinarySeed(g));
  };
  for (let i = 0; i < query.limit * 8 && results.length < query.limit; i++) {
    check();
    let g = decode(
        target && target.kind !== "pi-path"
          ? target.identity.seed
          : mix64(BigInt(query.variant + i) + 0xa11e1n).toString(),
      ),
      proof = {};
    if (target && target.kind !== "pi-path") {
      // Deliberate genome-space variation, followed by constraint projection.
      // Several proportions change together; texture and pose alone never count as a new result.
      const free = [
        "length",
        "width",
        "bend",
        "headSize",
        "headWidth",
        "neck",
        "limbLength",
        "limbWidth",
        "asymmetry",
        "taper",
      ].filter(
        (k) => !cs.some((c) => c.op === "eq" && DIRECT[c.field]?.gene === k),
      );
      const serial = query.variant * 101 + i;
      for (let j = 0; j < Math.min(6, free.length); j++) {
        const key = free[(serial + j) % free.length];
        const entropy =
          Number(mix64(hashKey(key) ^ BigInt(serial + 1)) >> 32n) / 4294967296;
        const delta =
          (0.16 + 0.28 * (entropy % 0.5) * 2) *
          65535 *
          (entropy < 0.5 ? -1 : 1);
        const value = g.digits[key] + delta;
        g.digits[key] = Math.round(
          value < 0 ? -value : value > 65535 ? 131070 - value : value,
        );
      }
      if (!query.samePhenotype) {
        const key = ["body", "head", "limbSet", "limbShape"][serial % 4];
        const options = TABLES[key].map(([, value]) => value);
        const current = tableChoice(g.digits[key], TABLES[key]);
        setChoice(
          g,
          key,
          options[
            (options.indexOf(current) + 1 + (serial % (options.length - 1))) %
              options.length
          ],
          TABLES[key],
        );
      }
    }
    projectDirect(g, cs, proof);
    projectTopology(g, cs);
    projectDerived(g, cs);
    projectDirect(g, cs, proof);
    let best = evaluate(g),
      loss = score(best.measurements, cs),
      keys = [...new Set(cs.flatMap((c) => DEPENDENCIES[c.field] ?? []))];
    for (const step of [2048, 512, 128, 32, 8, 2, 1]) {
      if (loss < 1e-12 || !keys.length) break;
      for (const key of keys) {
        check();
        const original = g.digits[key];
        let winner = original;
        for (const digit of [
          Math.max(0, original - step),
          Math.min(65535, original + step),
        ]) {
          if (digit === original) continue;
          g.digits[key] = digit;
          const candidate = evaluate(g),
            next = score(candidate.measurements, cs);
          if (next < loss - 1e-14) {
            loss = next;
            best = candidate;
            winner = digit;
          }
        }
        g.digits[key] = winner;
      }
      await pause();
    }
    check();
    const final = generate(best.identity.seed),
      evaluations = checks(final, query.constraints),
      allChecks = checks(final, cs);
    const outline = final.shapeSignature?.anatomy;
    if (
      seedIDs.has(final.identity.seed) ||
      (outline &&
        outlines.some(
          (v) => outlineDistance(v, outline) < MIN_OUTLINE_DISTANCE,
        ))
    ) {
      duplicatesSkipped++;
      await pause();
      continue;
    }
    seedIDs.add(final.identity.seed);
    if (outline) outlines.push(outline);
    results.push({
      record: catalogueRecord(final),
      checks: evaluations,
      exact: allChecks.every((c) => c.met),
      loss: score(final.measurements, cs),
      comparison: target
        ? similarity(
            target,
            final,
            query.category === "anatomy"
              ? { anatomy: 1, appearance: 0, ecology: 0 }
              : query.category === "appearance"
                ? { anatomy: 0, appearance: 1, ecology: 0 }
                : query.category === "ecology"
                  ? { anatomy: 0, appearance: 0, ecology: 1 }
                  : undefined,
          )
        : null,
      category: target
        ? target.phenotype === final.phenotype
          ? "same phenotype"
          : "different phenotype"
        : "trait match",
      proof,
    });
    onProgress({ done: results.length, total: query.limit });
    await pause();
  }
  check();
  results.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      a.loss - b.loss ||
      (b.comparison?.score ?? 0) - (a.comparison?.score ?? 0),
  );
  if (target?.kind === "pi-path") {
    const nextM = target.pi.m + (query.direction === "backward" ? -1 : 1);
    if (nextM >= 1 && nextM <= 1000) {
      const nextRecord = generate(piSeed(nextM));
      const nextChecks = checks(nextRecord, query.constraints);
      results.unshift({
        record: catalogueRecord(nextRecord),
        checks: nextChecks,
        exact: nextChecks.every((c) => c.met),
        loss: Math.abs(nextRecord.pi.t - target.pi.t),
        comparison: similarity(target, nextRecord),
        category: "next pi path",
      });
      results.length = Math.min(results.length, query.limit);
    }
  }
  return {
    method: "inverse-genome",
    status: results.some((r) => r.exact) ? "matched" : "approximate",
    query,
    results,
    conflicts: [],
    evaluated,
    diversity: {
      duplicatesSkipped,
      minimumOutlineDistance: MIN_OUTLINE_DISTANCE,
      limited: results.length < query.limit,
    },
    elapsedMs: Math.round(performance.now() - started),
    guarantee:
      "Direct fields: inverse intervals in a bijective genome, with forward verification. Derived geometry: bounded local fit, not a global-nearest proof.",
  };
}
