import test from "node:test";
import assert from "node:assert/strict";
import { generate, catalogueRecord } from "../src/engine.js";
import { mix64, MASK } from "../src/random.js";
import {
  PI_DIGITS,
  P_D,
  D,
  normalizeSeed,
  piLength,
  piSeed,
  piProgress,
  SeedLimitError,
} from "../src/pi.js";
import { machinDigits } from "../scripts/pi-machin.mjs";
import {
  decode,
  encode,
  GENES,
  SPACE,
  permute,
  unpermute,
} from "../src/grammar-genome.js";
import { solveQuery, normalizeQuery } from "../src/reverse.js";
import { DIRECT, FIELDS } from "../src/traits.js";
import { parseRoute, routeURL } from "../src/routes.js";
import { validRecord, rarity, similarity } from "../src/registry.js";
import {
  humanSDF,
  HUMAN_AREA,
  CIRCLE_RADIUS,
  pathSDF,
} from "../src/pi-render.js";
import { CIRCULARITY_MAX, RADIAL_VARIANCE_MIN } from "../src/silhouette.js";
import { DiscoveryPicker, signatureOf } from "../src/discovery.js";
import { parameters, geometryOf, POOLS } from "../src/grammar.js";

test("body modules include faceted hulls, narrow frames and softer forms with attached rigs", () => {
  const p = parameters("42").p,
    outlines = new Set();
  let hulls = 0,
    soft = 0;
  for (const body of POOLS.body) {
    const g = geometryOf({ ...p, body });
    const part = g.parts.find((x) => x.role === "body");
    hulls += part.shape === "polygon";
    soft += part.shape === "ribbon";
    outlines.add(JSON.stringify(part.points));
    assert.equal(g.spine.length, 14);
    assert(g.parts.some((x) => x.role === "neck"));
    assert(!g.parts.some((x) => x.role === "segment" && x.shape === "ellipse"));
  }
  assert.equal(outlines.size, 12);
  assert(hulls >= 6 && soft >= 4);
});

test("named eye layouts, limb profiles and head motifs have distinct attached geometry", () => {
  const p = {
    ...parameters("42").p,
    eyeCount: 6,
    limbSet: "Trailing",
    symmetry: "Bilateral",
    tentacles: false,
    extraLimbs: false,
  };
  const layouts = POOLS.eyeStyle.map((eyeStyle) =>
    geometryOf({ ...p, eyeStyle }).eyes.map((e) => [e.local.u, e.local.v]),
  );
  assert.equal(
    new Set(layouts.map(JSON.stringify)).size,
    POOLS.eyeStyle.length,
  );
  for (const layout of layouts)
    for (const [u, v] of layout) assert(Math.hypot(u, v) < 0.85);
  const central = geometryOf({ ...p, eyeCount: 1 }).eyes[0];
  assert.equal(central.local.u, 0);
  const limbs = POOLS.limbShape.map(
    (limbShape) => geometryOf({ ...p, limbShape }).limbs[0],
  );
  assert.equal(
    new Set(limbs.map((l) => JSON.stringify(l.radii))).size,
    POOLS.limbShape.length,
  );
  const g = geometryOf({ ...p, motifCount: 1, motif1: "Forehead plate" });
  const plate = g.parts.find((part) => part.motif === "Forehead plate");
  assert(plate);
  assert(Math.hypot(plate.x - g.head.x, plate.y - g.head.y) < g.head.ry * 0.6);
  for (const phase of [0, 0.8, 2.1, 4.7, 6.2]) {
    const attached = geometryOf({ ...p, tail: true, tailLength: 150, phase });
    const bodyEnd = attached.spine.at(-1);
    assert(
      Math.hypot(
        attached.tail.points[0].x - bodyEnd.x,
        attached.tail.points[0].y - bodyEnd.y,
      ) < 1e-9,
    );
  }
});

test("embedded pi is exactly 1,000 truncated digits; curve is monotone", () => {
  assert.equal(D, 1000);
  assert.equal(PI_DIGITS, machinDigits(1000));
  let previous = -1;
  for (let m = 1; m <= D; m++) {
    const t = piProgress(m);
    assert(t > previous);
    previous = t;
    assert.equal(piLength(piSeed(m)), m);
  }
  assert.equal(piProgress(1), 0);
  assert.equal(piProgress(D), 1);
  assert(piProgress(14) > 0.5 && piProgress(14) < 0.57);
  console.log(
    "Pi curve:",
    [1, 2, 3, 7, 14, 32, 100, 500, 1000]
      .map((m) => `${m}: ${piProgress(m).toFixed(6)}`)
      .join(", "),
  );
});
test("normalization, rounded prefixes and the hard upper boundary", () => {
  assert.equal(normalizeSeed(" 3.141\n592 65358979 "), piSeed(15));
  assert.equal(normalizeSeed("31415926535898"), piSeed(14));
  assert.equal(normalizeSeed("π"), PI_DIGITS);
  assert.equal(normalizeSeed("circle"), PI_DIGITS);
  assert.equal(normalizeSeed("singularity"), PI_DIGITS);
  assert.throws(() => normalizeSeed((P_D + 1n).toString()), SeedLimitError);
  assert.throws(() => normalizeSeed("9".repeat(1001)), SeedLimitError);
  for (const bad of ["-1", "1.5", "NaN", "", Infinity, 9007199254740992])
    assert.throws(() => normalizeSeed(bad));
  assert.equal(piLength("31415926535899"), null);
  assert.equal(piLength("31415916535897"), null);
  assert.equal(normalizeSeed("3", 1), "3");
  assert.throws(() => normalizeSeed("circle", 1));
  assert.throws(() => normalizeSeed("1", 7));
});
test("genome permutation and full decimal identities round-trip", () => {
  for (let i = 0; i < 1200; i++) {
    const seed = (mix64(BigInt(i)) * (SPACE / 101n) + BigInt(i)).toString();
    if (BigInt(seed) > P_D) continue;
    const d = decode(seed);
    assert.equal(encode(d), normalizeSeed(seed));
    assert.equal(Object.keys(d.digits).length, GENES.length);
  }
  for (const n of [0n, 1n, SPACE - 1n, SPACE / 2n, 512389n])
    assert.equal(unpermute(permute(n)), n);
  const huge = (P_D - 1234567n).toString();
  assert.equal(encode(decode(huge)), huge);
});
test("versioned routes and compact pi URLs round-trip", () => {
  for (const seed of ["0", "42", piSeed(1), piSeed(14), PI_DIGITS]) {
    const url = routeURL(
      { seed, generatorVersion: 2 },
      "https://example.test/project/",
    );
    assert.equal(parseRoute(url).seed, seed);
    assert(new URL(url).searchParams.has("v"));
    if (piLength(seed)) {
      assert(new URL(url).searchParams.has("pi"));
      assert(url.length < 80);
    }
  }
  assert.equal(parseRoute("https://x/?v=1&seed=3").generatorVersion, 1);
  assert.equal(parseRoute("https://x/v1/42").generatorVersion, 1);
  assert.equal(
    parseRoute("https://x/project/?route=%2Fproject%2F42%3Fv%3D1")
      .generatorVersion,
    1,
  );
  assert.equal(
    parseRoute(routeURL({ seed: PI_DIGITS }, "file:///tmp/renamed.html")).seed,
    PI_DIGITS,
  );
  for (const u of [
    "https://x/?v=3&seed=1",
    "https://x/?seed=3&pi=1",
    "https://x/?pi=1001",
    "https://x/?pi=1.5",
    "https://x/?seed=1&seed=2",
    "https://x/?route=https://evil.test/3",
  ])
    assert.throws(() => parseRoute(u));
});
test("ordinary grammar invariants, measured repairs and evidence across 2,000 seeds", () => {
  let motifs = new Set(),
    phenotypes = new Set();
  for (let i = 0; i < 2000; i++) {
    const r = generate(mix64(BigInt(i) + 1024n).toString()),
      m = r.measurements;
    assert(validRecord(r), r.identity.seed);
    assert(m.circularity <= CIRCULARITY_MAX);
    assert(m.radialVariance >= RADIAL_VARIANCE_MIN);
    assert(!["Radial", "Winged", "Cephalopod"].includes(m.bodyPlan));
    assert.equal(m.eyeCount, r.geometry.eyes.length);
    assert.equal(m.limbCount, r.geometry.limbs.length);
    assert.equal(m.tailPresent, !!r.geometry.tail);
    assert(r.motifs.length >= 1 && r.motifs.length <= 2);
    for (const motif of r.motifs) motifs.add(motif);
    phenotypes.add(r.phenotype);
    assert(
      r.claims.every((c) => c.evidence.every((e) => e.value !== undefined)),
    );
    if (i % 399 === 0) assert.deepEqual(generate(r.identity.seed), r);
  }
  assert(motifs.size >= 80);
  assert(phenotypes.size > 1000);
});
test("direct reverse constraints construct and reproduce an unsurveyed combination", async () => {
  const constraints = [
    { field: "bodyPlan", op: "eq", value: "Crescent" },
    { field: "headModule", op: "eq", value: "Hammer" },
    { field: "eyeCount", op: "eq", value: 7 },
    { field: "pattern", op: "eq", value: "Veins" },
    { field: "hue", op: "near", value: 225 },
    { field: "wings", op: "eq", value: true },
    { field: "tailPresent", op: "eq", value: true },
    { field: "hornCount", op: "eq", value: 3 },
    { field: "brightness", op: "min", value: 0.6 },
  ];
  const r = await solveQuery({ constraints, limit: 3 });
  assert.equal(r.method, "inverse-genome");
  assert.equal(r.status, "matched");
  for (const item of r.results) {
    assert(item.exact);
    assert(item.checks.every((c) => c.met));
    assert.deepEqual(
      catalogueRecord(generate(item.record.identity.seed)),
      item.record,
    );
    assert(item.proof.eyeCount.interval);
  }
});
test("each independently invertible field is verified against regenerated measurements", async () => {
  const target = generate("42");
  for (const [field, d] of Object.entries(DIRECT)) {
    let value = target.measurements[field];
    if (field === "eyeStyle") value = "Arc";
    if (field === "pupil") value = "star";
    const r = await solveQuery({
      constraints: [{ field, op: "eq", value }],
      limit: 1,
    });
    assert(
      r.results[0].checks.every((c) => c.met),
      field,
    );
  }
});
test("derived geometry, impossible requests and uncertainty remain explicit", async () => {
  const r = await solveQuery({
    constraints: [
      { field: "headBodyRatio", op: "near", value: 0.35 },
      { field: "neckBodyRatio", op: "near", value: 0.12 },
      { field: "bodyAspect", op: "near", value: 1.8, tolerance: 0.1 },
    ],
    limit: 1,
  });
  assert(r.evaluated >= 1);
  assert(r.guarantee.includes("not a global"));
  assert(r.results[0].checks.every((c) => Number.isFinite(c.actual)));
  const impossible = await solveQuery({
    constraints: [
      { field: "eyeCount", op: "eq", value: 0 },
      { field: "pupil", op: "eq", value: "slit" },
    ],
  });
  assert.equal(impossible.status, "conflict");
  assert.throws(() =>
    normalizeQuery({ constraints: [{ field: "hue", op: "near", value: NaN }] }),
  );
  assert.throws(() =>
    normalizeQuery({
      constraints: [{ field: "imaginary", op: "eq", value: 1 }],
    }),
  );
  const range = await solveQuery({
    constraints: [
      { field: "hue", op: "min", value: 100 },
      { field: "hue", op: "max", value: 80 },
    ],
  });
  assert.equal(range.status, "conflict");
  const unrepresentable = await solveQuery({
    constraints: [{ field: "eyeCount", op: "eq", value: 100 }],
    limit: 1,
  });
  assert.equal(unrepresentable.status, "approximate");
  assert(!unrepresentable.results[0].exact);
});
test("closest matches preserve phenotype; pi neighbours advance by prefix", async () => {
  const target = generate("42"),
    r = await solveQuery({ like: "42", limit: 4 });
  for (const x of r.results) {
    assert.equal(x.record.phenotype, target.phenotype);
    assert.notEqual(x.record.identity.seed, "42");
    assert(x.comparison.score > 0.5 && x.comparison.score < 0.99);
  }
  const pi = await solveQuery({ like: "3", limit: 3 });
  assert.deepEqual(
    pi.results.map((r) => r.record.pi.m),
    [2, 3, 4],
  );
  assert.equal(
    (await solveQuery({ like: PI_DIGITS, direction: "backward", limit: 1 }))
      .results[0].record.pi.m,
    999,
  );
  const other = generate("17");
  assert(similarity(target, other).score < 0.7);
});
test("pi endpoint has no observations and conserves human area", () => {
  const r = generate("circle");
  assert.equal(r.kind, "pi-path");
  assert.deepEqual(r.claims, []);
  assert.equal(r.pi.t, 1);
  assert.equal(pathSDF(CIRCLE_RADIUS, 0, 1), 0);
  assert.equal(rarity(r, [generate("42")]), null);
  let area = 0;
  const n = 300,
    s = 2.6 / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (humanSDF((x + 0.5) * s - 1.3, (y + 0.5) * s - 1.3) <= 0)
        area += s * s;
  assert(Math.abs(area - HUMAN_AREA) / HUMAN_AREA < 0.015);
  assert(
    Math.abs(Math.PI * CIRCLE_RADIUS * CIRCLE_RADIUS - HUMAN_AREA) < 1e-12,
  );
});
test("picker skips recent signatures, keeps mapping pure and never discovers pi", () => {
  let n = 8000n;
  const picker = new DiscoveryPicker({ entropy: () => mix64(n++).toString() }),
    recent = [];
  for (let i = 0; i < 100; i++) {
    const r = picker.next(),
      signature = signatureOf(r);
    assert.equal(r.kind, "alien");
    assert(!recent.includes(signature));
    assert.deepEqual(r, generate(r.identity.seed));
    recent.push(signature);
    if (recent.length > 10) recent.shift();
  }
});
test("inverse cancellation is cooperative", async () => {
  let cancelled = false;
  await assert.rejects(
    solveQuery(
      {
        constraints: [{ field: "bodyAspect", op: "near", value: 4 }],
        limit: 12,
      },
      {
        isCancelled: () => cancelled,
        onProgress: () => {
          cancelled = true;
        },
      },
    ),
    { name: "AbortError" },
  );
});
test("recent-history accounting skips duplicates and retrying is bounded", () => {
  const seed = "42",
    record = generate(seed);
  let draws = 0;
  const picker = new DiscoveryPicker({
    entropy: () => {
      draws++;
      return draws === 1 ? seed : "17";
    },
  });
  picker.remember(record);
  picker.remember(record);
  assert.equal(picker.recent.length, 1);
  assert.equal(picker.next().identity.seed, "17");
  assert.equal(picker.lastAttempts, 2);
  const stuck = new DiscoveryPicker({
    entropy: () => seed,
    recent: [signatureOf(record)],
  });
  stuck.next();
  assert.equal(stuck.lastAttempts, 10);
  assert.equal(stuck.exhausted, 1);
});

test("plain pigmentation has zero visible contrast and the endpoint has a closest neighbour", async () => {
  const r = await solveQuery({
    constraints: [{ field: "contrast", op: "eq", value: 0 }],
    limit: 1,
  });
  assert(r.results[0].exact);
  assert.equal(r.results[0].record.measurements.pattern, "Plain");
  assert.equal(
    (await solveQuery({ like: PI_DIGITS, limit: 1 })).results[0].record.pi.m,
    999,
  );
});

test("similarity returns distinct outlines, not texture-only copies of the reported winged specimen", async () => {
  const { outlineDistance } = await import("../src/geometry.js");
  const { MIN_OUTLINE_DISTANCE } = await import("../src/reverse.js");
  for (const seed of ["15746261765410291626", "42", "17"]) {
    const original = generate(seed);
    const result = await solveQuery({ like: seed, limit: 6 });
    assert(result.results.length >= 3);
    const outlines = [original.shapeSignature.anatomy];
    for (const item of result.results) {
      assert.equal(item.record.phenotype, original.phenotype);
      assert(item.comparison.score < 0.99);
      for (const v of outlines)
        assert(
          outlineDistance(v, item.record.shapeSignature.anatomy) >=
            MIN_OUTLINE_DISTANCE,
        );
      outlines.push(item.record.shapeSignature.anatomy);
      assert.deepEqual(
        item.record,
        catalogueRecord(generate(item.record.identity.seed)),
      );
    }
  }
  const broad = await solveQuery({
    like: "42",
    samePhenotype: false,
    limit: 6,
  });
  assert(
    broad.results.some((r) => r.record.phenotype !== generate("42").phenotype),
  );
});

test("tightly constrained searches omit clones and verify any remaining differences", async () => {
  const seed = "42",
    r = generate(seed);
  const constraints = Object.entries(r.measurements)
    .filter(([key]) => FIELDS[key])
    .map(([field, value]) => ({ field, op: "eq", value }));
  const found = await solveQuery({ like: seed, constraints, limit: 2 });
  assert(Number.isInteger(found.diversity.duplicatesSkipped));
  const { outlineDistance } = await import("../src/geometry.js");
  for (const item of found.results) {
    assert(
      outlineDistance(
        r.shapeSignature.anatomy,
        item.record.shapeSignature.anatomy,
      ) >= 0.06,
    );
    assert.equal(
      item.exact,
      item.checks.every((c) => c.met),
    );
  }
  assert.equal(found.diversity.limited, found.results.length < 2);
});

test("discovery ignores changed paint or motifs when the outline cluster repeats", () => {
  const original = generate("42");
  const repainted = {
    ...original,
    motifs: ["different motif"],
    materials: { hue: 123 },
  };
  assert.equal(signatureOf(original), signatureOf(repainted));
});

test("human observations describe the specimen without revealing the hidden mechanism", () => {
  const human = generate("3");
  assert(human.claims.length >= 6);
  assert.match(
    human.claims.map((c) => c.text).join(" "),
    /upper limbs.*lower limbs/,
  );
  for (const m of [1, 2, 14, 100, 999]) {
    const text = generate(piSeed(m))
      .claims.map((c) => c.text)
      .join(" ");
    assert.doesNotMatch(
      text,
      /transform|reconstruct|sequence|pi path|fade|original|human specimens|model assigns/i,
    );
  }
  assert.deepEqual(generate("circle").claims, []);
});
