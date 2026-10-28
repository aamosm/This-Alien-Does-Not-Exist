import { generate } from "../src/engine.js";
import { mix64 } from "../src/random.js";
import {
  silhouette,
  silhouetteVector,
  silhouetteCluster,
  CIRCULARITY_MAX,
  RADIAL_VARIANCE_MIN,
} from "../src/silhouette.js";
import { DiscoveryPicker, signatureOf } from "../src/discovery.js";
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
const count = 2000,
  records = [],
  vectors = [],
  icons = {},
  motifs = {},
  tierB = {},
  repairs = { silhouette: 0, eyes: 0 },
  violations = [];
const seedAt = (i) => mix64(BigInt(i) + 1024n).toString();
for (let i = 0; i < count; i++) {
  const r = generate(seedAt(i)),
    m = r.measurements;
  records.push(r);
  vectors.push(silhouetteVector(r.geometry));
  for (const key of [
    "wings",
    "horns",
    "tailPresent",
    "tentacles",
    "antennae",
    "crest",
    "extraLimbs",
  ])
    if (m[key]) icons[key] = (icons[key] || 0) + 1;
  for (const motif of r.motifs) motifs[motif] = (motifs[motif] || 0) + 1;
  for (const key of [
    "bodyPlan",
    "headModule",
    "limbSet",
    "pattern",
    "eyeCount",
    "eyeStyle",
    "mouth",
    "segmentCount",
    "limbCount",
  ]) {
    tierB[key] ??= {};
    tierB[key][m[key]] = (tierB[key][m[key]] || 0) + 1;
  }
  repairs.silhouette += r.diagnostics.repairs.silhouette > 0;
  repairs.eyes += r.diagnostics.repairs.eyes > 0;
  if (m.circularity > CIRCULARITY_MAX || m.radialVariance < RADIAL_VARIANCE_MIN)
    violations.push(r.identity.seed);
}
function cluster(k) {
  const dim = vectors[0].length,
    distance = (a, b) => {
      let d = 0;
      for (let j = 0; j < dim; j++) d += (a[j] - b[j]) ** 2;
      return d;
    },
    centres = [vectors[0].slice()],
    mins = new Float64Array(count).fill(Infinity);
  for (let j = 1; j < k; j++) {
    let far = 0;
    for (let i = 0; i < count; i++) {
      mins[i] = Math.min(mins[i], distance(vectors[i], centres.at(-1)));
      if (mins[i] > mins[far]) far = i;
    }
    centres.push(vectors[far].slice());
  }
  let labels = [],
    counts = [];
  for (let pass = 0; pass < 10; pass++) {
    const sums = Array.from({ length: k }, () => new Float64Array(dim));
    counts = new Array(k).fill(0);
    labels = [];
    for (let i = 0; i < count; i++) {
      let best = 0,
        d = Infinity;
      for (let j = 0; j < k; j++) {
        const next = distance(vectors[i], centres[j]);
        if (next < d) {
          d = next;
          best = j;
        }
      }
      labels.push(best);
      counts[best]++;
      for (let j = 0; j < dim; j++) sums[best][j] += vectors[i][j];
    }
    for (let j = 0; j < k; j++)
      if (counts[j])
        for (let d = 0; d < dim; d++) centres[j][d] = sums[j][d] / counts[j];
  }
  return {
    k,
    largest: Math.max(...counts),
    largestFraction: Math.max(...counts) / count,
    counts,
    labels,
    centres,
  };
}
console.log("Clustering 2,000 raster silhouettes…");
const forty = cluster(40),
  clusters = cluster(96);
if (process.argv.includes("--write-clusters")) {
  await writeFile(
    "src/silhouette-clusters.js",
    "// k-means centers trained on 2,000 silhouettes\n// rebuild: node scripts/audit.mjs --write-clusters\nexport const SILHOUETTE_CENTRES = " +
      JSON.stringify(
        clusters.centres.map((c) => c.map((x) => Number(x.toFixed(5)))),
      ) +
      ";\n",
  );
  console.log(
    "Wrote 96 fixed silhouette prototypes. Generation mapping is unchanged.",
  );
  process.exit(0);
}
if (process.argv.includes("--clusters-only")) {
  console.log(
    JSON.stringify({
      k40: forty.largestFraction,
      k80: cluster(80).largestFraction,
      k96: clusters.largestFraction,
    }),
  );
  process.exit(0);
}
await mkdir("docs/images", { recursive: true });
let server, browser;
try {
  server = spawn(process.execPath, ["scripts/serve.mjs", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const origin = await new Promise((resolve) =>
    server.stdout.once("data", (d) =>
      resolve(String(d).match(/http:\/\/\S+/)[0]),
    ),
  );
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1400 },
  });
  await page.goto(origin + "/tests/gallery.html");
  const rendered = await page.evaluate(
    async (seeds) => {
      const { generate } = await import("/src/engine.js"),
        { render } = await import("/src/render.js"),
        { renderSkin } = await import("/src/skin-render.js");
      const c = document.createElement("canvas");
      c.width = c.height = 32;
      let n = 0;
      for (const seed of seeds) {
        const r = generate(seed);
        render(c.getContext("2d"), r, 32, 32, { background: false });
        if (
          c
            .getContext("2d")
            .getImageData(0, 0, 32, 32)
            .data.some((v, i) => i % 4 === 3 && v)
        )
          n++;
      }
      document.body.replaceChildren();
      document.body.style.cssText =
        "margin:0;padding:20px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px;background:#101010;color:#aaa;font:10px monospace";
      for (const seed of seeds.filter((_, i) => i % 40 === 0)) {
        const r = generate(seed),
          box = document.createElement("div"),
          canvas = document.createElement("canvas"),
          label = document.createElement("p");
        canvas.width = canvas.height = 220;
        canvas.style.cssText = "width:100%;height:auto";
        label.textContent = seed;
        box.append(canvas, label);
        document.body.append(box);
        await renderSkin(canvas.getContext("2d"), r, 220, 220);
      }
      return n;
    },
    records.map((r) => r.identity.seed),
  );
  assert.equal(rendered, 2000);
  await page.screenshot({
    path: "docs/images/contact-sheet.png",
    fullPage: true,
  });
} finally {
  await browser?.close();
  server?.kill();
}
console.log("Simulating 10,000 independent sessions of 20 clicks…");
const deployedCounts = new Array(clusters.k).fill(0);
for (const r of records) deployedCounts[silhouetteCluster(r.geometry)]++;
// Independent deterministic session ranges allow parallel verification without shared RNG state.
const workerCount = Math.min(4, availableParallelism());
const batches = await Promise.all(
  Array.from({ length: workerCount }, (_, i) => {
    const from = Math.floor((i * 10000) / workerCount);
    const to = Math.floor(((i + 1) * 10000) / workerCount);
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("./click-audit-worker.mjs", import.meta.url),
        { workerData: { from, to } },
      );
      worker.on("message", (data) => {
        if (data.finished) resolve(data);
        else
          console.log(`Session batch ${i + 1}: ${data.complete}/${to - from}`);
      });
      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0) reject(new Error(`Click audit worker exited ${code}`));
      });
    });
  }),
);
const repeat = batches.reduce((s, r) => s + r.repeat, 0);
const resamples = batches.reduce((s, r) => s + r.resamples, 0);
const exhaustions = batches.reduce((s, r) => s + r.exhaustions, 0);
const result = {
  count,
  schedule: "mix64(index + 1024)",
  rendered: count,
  clustering: {
    method:
      "unconstrained k-means of 32px masks pooled to 16px and L2-normalised; farthest-point initialization, 10 iterations",
    diagnostic40: { k: 40, largestFraction: forty.largestFraction },
    k: clusters.k,
    largestFraction: clusters.largestFraction,
    counts: clusters.counts,
    deployed: {
      k: deployedCounts.length,
      counts: deployedCounts,
      largestFraction: Math.max(...deployedCounts) / count,
    },
  },
  tierA: Object.fromEntries(
    Object.entries(icons).map(([k, n]) => [
      k,
      { count: n, fraction: n / count, budget: k === "wings" ? 0.01 : 0.02 },
    ]),
  ),
  motifs: {
    pool: 96,
    maxCount: Math.max(...Object.values(motifs)),
    maxFraction: Math.max(...Object.values(motifs)) / count,
    counts: motifs,
  },
  tierB,
  tierBBudget: {
    minimum: 0.03,
    maximum: 0.1,
    checked: Object.keys(tierB).filter((key) => key !== "limbCount"),
    exception:
      "Actual limb counts cannot all occupy 3–10% while extra limbs are limited to 2%. The 12 limb-arrangement modules follow the Tier B budget; counts are reported without a false pass claim.",
  },
  repairs,
  circularity: {
    maximum: CIRCULARITY_MAX,
    radialVarianceMinimum: RADIAL_VARIANCE_MIN,
    violations,
  },
  sessions: {
    sessions: 10000,
    clicks: 200000,
    window: 10,
    signature:
      "silhouette cluster only; markings and motif names do not excuse a repeat",
    schedule:
      "session i draws mix64((i + 1) * 100000 + draw), up to 10 attempts per click",
    repeats: repeat,
    resamples,
    exhaustions,
    repeatFraction: repeat / 200000,
  },
  contactSheet: "images/contact-sheet.png",
  limits:
    "Statistical audit of this deterministic schedule, not a proof that every possible seed satisfies a population budget. Silhouette repair is enforced for each ordinary creature. Rare feature budgets describe random discovery, not explicit inverse queries.",
};
await writeFile(
  "docs/diversity-audit.json",
  JSON.stringify(result, null, 2) + "\n",
);
assert(
  clusters.largestFraction <= 0.04,
  `Largest silhouette cluster ${clusters.largestFraction}`,
);
assert(
  Math.max(...deployedCounts) / count <= 0.04,
  "Deployed silhouette prototypes exceed the cluster budget; review and retrain deliberately.",
);
for (const [k, n] of Object.entries(icons))
  assert(n / count <= (k === "wings" ? 0.01 : 0.02), `${k} frequency exceeded`);
for (const key of result.tierBBudget.checked)
  for (const [option, n] of Object.entries(tierB[key]))
    assert(
      n / count >= 0.03 && n / count <= 0.1,
      `${key}: ${option} outside Tier B frequency budget`,
    );
assert(Math.max(...Object.values(motifs)) / count <= 0.04);
assert.equal(violations.length, 0);
console.log(
  JSON.stringify(
    {
      largestCluster: clusters.largestFraction,
      tierA: result.tierA,
      maxMotif: result.motifs.maxFraction,
      repairs,
      sessions: result.sessions,
    },
    null,
    2,
  ),
);
